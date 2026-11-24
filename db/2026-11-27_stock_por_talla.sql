-- =========================================================
-- PopFlame · Stock por talla (noviembre 2026)
--
-- Cada producto sigue teniendo su stock TOTAL (products.stock) y ahora puede tener además
-- stock por talla (products.size_stock), por ejemplo: 30 polerones en total y
-- {"S": 5, "M": 10, "L": 10, "XL": 5}. Los dos se ven y se ajustan por separado en el panel.
--
-- Al marcar un pedido como pagado se descuenta del total (como siempre) Y de la talla vendida.
-- Al cancelarlo se repone exactamente lo que se descontó en ambos.
--
-- Reglas:
--   * Una talla "lleva stock" solo si tiene su clave en size_stock. Sin clave, esa talla no tiene
--     límite propio y solo cuenta el total (así funcionan los productos de antes, sin cambios).
--   * "A Pedido" no descuenta ni valida stock (ni total ni por talla).
--   * Cada cambio de stock por talla queda en inventory_movements con su talla (columna size).
--
-- Requiere db/2026-11-25_auditoria.sql. Se puede correr más de una vez.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------
-- {"S": 5, "M": 10}: cada valor es un entero de 0 a 999999 y cada talla tiene hasta 20 caracteres.
create or replace function public.valid_size_stock(p jsonb)
returns boolean
language sql immutable set search_path = public, pg_temp as $$
    select p is not null and jsonb_typeof(p) = 'object' and not exists (
        select 1 from jsonb_each(p) as e(key, value)
         where length(trim(e.key)) = 0 or length(e.key) > 20
            or jsonb_typeof(e.value) <> 'number'
            or e.value::text !~ '^[0-9]{1,6}$'
    );
$$;

alter table public.products add column if not exists size_stock jsonb not null default '{}'::jsonb;
alter table public.products drop constraint if exists products_size_stock_check;
alter table public.products add constraint products_size_stock_check
    check (public.valid_size_stock(size_stock));

-- Movimientos de inventario: null = stock total, 'M' = stock de la talla M.
alter table public.inventory_movements add column if not exists size text;

-- ---------------------------------------------------------
-- 2. Historial: registra los cambios del total y de cada talla
-- ---------------------------------------------------------
create or replace function public.track_product_stock_change()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_reason text;
    v_order_id bigint;
    v_actor_name text;
    v_size text;
    v_before integer;
    v_after integer;
begin
    if new.stock is not distinct from old.stock and new.size_stock is not distinct from old.size_stock then
        return new;
    end if;

    v_reason := coalesce(nullif(current_setting('popflame.stock_reason', true), ''), 'Ajuste directo');
    begin
        v_order_id := nullif(current_setting('popflame.stock_order_id', true), '')::bigint;
    exception when invalid_text_representation then
        v_order_id := null;
    end;
    select coalesce(name, username) into v_actor_name from public.profiles where id = auth.uid();

    if new.stock is distinct from old.stock then
        insert into public.inventory_movements
            (product_id, product_name, size, stock_before, stock_after, delta, reason, order_id, actor_id, actor_name)
        values
            (new.id, new.name, null, old.stock, new.stock, new.stock - old.stock, left(v_reason, 120),
             v_order_id, auth.uid(), coalesce(v_actor_name, 'Sistema'));
    end if;

    if new.size_stock is distinct from old.size_stock then
        for v_size in
            select k from jsonb_object_keys(coalesce(old.size_stock, '{}'::jsonb)) as a(k)
            union
            select k from jsonb_object_keys(coalesce(new.size_stock, '{}'::jsonb)) as b(k)
            order by 1
        loop
            v_before := coalesce((old.size_stock->>v_size)::integer, 0);
            v_after := coalesce((new.size_stock->>v_size)::integer, 0);
            if v_before <> v_after then
                insert into public.inventory_movements
                    (product_id, product_name, size, stock_before, stock_after, delta, reason, order_id, actor_id, actor_name)
                values
                    (new.id, new.name, v_size, v_before, v_after, v_after - v_before, left(v_reason, 120),
                     v_order_id, auth.uid(), coalesce(v_actor_name, 'Sistema'));
            end if;
        end loop;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_products_stock_audit on public.products;
create trigger trg_products_stock_audit
    after update of stock, size_stock on public.products
    for each row execute procedure public.track_product_stock_change();

-- ---------------------------------------------------------
-- 3. Ajuste manual desde el panel (total y/o tallas), con control de concurrencia
-- ---------------------------------------------------------
-- Los dos parámetros nuevos son opcionales: el panel anterior la sigue llamando con 4.
drop function if exists public.set_product_stock(bigint, integer, integer, text);

