-- Fase 1 / checkout. Aplicar después de revisar pg_get_functiondef(create_order)
-- y probar esta versión en staging. Mantiene firma y resultado del RPC existente.
-- No reservar stock ni cambiar el flujo de consultas: el descuento sigue al pagar.
begin;
create or replace function public.create_order(p_customer jsonb, p_items jsonb)
returns table (order_number text, total numeric)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
    v_item jsonb;
    v_product public.products%rowtype;
    v_qty int;
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
    if jsonb_typeof(p_customer) is distinct from 'object' then raise exception 'Cliente inválido'; end if;
    if length(v_name) < 2 then raise exception 'Nombre inválido'; end if;
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Correo inválido'; end if;
    if length(regexp_replace(v_phone, '\D', '', 'g')) < 8 then raise exception 'Teléfono inválido'; end if;
    if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'El carrito está vacío'; end if;
    if jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;
    if jsonb_array_length(p_items) > 50 then raise exception 'Demasiados productos'; end if;

    -- Rechazar cantidades ausentes, negativas, fraccionarias o exageradas ANTES
    -- de sumar stock. Antes se sumaban valores crudos y luego se recortaban a 1..99.
    for v_item in select value from jsonb_array_elements(p_items) loop
        if jsonb_typeof(v_item) is distinct from 'object'
           or coalesce(v_item->>'productId', '') !~ '^[1-9][0-9]{0,17}$'
           or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]?$' then
            raise exception 'Producto o cantidad inválida';
        end if;
    end loop;

    -- Serializa las comprobaciones de límites + inserción para evitar su bypass
    -- concurrente. No bloquea inventario, no reserva unidades.
    perform pg_catalog.pg_advisory_xact_lock(70611, 2);
    if (select count(*) from public.orders
        where (customer_email = v_email or regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
        and created_at > now() - interval '1 hour') >= 5 then
        raise exception 'Recibimos varios pedidos seguidos con estos datos. Escríbenos por WhatsApp y lo resolvemos.';
    end if;
    if (select count(*) from public.orders where created_at > now() - interval '1 minute') >= 20 then
        raise exception 'Hay muchos pedidos en este momento. Intenta de nuevo en un minuto.';
    end if;

    -- Filas compartidas impiden que cambie el precio/stock mientras se toma el
    -- snapshot del pedido. Orden por id para evitar bloqueos en distinto orden.
    perform p.id from public.products p
        where p.id in (select (i->>'productId')::bigint from jsonb_array_elements(p_items) i)
        order by p.id for share;
    if exists (
        select 1 from (
            select (i->>'productId')::bigint pid, sum((i->>'quantity')::int) qty
            from jsonb_array_elements(p_items) i group by 1
        ) q join public.products p on p.id = q.pid where q.qty > p.stock
    ) then raise exception 'Uno de los productos ya no tiene stock suficiente'; end if;

    for v_item in select value from jsonb_array_elements(p_items) loop
        v_qty := (v_item->>'quantity')::int;
        select * into v_product from public.products where id = (v_item->>'productId')::bigint;
        if not found then raise exception 'Un producto del carrito ya no existe'; end if;
        -- Las variantes siguen siendo las seleccionadas por el cliente; no se
        -- introduce inventario por talla ni se cambia el modo bajo consulta.
        v_subtotal := v_subtotal + v_product.price * v_qty;
        v_items := v_items || jsonb_build_object(
            'productId', v_product.id, 'name', v_product.name, 'price', v_product.price,
            'size', left(coalesce(v_item->>'size', ''), 20),
            'color', left(coalesce(v_item->>'color', ''), 40),
            'quantity', v_qty, 'image', v_product.image
        );
    end loop;
    select * into v_cfg from public.config where id = 1;
    if coalesce(v_cfg.shipping_cost, 0) > 0
       and not (coalesce(v_cfg.free_shipping_min, 0) > 0 and v_subtotal >= v_cfg.free_shipping_min) then
        v_shipping := v_cfg.shipping_cost;
    end if;
    insert into public.orders (customer_name, customer_email, customer_phone, customer_address, note,
                               items, subtotal, shipping, total, status, payment_method)
    values (v_name, v_email, v_phone, v_meeting, v_note,
            v_items, v_subtotal, v_shipping, v_subtotal + v_shipping, 'pending', 'transfer')
    returning * into v_order;
    return query select v_order.order_number, v_order.total;
end;
$$;
revoke all on function public.create_order(jsonb, jsonb) from public;
grant execute on function public.create_order(jsonb, jsonb) to anon, authenticated;

-- El propietario del RPC SECURITY DEFINER inserta saltándose RLS. Los clientes
-- deben usar el RPC; una policy permisiva residual no puede reabrir el INSERT.
drop policy if exists orders_insert_public on public.orders;
drop policy if exists phase1_orders_insert_guard on public.orders;
create policy phase1_orders_insert_guard on public.orders as restrictive
    for insert to public with check (false);
revoke insert on public.orders from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
