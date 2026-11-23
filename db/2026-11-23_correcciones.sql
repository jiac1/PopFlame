-- =========================================================
-- PopFlame · Correcciones (revisión de noviembre 2026)
-- Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > New query > Run
-- (después de 2026-11-16_estados_producto.sql). Se puede volver a ejecutar.
--
-- Qué corrige:
--   1. Checkout: los productos con estado "Agotado" ya no se pueden comprar aunque
--      tengan stock cargado (antes create_order los aceptaba).
--   2. Login del panel: email_for_username solo responde para cuentas ACTIVAS, así
--      una cuenta pendiente o desconocida no revela su correo a cualquiera.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Checkout
-- ---------------------------------------------------------
create or replace function public.create_order(p_customer jsonb, p_items jsonb)
returns table (order_number text, total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
    v_item jsonb;
    v_product public.products%rowtype;
    v_product_id bigint;
    v_qty integer;
    v_total_qty integer;
    v_available integer;
    v_status text;
    v_items jsonb := '[]'::jsonb;
    v_subtotal numeric := 0;
    v_shipping numeric := 0;
    v_cfg public.config%rowtype;
    v_name text := left(trim(coalesce(p_customer->>'name', '')), 120);
    v_email text := left(lower(trim(coalesce(p_customer->>'email', ''))), 160);
    v_phone text := left(trim(coalesce(p_customer->>'phone', '')), 40);
    v_meeting text := nullif(left(trim(coalesce(p_customer->>'meetingPoint', '')), 120), '');
    v_note text := nullif(left(trim(coalesce(p_customer->>'note', '')), 600), '');
    v_order public.orders%rowtype;
begin
    if length(v_name) < 2 then raise exception 'Nombre inválido'; end if;
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Correo inválido'; end if;
    if length(regexp_replace(v_phone, '\D', '', 'g')) < 8 then raise exception 'Teléfono inválido'; end if;
    if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'El carrito está vacío'; end if;
    if jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;
    if jsonb_array_length(p_items) > 50 then raise exception 'Demasiados productos'; end if;

    -- Cantidades corruptas se rechazan antes de tocar el stock.
    for v_item in select value from jsonb_array_elements(p_items) as entry(value) loop
        if jsonb_typeof(v_item) is distinct from 'object'
           or coalesce(v_item->>'productId', '') !~ '^[1-9][0-9]*$'
           or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
            raise exception 'Producto o cantidad inválidos';
        end if;
        v_qty := (v_item->>'quantity')::integer;
        if v_qty > 99 then raise exception 'La cantidad máxima por producto es 99'; end if;
    end loop;

    -- Freno contra pedidos falsos en masa: 5 por hora por cliente, 20 por minuto total.
    if (select count(*) from public.orders
         where (customer_email = v_email or regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
           and created_at > now() - interval '1 hour') >= 5 then
        raise exception 'Recibimos varios pedidos seguidos con estos datos. Escríbenos por WhatsApp y lo resolvemos.';
    end if;
    if (select count(*) from public.orders where created_at > now() - interval '1 minute') >= 20 then
        raise exception 'Hay muchos pedidos en este momento. Intenta de nuevo en un minuto.';
    end if;

    -- Stock: los productos 'a_pedido' se aceptan siempre (se hacen por encargo).
    for v_product_id, v_total_qty in
        select (item->>'productId')::bigint, sum((item->>'quantity')::integer)::integer
          from jsonb_array_elements(p_items) as entry(item)
         group by 1 order by 1
    loop
        select stock, status into v_available, v_status
          from public.products where id = v_product_id for update;
        if not found then raise exception 'Un producto del carrito ya no existe'; end if;
        -- "Agotado" es un estado manual: no se vende aunque quede stock cargado.
        if v_status = 'agotado' then
            raise exception 'Uno de los productos del carrito está agotado';
        end if;
        if v_total_qty > v_available and (v_status is null or v_status <> 'a_pedido') then
            raise exception 'Uno de los productos del carrito ya no tiene stock suficiente';
        end if;
    end loop;

    for v_item in select value from jsonb_array_elements(p_items) as entry(value) loop
        v_qty := (v_item->>'quantity')::integer;
        select * into v_product from public.products where id = (v_item->>'productId')::bigint;
        if not found then raise exception 'Un producto del carrito ya no existe'; end if;
        if cardinality(v_product.sizes) > 0
           and not (coalesce(v_item->>'size', '') = any(v_product.sizes)) then
            raise exception 'Una talla del carrito ya no está disponible';
        end if;
        if cardinality(v_product.colors) > 0
           and not (coalesce(v_item->>'color', '') = any(v_product.colors)) then
            raise exception 'Un color del carrito ya no está disponible';
        end if;

        v_subtotal := v_subtotal + v_product.price * v_qty;
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'productId', v_product.id,
            'name', v_product.name,
            'price', v_product.price,
            'size', left(coalesce(v_item->>'size', ''), 20),
            'color', left(coalesce(v_item->>'color', ''), 40),
            'quantity', v_qty,
            'image', v_product.image
        ));
    end loop;

    select * into v_cfg from public.config where id = 1;
    if coalesce(v_cfg.shipping_cost, 0) > 0
       and not (coalesce(v_cfg.free_shipping_min, 0) > 0 and v_subtotal >= v_cfg.free_shipping_min) then
        v_shipping := v_cfg.shipping_cost;
    end if;

    insert into public.orders (customer_name, customer_email, customer_phone, customer_address, note,
                               items, subtotal, shipping, total, status, payment_method, stock_applied)
    values (v_name, v_email, v_phone, v_meeting, v_note,
            v_items, v_subtotal, v_shipping, v_subtotal + v_shipping, 'pending', 'transfer', false)
    returning * into v_order;

    return query select v_order.order_number, v_order.total;
end;
$$;

revoke all on function public.create_order(jsonb, jsonb) from public;
grant execute on function public.create_order(jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------
-- 2. Login con nombre de usuario (solo cuentas activas)
-- ---------------------------------------------------------
create or replace function public.email_for_username(p_username text)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
    select u.email::text
      from auth.users u
      join public.profiles p on p.id = u.id
     where lower(p.username) = lower(trim(p_username))
       and p.status = 'active'
     limit 1;
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

commit;
