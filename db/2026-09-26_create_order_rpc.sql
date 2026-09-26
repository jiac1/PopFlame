-- =========================================================
-- PopFlame - Función segura para crear pedidos desde el checkout
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run  (se puede correr más de una vez)
--
-- Por qué:
--  1. El checkout necesita el número de pedido (PF-0001) para mostrarlo y mandarlo por WhatsApp,
--     pero un cliente sin sesión no tiene permiso de LEER la tabla orders (y está bien que no lo tenga).
--  2. Antes el precio y el total los mandaba el navegador: alguien podía modificarlos.
--     Ahora el servidor toma nombre, precio y stock directo de la tabla products y calcula el total.
-- =========================================================

create or replace function public.create_order(p_customer jsonb, p_items jsonb)
returns table (order_number text, total numeric)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_item        jsonb;
    v_product     public.products%rowtype;
    v_qty         int;
    v_items       jsonb := '[]'::jsonb;
    v_subtotal    numeric := 0;
    v_shipping    numeric := 0;
    v_cfg         public.config%rowtype;
    v_name        text := left(trim(coalesce(p_customer->>'name', '')), 120);
    v_email       text := left(lower(trim(coalesce(p_customer->>'email', ''))), 160);
    v_phone       text := left(trim(coalesce(p_customer->>'phone', '')), 40);
    v_meeting     text := nullif(left(trim(coalesce(p_customer->>'meetingPoint', '')), 120), '');
    v_note        text := nullif(left(trim(coalesce(p_customer->>'note', '')), 600), '');
    v_order       public.orders%rowtype;
begin
    if length(v_name) < 2 then raise exception 'Nombre inválido'; end if;
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Correo inválido'; end if;
    if length(regexp_replace(v_phone, '\D', '', 'g')) < 8 then raise exception 'Teléfono inválido'; end if;
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;
    if jsonb_array_length(p_items) > 50 then raise exception 'Demasiados productos'; end if;

    -- Stock: suma de cantidades por producto (un mismo producto puede venir en varias tallas)
    perform 1
    from (
        select (i->>'productId')::bigint as pid, sum((i->>'quantity')::int) as qty
        from jsonb_array_elements(p_items) i
        group by 1
    ) t
    join public.products p on p.id = t.pid
    where t.qty > p.stock;
    if found then raise exception 'Uno de los productos ya no tiene stock suficiente'; end if;

    for v_item in select * from jsonb_array_elements(p_items) loop
        v_qty := greatest(1, least(coalesce((v_item->>'quantity')::int, 1), 99));
        select * into v_product from public.products where id = (v_item->>'productId')::bigint;
        if not found then raise exception 'Un producto del carrito ya no existe'; end if;

        v_subtotal := v_subtotal + v_product.price * v_qty;
        v_items := v_items || jsonb_build_object(
            'productId', v_product.id,
            'name', v_product.name,
            'price', v_product.price,
            'size', left(coalesce(v_item->>'size', ''), 20),
            'color', left(coalesce(v_item->>'color', ''), 40),
            'quantity', v_qty,
            'image', v_product.image
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