create or replace function public.set_product_stock(
    p_product_id bigint,
    p_stock integer,
    p_expected_stock integer,
    p_reason text default 'Ajuste manual',
    p_size_stock jsonb default null,
    p_expected_size_stock jsonb default null
)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_current_stock integer;
    v_current_sizes jsonb;
    v_sizes text[];
    v_saved_stock integer;
    v_reason text;
    v_key text;
begin
    if not public.is_admin() then raise exception 'No autorizado para ajustar inventario'; end if;
    if p_stock is null or p_stock < 0 then raise exception 'El stock debe ser un entero desde cero'; end if;
    if p_expected_stock is null or p_expected_stock < 0 then raise exception 'Falta el stock esperado'; end if;
    if p_size_stock is not null and not public.valid_size_stock(p_size_stock) then
        raise exception 'El stock de cada talla debe ser un número entero desde cero';
    end if;

    select stock, size_stock, sizes into v_current_stock, v_current_sizes, v_sizes
      from public.products where id = p_product_id for update;
    if not found then raise exception 'El producto ya no existe'; end if;
    if v_current_stock <> p_expected_stock then
        raise exception using errcode = '40001', message = 'El stock cambió en otra sesión; actualiza la vista e inténtalo de nuevo';
    end if;
    if p_size_stock is not null then
        if p_expected_size_stock is distinct from v_current_sizes then
            raise exception using errcode = '40001', message = 'El stock por talla cambió en otra sesión; actualiza la vista e inténtalo de nuevo';
        end if;
        for v_key in select jsonb_object_keys(p_size_stock) loop
            if not (v_key = any(v_sizes)) then
                raise exception 'La talla % no está entre las tallas del producto', v_key;
            end if;
        end loop;
    end if;
    if p_stock = v_current_stock and (p_size_stock is null or p_size_stock = v_current_sizes) then
        return v_current_stock;
    end if;

    v_reason := left(coalesce(nullif(trim(p_reason), ''), 'Ajuste manual'), 120);
    perform set_config('popflame.stock_reason', v_reason, true);
    perform set_config('popflame.stock_order_id', '', true);
    update public.products
       set stock = p_stock, size_stock = coalesce(p_size_stock, size_stock)
     where id = p_product_id
    returning stock into v_saved_stock;
    perform set_config('popflame.stock_reason', '', true);
    perform set_config('popflame.stock_order_id', '', true);
    return v_saved_stock;
end;
$$;

