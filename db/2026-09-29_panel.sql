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
