-- PopFlame · seguridad de perfiles, categorías e inventario
-- Ejecutar una sola vez en Supabase SQL Editor después de la actualización local.
-- Seguro para volver a ejecutar.
begin;

-- ---------------------------------------------------------
-- Perfiles: solo hay dos roles asignables. Pendiente es un estado, no un rol.
-- ---------------------------------------------------------
alter table public.profiles add column if not exists status text;
update public.profiles
   set role = 'admin', status = 'pending'
 where role is null or role not in ('admin', 'super_admin');
update public.profiles
   set status = case
       when status = 'active' then 'active'
       when status = 'pending' then 'pending'
       when status is null then 'active'
       else 'pending'
   end;
alter table public.profiles alter column role set default 'admin';
alter table public.profiles alter column status set default 'pending';
alter table public.profiles alter column status set not null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
    check (role in ('admin', 'super_admin'));
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
    check (status in ('active', 'pending'));

create or replace function public.current_role_name()
returns text
language sql stable security definer set search_path = public, pg_temp as $$
    select role from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
    select exists (
        select 1 from public.profiles
         where id = auth.uid() and status = 'active' and role in ('admin', 'super_admin')
    );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
    select exists (
        select 1 from public.profiles
         where id = auth.uid() and status = 'active' and role = 'super_admin'
    );
$$;

-- No se promociona automáticamente la primera cuenta: toda cuenta nueva queda pendiente.
-- El propietario activa el primer Super Admin desde SQL Editor; las siguientes se aprueban en Usuarios.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_username text := lower(split_part(coalesce(new.email, ''), '@', 1));
begin
    if v_username = '' then raise exception 'El usuario necesita un correo válido'; end if;
    insert into public.profiles (id, username, role, status, name)
    values (new.id, v_username, 'admin', 'pending', v_username)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- La antigua RPC pública devolvía el correo real asociado a cualquier nombre de usuario.
drop function if exists public.email_for_username(text);

create or replace function public.protect_last_super_admin()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_other_active_super_admins integer;
begin
    if auth.uid() is not null
       and (new.role is distinct from old.role
            or new.status is distinct from old.status
            or new.username is distinct from old.username)
       and not public.is_super_admin() then
        raise exception 'Solo un Super Admin activo puede cambiar roles, estados o nombres de usuario';
    end if;

    if old.role = 'super_admin' and old.status = 'active'
       and (new.role is distinct from 'super_admin' or new.status is distinct from 'active') then
        perform pg_advisory_xact_lock(hashtext('popflame-last-super-admin')::bigint);
        select count(*) into v_other_active_super_admins
          from public.profiles
         where role = 'super_admin' and status = 'active' and id <> old.id;
        if v_other_active_super_admins = 0 then
            raise exception 'Debe quedar al menos un Super Admin activo';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_protect_last_super_admin on public.profiles;
create trigger trg_protect_last_super_admin
    before update on public.profiles
    for each row execute procedure public.protect_last_super_admin();

create or replace function public.protect_last_super_admin_delete()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_other_active_super_admins integer;
begin
    if old.role = 'super_admin' and old.status = 'active' then
        perform pg_advisory_xact_lock(hashtext('popflame-last-super-admin')::bigint);
        select count(*) into v_other_active_super_admins
          from public.profiles
         where role = 'super_admin' and status = 'active' and id <> old.id;
        if v_other_active_super_admins = 0 then
            raise exception 'No se puede eliminar el último Super Admin activo';
        end if;
    end if;
    return old;
end;
$$;

drop trigger if exists trg_protect_last_super_admin_delete on public.profiles;
create trigger trg_protect_last_super_admin_delete
    before delete on public.profiles
    for each row execute procedure public.protect_last_super_admin_delete();

-- ---------------------------------------------------------
-- Categorías: Admin y Super Admin pueden administrar.
-- ---------------------------------------------------------
drop policy if exists "categories_write_super_admin" on public.categories;
drop policy if exists "categories_write_admins" on public.categories;
create policy "categories_write_admins" on public.categories
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- Pedidos: nadie puede insertar directamente desde la API; el checkout debe usar create_order.
-- ---------------------------------------------------------
drop policy if exists "orders_insert_public" on public.orders;
drop policy if exists "orders_insert_admins" on public.orders;
revoke insert on table public.orders from public, anon, authenticated;

-- ---------------------------------------------------------
-- Registro de movimientos de inventario y auditoría restringida.
-- ---------------------------------------------------------
create table if not exists public.inventory_movements (
    id           bigint generated always as identity primary key,
    product_id   bigint references public.products(id) on delete set null,
    product_name text not null,
    stock_before integer not null check (stock_before >= 0),
    stock_after  integer not null check (stock_after >= 0),
    delta        integer not null check (delta <> 0),
    reason       text not null,
    order_id     bigint references public.orders(id) on delete set null,
    actor_id     uuid references public.profiles(id) on delete set null,
    actor_name   text not null default 'Sistema',
    created_at   timestamptz not null default now()
);
create index if not exists inventory_movements_created_at_idx
    on public.inventory_movements (created_at desc);