revoke all on function public.set_product_stock(bigint, integer, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.set_product_stock(bigint, integer, integer, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------
-- 4. Pedido pagado / cancelado: descuenta y repone total y talla
-- ---------------------------------------------------------
create or replace function public.orders_apply_stock()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_product_id bigint;
    v_size text;
    v_quantity integer;
    v_is_paid boolean := new.status in ('confirmed', 'processing', 'shipped', 'delivered');
    v_stock integer;
    v_size_stock jsonb;
    v_status text;
    v_name text;
    v_left integer;
begin
    if old.stock_applied and new.items is distinct from old.items then
        raise exception 'No se pueden cambiar los productos de un pedido con stock aplicado';
    end if;

    if v_is_paid and not old.stock_applied then
        -- Total del producto
        for v_product_id, v_quantity in
            select (item->>'productId')::bigint, sum((item->>'quantity')::integer)::integer
              from jsonb_array_elements(new.items) as line(item)
             group by 1 order by 1
        loop
            if v_quantity is null or v_quantity <= 0 then
                raise exception 'Cantidad inválida en el pedido %', new.order_number;
            end if;
            perform set_config('popflame.stock_reason', 'Pedido ' || new.order_number || ' pagado', true);
            perform set_config('popflame.stock_order_id', new.id::text, true);
            update public.products
               set stock = stock - v_quantity
             where id = v_product_id and stock >= v_quantity
               and (status is null or status <> 'a_pedido')
            returning stock into v_stock;
            if not found and exists (
                select 1 from public.products
                 where id = v_product_id and (status is null or status <> 'a_pedido')
            ) then
                raise exception 'Stock insuficiente para completar el pedido %', new.order_number;
            end if;
            perform set_config('popflame.stock_reason', '', true);
            perform set_config('popflame.stock_order_id', '', true);
        end loop;

        -- Talla vendida (solo si esa talla lleva stock propio)
        for v_product_id, v_size, v_quantity in
            select (item->>'productId')::bigint, item->>'size', sum((item->>'quantity')::integer)::integer
              from jsonb_array_elements(new.items) as line(item)
             where coalesce(item->>'size', '') <> ''
             group by 1, 2 order by 1, 2
        loop
            select size_stock, status, name into v_size_stock, v_status, v_name
              from public.products where id = v_product_id for update;
            continue when not found or v_status = 'a_pedido' or not (v_size_stock ? v_size);
            v_left := (v_size_stock->>v_size)::integer - v_quantity;
            if v_left < 0 then
                raise exception 'No queda stock suficiente de la talla % de "%" para el pedido %', v_size, v_name, new.order_number;
            end if;
            perform set_config('popflame.stock_reason', 'Pedido ' || new.order_number || ' pagado', true);
            perform set_config('popflame.stock_order_id', new.id::text, true);
            update public.products
               set size_stock = jsonb_set(size_stock, array[v_size], to_jsonb(v_left))
             where id = v_product_id;
            perform set_config('popflame.stock_reason', '', true);
            perform set_config('popflame.stock_order_id', '', true);
        end loop;
        new.stock_applied := true;

    elsif not v_is_paid and old.stock_applied then
        if exists (select 1 from public.inventory_movements where order_id = new.id) then
            -- Se repone exactamente lo que este pedido descontó (neto de reversas anteriores),
            -- en el total (size null) y en cada talla. No importa si el producto cambió de
            -- estado entre el pago y la cancelación.
            for v_product_id, v_size, v_quantity in
                select product_id, size, (-sum(delta))::integer
                  from public.inventory_movements
                 where order_id = new.id and product_id is not null
                 group by 1, 2
                having sum(delta) < 0
                 order by 1, 2 nulls first
            loop
                perform set_config('popflame.stock_reason', 'Reversa del pedido ' || new.order_number, true);
                perform set_config('popflame.stock_order_id', new.id::text, true);
                if v_size is null then
                    update public.products set stock = stock + v_quantity where id = v_product_id;
                else
                    -- Si la talla dejó de llevar stock propio después del pago, no se vuelve a crear.
                    update public.products
                       set size_stock = jsonb_set(size_stock, array[v_size],
                                                  to_jsonb(coalesce((size_stock->>v_size)::integer, 0) + v_quantity))
                     where id = v_product_id and size_stock ? v_size;
                end if;
                perform set_config('popflame.stock_reason', '', true);
                perform set_config('popflame.stock_order_id', '', true);
            end loop;
        else
            -- Pedidos pagados antes de que existiera el historial de inventario: se repone
            -- el total según los productos del pedido, como antes.
            for v_product_id, v_quantity in
                select (item->>'productId')::bigint, sum((item->>'quantity')::integer)::integer
                  from jsonb_array_elements(new.items) as line(item)
                 group by 1 order by 1
            loop
                if v_quantity is null or v_quantity <= 0 then
                    raise exception 'Cantidad inválida en el pedido %', new.order_number;
                end if;
                perform set_config('popflame.stock_reason', 'Reversa del pedido ' || new.order_number, true);
                perform set_config('popflame.stock_order_id', new.id::text, true);
                update public.products
                   set stock = stock + v_quantity
                 where id = v_product_id
                   and (status is null or status <> 'a_pedido');
                perform set_config('popflame.stock_reason', '', true);
                perform set_config('popflame.stock_order_id', '', true);
            end loop;
        end if;
        new.stock_applied := false;
    end if;
    return new;
end;
$$;

-- ---------------------------------------------------------
-- 5. Checkout: valida también el stock de la talla
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
    v_size text;
    v_size_stock jsonb;
    v_pname text;
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

    -- Stock total: los productos 'a_pedido' se aceptan siempre (se hacen por encargo).
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

    -- Stock por talla: solo las tallas que llevan stock propio.
    for v_product_id, v_size, v_total_qty in
        select (item->>'productId')::bigint, coalesce(item->>'size', ''), sum((item->>'quantity')::integer)::integer
          from jsonb_array_elements(p_items) as entry(item)
         group by 1, 2 order by 1, 2
    loop
        select size_stock, status, name into v_size_stock, v_status, v_pname
          from public.products where id = v_product_id;
        if v_size <> '' and (v_status is null or v_status <> 'a_pedido') and v_size_stock ? v_size
           and v_total_qty > (v_size_stock->>v_size)::integer then
            raise exception 'La talla % de "%" ya no tiene stock suficiente', v_size, v_pname;
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

-- Las funciones de trigger no se llaman por la API.
revoke execute on function public.track_product_stock_change() from public, anon, authenticated;
revoke execute on function public.orders_apply_stock() from public, anon, authenticated;

-- PostgREST: que vea la columna nueva y la firma nueva de set_product_stock.
notify pgrst, 'reload schema';

commit;
