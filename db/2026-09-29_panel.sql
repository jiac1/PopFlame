-- =========================================================
-- PopFlame - Nuevas cuentas del panel
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run  (se puede correr más de una vez)
--
-- Antes, el rol dependía de una lista fija de correos (k1llu4@ / ariaspopflame@).
-- Ahora:
--   * La primera cuenta que se crea cuando NO hay ningún super_admin queda como super_admin.
--   * Cualquier cuenta creada después queda "pending" (sin ningún permiso) hasta que un
--     super_admin la apruebe como admin o super_admin desde el panel (Usuarios).
--     Antes cualquiera que se registrara con la clave pública del sitio quedaba como admin.
--   * El usuario con que se inicia sesión es lo que va antes de la @ del correo.
-- =========================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
    check (role in ('super_admin', 'admin', 'pending'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_username text := lower(split_part(new.email, '@', 1));
    v_role     text;
begin
    select case when exists (select 1 from public.profiles where role = 'super_admin')
                then 'pending' else 'super_admin' end
      into v_role;

    insert into public.profiles (id, username, role, name)
    values (new.id, v_username, v_role, v_username)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- El login busca el usuario sin importar mayúsculas/minúsculas.
create or replace function public.email_for_username(p_username text)
returns text
language sql security definer set search_path = public as $$
    select u.email::text
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(p.username) = lower(trim(p_username))
    limit 1;
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;

-- Protecciones de roles:
--  * Solo un super_admin puede cambiar roles (antes cualquier cuenta podía editar su propio perfil,
--    incluido el rol, y ascenderse sola a super_admin).
--  * Nadie puede cambiar su propio nombre de usuario (es con lo que inicia sesión).
--  * Debe quedar al menos un super_admin.
create or replace function public.protect_last_super_admin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
    -- auth.uid() es null cuando se edita desde el SQL Editor del dashboard (dueño del proyecto): se permite.
    if new.role is distinct from old.role and auth.uid() is not null and not public.is_super_admin() then
        raise exception 'Solo un Super Admin puede cambiar roles';
    end if;
    if new.username is distinct from old.username and auth.uid() is not null and not public.is_super_admin() then
        raise exception 'Solo un Super Admin puede cambiar nombres de usuario';
    end if;
    if old.role = 'super_admin' and new.role <> 'super_admin'
       and (select count(*) from public.profiles where role = 'super_admin') <= 1 then
        raise exception 'Debe quedar al menos un Super Admin';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_protect_last_super_admin on public.profiles;
create trigger trg_protect_last_super_admin
    before update on public.profiles
    for each row execute procedure public.protect_last_super_admin();

-- =========================================================
-- Datos de transferencia (se editan en Configuración > Pagos). El panel los usa para mandarle
-- al cliente los datos de pago por WhatsApp con un clic, y la tienda los muestra al confirmar
-- el pedido. Son datos que se comparten con cada comprador, por eso pueden ser públicos.
-- =========================================================
alter table public.config add column if not exists transfer_info text;

-- =========================================================
-- Stock automático: cuando un pedido pasa a pagado (confirmed / processing / shipped / delivered)
-- se descuenta el stock de sus productos una sola vez; si después se cancela, se repone.
-- =========================================================
alter table public.orders add column if not exists stock_applied boolean not null default false;

-- Pedidos que ya estaban pagados antes de este cambio: se asume que su stock ya se ajustó a mano,
-- así no se descuenta dos veces si después se mueven a "entregado". (Se ejecuta antes de crear el
-- trigger de abajo; en una segunda ejecución no cambia nada.)
drop trigger if exists trg_orders_z_apply_stock on public.orders;
update public.orders set stock_applied = true
 where status in ('confirmed', 'processing', 'shipped', 'delivered') and not stock_applied;

create or replace function public.orders_apply_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_item jsonb;
    v_paid boolean := new.status in ('confirmed', 'processing', 'shipped', 'delivered');
begin
    if v_paid and not old.stock_applied then
        for v_item in select * from jsonb_array_elements(new.items) loop
            update public.products
               set stock = greatest(0, stock - coalesce((v_item->>'quantity')::int, 0))
             where id = (v_item->>'productId')::bigint;
        end loop;
        new.stock_applied := true;
    elsif new.status = 'cancelled' and old.stock_applied then
        for v_item in select * from jsonb_array_elements(new.items) loop
            update public.products
               set stock = stock + coalesce((v_item->>'quantity')::int, 0)
             where id = (v_item->>'productId')::bigint;
        end loop;
        new.stock_applied := false;
    end if;
    return new;
end;
$$;

-- Corre después de orders_auto_processing (los triggers BEFORE se ejecutan en orden alfabético).
drop trigger if exists trg_orders_z_apply_stock on public.orders;
create trigger trg_orders_z_apply_stock
    before update on public.orders
    for each row execute procedure public.orders_apply_stock();

-- =========================================================
-- Checkout: misma función segura de pedidos + límite contra pedidos falsos en masa.
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

    -- Freno contra pedidos falsos en masa (bots): máx. 5 por hora con el mismo teléfono o correo,
    -- y máx. 20 por minuto en toda la tienda.
    if (select count(*) from public.orders
         where (customer_email = v_email or regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
           and created_at > now() - interval '1 hour') >= 5 then
        raise exception 'Recibimos varios pedidos seguidos con estos datos. Escríbenos por WhatsApp y lo resolvemos.';
    end if;
    if (select count(*) from public.orders where created_at > now() - interval '1 minute') >= 20 then
        raise exception 'Hay muchos pedidos en este momento. Intenta de nuevo en un minuto.';
    end if;

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

-- =========================================================
-- Newsletter: darse de baja desde el link de los correos (pages/baja.html).
-- Solo desactiva la suscripción de ese correo; no expone ningún dato.
-- =========================================================
create or replace function public.unsubscribe_newsletter(p_email text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
    update public.subscribers set active = false
     where lower(email) = lower(trim(p_email)) and active;
    return found;
end;
$$;

revoke all on function public.unsubscribe_newsletter(text) from public;
grant execute on function public.unsubscribe_newsletter(text) to anon, authenticated;

-- Si alguien que se dio de baja se vuelve a suscribir desde la tienda, se reactiva.
create or replace function public.subscribers_reactivate()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
    new.email := lower(trim(new.email));
    if exists (select 1 from public.subscribers where email = new.email and not active) then
        update public.subscribers set active = true, subscribed_at = now() where email = new.email;
        return null;  -- no inserta un duplicado; la fila existente queda activa
    end if;
    return new;
end;
$$;

drop trigger if exists trg_subscribers_reactivate on public.subscribers;
create trigger trg_subscribers_reactivate
    before insert on public.subscribers
    for each row execute procedure public.subscribers_reactivate();