create index if not exists inventory_movements_product_id_idx
    on public.inventory_movements (product_id, created_at desc);

create table if not exists public.audit_events (
    id          bigint generated always as identity primary key,
    actor_id    uuid references public.profiles(id) on delete set null,
    actor_name  text not null default 'Sistema',
    action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
    entity      text not null,
    entity_id   text,
    summary     text not null,
    before_data jsonb,
    after_data  jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists audit_events_created_at_idx
    on public.audit_events (created_at desc);

alter table public.inventory_movements enable row level security;
alter table public.audit_events enable row level security;
drop policy if exists "inventory_movements_read_admins" on public.inventory_movements;
create policy "inventory_movements_read_admins" on public.inventory_movements
    for select using (public.is_admin());
drop policy if exists "audit_events_select_super_admin" on public.audit_events;
create policy "audit_events_select_super_admin" on public.audit_events
    for select using (public.is_super_admin());
revoke all on table public.inventory_movements from public, anon, authenticated;
revoke all on table public.audit_events from public, anon, authenticated;
grant select on table public.inventory_movements, public.audit_events to authenticated;

create or replace function public.track_product_stock_change()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_reason text;
    v_order_id bigint;
    v_actor_name text;
begin
    if new.stock is distinct from old.stock then
        v_reason := nullif(current_setting('popflame.stock_reason', true), '');
        if v_reason is null then v_reason := 'Ajuste directo'; end if;
        begin
            v_order_id := nullif(current_setting('popflame.stock_order_id', true), '')::bigint;
        exception when invalid_text_representation then
            v_order_id := null;
        end;
        select coalesce(name, username) into v_actor_name
          from public.profiles where id = auth.uid();
        insert into public.inventory_movements
            (product_id, product_name, stock_before, stock_after, delta, reason, order_id, actor_id, actor_name)
        values
            (new.id, new.name, old.stock, new.stock, new.stock - old.stock, left(v_reason, 120),
             v_order_id, auth.uid(), coalesce(v_actor_name, 'Sistema'));
    end if;
    return new;
end;
$$;

drop trigger if exists trg_products_stock_audit on public.products;
create trigger trg_products_stock_audit
    after update of stock on public.products
    for each row execute procedure public.track_product_stock_change();

create or replace function public.set_product_stock(
    p_product_id bigint,
    p_stock integer,
    p_expected_stock integer,
    p_reason text default 'Ajuste manual'
)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_current_stock integer;
    v_saved_stock integer;
    v_reason text;
begin
    if not public.is_admin() then raise exception 'No autorizado para ajustar inventario'; end if;
    if p_stock is null or p_stock < 0 then raise exception 'El stock debe ser un entero desde cero'; end if;
    if p_expected_stock is null or p_expected_stock < 0 then raise exception 'Falta el stock esperado'; end if;

    select stock into v_current_stock
      from public.products where id = p_product_id for update;
    if not found then raise exception 'El producto ya no existe'; end if;
    if v_current_stock <> p_expected_stock then
        raise exception using errcode = '40001', message = 'El stock cambió en otra sesión; actualiza la vista e inténtalo de nuevo';
    end if;
    if p_stock = v_current_stock then return v_current_stock; end if;

    v_reason := left(coalesce(nullif(trim(p_reason), ''), 'Ajuste manual'), 120);
    perform set_config('popflame.stock_reason', v_reason, true);
    perform set_config('popflame.stock_order_id', '', true);
    update public.products set stock = p_stock where id = p_product_id returning stock into v_saved_stock;
    perform set_config('popflame.stock_reason', '', true);
    perform set_config('popflame.stock_order_id', '', true);
    return v_saved_stock;
end;
$$;
revoke all on function public.set_product_stock(bigint, integer, integer, text) from public, anon;
grant execute on function public.set_product_stock(bigint, integer, integer, text) to authenticated;

-- Mantén la misma validación de stock en transiciones pagado/no pagado. Una venta concurrente
-- no puede empujar el stock por debajo de cero; cada cambio crea un movimiento auditable.
create or replace function public.orders_apply_stock()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_product_id bigint;
    v_quantity integer;
    v_is_paid boolean := new.status in ('confirmed', 'processing', 'shipped', 'delivered');
    v_stock integer;
begin
    if old.stock_applied and new.items is distinct from old.items then
        raise exception 'No se pueden cambiar los productos de un pedido con stock aplicado';
    end if;

    if v_is_paid and not old.stock_applied then
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
             returning stock into v_stock;
            if not found then
                perform set_config('popflame.stock_reason', '', true);
                perform set_config('popflame.stock_order_id', '', true);
                raise exception 'Stock insuficiente para completar el pedido %', new.order_number;
            end if;
            perform set_config('popflame.stock_reason', '', true);
            perform set_config('popflame.stock_order_id', '', true);
        end loop;
        new.stock_applied := true;
    elsif not v_is_paid and old.stock_applied then
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
             returning stock into v_stock;
            -- Si el producto se eliminó definitivamente, conserva el historial y continúa la cancelación.
            perform set_config('popflame.stock_reason', '', true);
            perform set_config('popflame.stock_order_id', '', true);
        end loop;
        new.stock_applied := false;
    end if;
    return new;
end;
$$;

-- Los pedidos pagados previos ya tuvieron ajuste manual: no descontarlos por segunda vez.
alter table public.orders add column if not exists stock_applied boolean not null default false;
drop trigger if exists trg_orders_z_apply_stock on public.orders;
update public.orders set stock_applied = true
 where status in ('confirmed', 'processing', 'shipped', 'delivered') and not stock_applied;
create trigger trg_orders_z_apply_stock
    before update on public.orders
    for each row execute procedure public.orders_apply_stock();

-- Reemplaza el RPC de checkout con validación estricta y precios/stock desde la base de datos.
create or replace function public.create_order(p_customer jsonb, p_items jsonb)
returns table (order_number text, total numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
    v_item jsonb;
    v_product public.products%rowtype;
    v_product_id bigint;
    v_qty integer;
    v_total_qty integer;
    v_available integer;
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

    -- Rechaza cantidades corruptas antes de usarlas en la verificación de stock.
    for v_item in select value from jsonb_array_elements(p_items) as entry(value) loop
        if jsonb_typeof(v_item) is distinct from 'object'
           or coalesce(v_item->>'productId', '') !~ '^[1-9][0-9]*$'
           or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
            raise exception 'Producto o cantidad inválidos';
        end if;
        v_qty := (v_item->>'quantity')::integer;
        if v_qty > 99 then raise exception 'La cantidad máxima por producto es 99'; end if;
    end loop;

    -- Límite contra pedidos falsos en masa: máximo cinco por hora por cliente y veinte por minuto total.
    if (select count(*) from public.orders
         where (customer_email = v_email or regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
           and created_at > now() - interval '1 hour') >= 5 then
        raise exception 'Recibimos varios pedidos seguidos con estos datos. Escríbenos por WhatsApp y lo resolvemos.';
    end if;
    if (select count(*) from public.orders where created_at > now() - interval '1 minute') >= 20 then
        raise exception 'Hay muchos pedidos en este momento. Intenta de nuevo en un minuto.';
    end if;

    -- Comprueba cantidades agregadas por producto; el stock se vuelve a comprobar al confirmar el pago.
    for v_product_id, v_total_qty in
        select (item->>'productId')::bigint, sum((item->>'quantity')::integer)::integer
          from jsonb_array_elements(p_items) as entry(item)
         group by 1 order by 1
    loop
        select stock into v_available from public.products where id = v_product_id for update;
        if not found then raise exception 'Un producto del carrito ya no existe'; end if;
        if v_total_qty > v_available then raise exception 'Uno de los productos ya no tiene stock suficiente'; end if;
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

-- Auditoría: registra cambios operativos, pero excluye credenciales y datos de pago privados.
create or replace function public.capture_audit_event()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_before_source jsonb;
    v_after_source jsonb;
    v_before jsonb;
    v_after jsonb;
    v_entity_id text;
    v_label text;
    v_actor_name text;
begin
    if tg_op in ('UPDATE', 'DELETE') then v_before_source := to_jsonb(old); end if;
    if tg_op in ('INSERT', 'UPDATE') then v_after_source := to_jsonb(new); end if;
    v_entity_id := coalesce(v_after_source->>'id', v_after_source->>'slug', v_before_source->>'id', v_before_source->>'slug');
    v_label := coalesce(v_after_source->>'name', v_before_source->>'name',
                        v_after_source->>'username', v_before_source->>'username',
                        v_after_source->>'order_number', v_before_source->>'order_number', v_entity_id, 'registro');

    if tg_table_name = 'profiles' then
        if v_before_source is not null then v_before := jsonb_build_object('username', v_before_source->>'username', 'name', v_before_source->>'name', 'role', v_before_source->>'role', 'status', v_before_source->>'status'); end if;
        if v_after_source is not null then v_after := jsonb_build_object('username', v_after_source->>'username', 'name', v_after_source->>'name', 'role', v_after_source->>'role', 'status', v_after_source->>'status'); end if;
    elsif tg_table_name = 'products' then
        if v_before_source is not null then v_before := jsonb_build_object('name', v_before_source->>'name', 'category_id', v_before_source->>'category_id', 'price', v_before_source->>'price', 'stock', v_before_source->>'stock', 'sizes', v_before_source->'sizes', 'colors', v_before_source->'colors', 'featured', v_before_source->>'featured', 'badge', v_before_source->>'badge'); end if;
        if v_after_source is not null then v_after := jsonb_build_object('name', v_after_source->>'name', 'category_id', v_after_source->>'category_id', 'price', v_after_source->>'price', 'stock', v_after_source->>'stock', 'sizes', v_after_source->'sizes', 'colors', v_after_source->'colors', 'featured', v_after_source->>'featured', 'badge', v_after_source->>'badge'); end if;
    elsif tg_table_name = 'categories' then
        if v_before_source is not null then v_before := jsonb_build_object('name', v_before_source->>'name', 'description', v_before_source->>'description', 'sort_order', v_before_source->>'sort_order'); end if;
        if v_after_source is not null then v_after := jsonb_build_object('name', v_after_source->>'name', 'description', v_after_source->>'description', 'sort_order', v_after_source->>'sort_order'); end if;
    elsif tg_table_name = 'orders' then
        if v_before_source is not null then v_before := jsonb_build_object('order_number', v_before_source->>'order_number', 'status', v_before_source->>'status', 'total', v_before_source->>'total', 'stock_applied', v_before_source->>'stock_applied'); end if;
        if v_after_source is not null then v_after := jsonb_build_object('order_number', v_after_source->>'order_number', 'status', v_after_source->>'status', 'total', v_after_source->>'total', 'stock_applied', v_after_source->>'stock_applied'); end if;
    elsif tg_table_name = 'config' then
        if v_before_source is not null then v_before := jsonb_build_object('store_name', v_before_source->>'store_name', 'shipping_cost', v_before_source->>'shipping_cost', 'free_shipping_min', v_before_source->>'free_shipping_min', 'currency', v_before_source->>'currency', 'hero_title', v_before_source->>'hero_title', 'hero_subtitle', v_before_source->>'hero_subtitle'); end if;
        if v_after_source is not null then v_after := jsonb_build_object('store_name', v_after_source->>'store_name', 'shipping_cost', v_after_source->>'shipping_cost', 'free_shipping_min', v_after_source->>'free_shipping_min', 'currency', v_after_source->>'currency', 'hero_title', v_after_source->>'hero_title', 'hero_subtitle', v_after_source->>'hero_subtitle'); end if;
    elsif tg_table_name = 'banners' then
        if v_before_source is not null then v_before := jsonb_build_object('title', v_before_source->>'title', 'subtitle', v_before_source->>'subtitle', 'link_url', v_before_source->>'link_url', 'sort_order', v_before_source->>'sort_order', 'active', v_before_source->>'active'); end if;
        if v_after_source is not null then v_after := jsonb_build_object('title', v_after_source->>'title', 'subtitle', v_after_source->>'subtitle', 'link_url', v_after_source->>'link_url', 'sort_order', v_after_source->>'sort_order', 'active', v_after_source->>'active'); end if;
    end if;

    select coalesce(name, username) into v_actor_name from public.profiles where id = auth.uid();
    insert into public.audit_events (actor_id, actor_name, action, entity, entity_id, summary, before_data, after_data)
    values (auth.uid(), coalesce(v_actor_name, 'Sistema'), tg_op, tg_table_name, v_entity_id,
            left(tg_op || ' ' || tg_table_name || ': ' || v_label, 240), v_before, v_after);

    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles after insert or update or delete on public.profiles
    for each row execute procedure public.capture_audit_event();
drop trigger if exists trg_audit_products on public.products;
create trigger trg_audit_products after insert or update or delete on public.products
    for each row execute procedure public.capture_audit_event();
drop trigger if exists trg_audit_categories on public.categories;
create trigger trg_audit_categories after insert or update or delete on public.categories
    for each row execute procedure public.capture_audit_event();
drop trigger if exists trg_audit_orders on public.orders;
create trigger trg_audit_orders after insert or update or delete on public.orders
    for each row execute procedure public.capture_audit_event();
drop trigger if exists trg_audit_config on public.config;
create trigger trg_audit_config after insert or update or delete on public.config
    for each row execute procedure public.capture_audit_event();
drop trigger if exists trg_audit_banners on public.banners;
create trigger trg_audit_banners after insert or update or delete on public.banners
    for each row execute procedure public.capture_audit_event();

commit;

-- Primer acceso en una instalación nueva, ejecutado por el dueño desde SQL Editor:
-- update public.profiles p set role = 'super_admin', status = 'active'
-- where p.id = (select id from auth.users where lower(email) = lower('dueno@tu-dominio.cl'));
