-- Fase 1. Revisar/aplicar primero en staging. NO ejecutar schema.sql.
-- No modifica productos, cantidades, precios, archivos ni pedidos existentes.
begin;

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = '' as $$
    select p.role from public.profiles p where p.id = auth.uid();
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(public.current_role_name() in ('admin', 'super_admin'), false);
$$;
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(public.current_role_name() = 'super_admin', false);
$$;
revoke all on function public.current_role_name(), public.is_admin(), public.is_super_admin() from public;
grant execute on function public.current_role_name(), public.is_admin(), public.is_super_admin() to anon, authenticated, service_role;

-- Toda cuenta nueva queda pending. El bootstrap / recuperación pertenece al dueño
-- del proyecto en SQL Editor; nunca depende de que alguien se registre primero.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_username text := coalesce(nullif(lower(split_part(new.email, '@', 1)), ''), new.id::text);
begin
    if exists (select 1 from public.profiles where username = v_username) then
        v_username := v_username || '-' || new.id::text;
    end if;
    insert into public.profiles (id, username, role, name)
    values (new.id, v_username, 'pending', v_username)
    on conflict (id) do nothing;
    return new;
end;
$$;

-- Serializa cambios de perfiles. No basta con count(*) sin bloqueo: dos Super
-- Admin podrían degradarse mutuamente en transacciones concurrentes.
create or replace function public.protect_last_super_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_trusted boolean := auth.uid() is null
        and coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated');
begin
    perform pg_catalog.pg_advisory_xact_lock(70611, 1);
    if tg_op = 'UPDATE' then
        if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
            raise exception 'La identidad y fecha del perfil no se pueden cambiar' using errcode = '42501';
        end if;
        if new.role is distinct from old.role then
            if auth.uid() = old.id then
                raise exception 'No puedes cambiar tu propio rol' using errcode = '42501';
            end if;
            if not v_trusted and not public.is_super_admin() then
                raise exception 'Solo un Super Admin puede cambiar roles' using errcode = '42501';
            end if;
        end if;
        if new.username is distinct from old.username and not v_trusted and not public.is_super_admin() then
            raise exception 'Solo un Super Admin puede cambiar nombres de usuario' using errcode = '42501';
        end if;
    end if;
    if old.role = 'super_admin' then
        if tg_op = 'DELETE' or new.role <> 'super_admin' then
            if (select count(*) from public.profiles where role = 'super_admin') <= 1 then
                raise exception 'Debe quedar al menos un Super Admin' using errcode = '42501';
            end if;
        end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;
drop trigger if exists trg_protect_last_super_admin on public.profiles;
create trigger trg_protect_last_super_admin before update or delete on public.profiles
    for each row execute function public.protect_last_super_admin();

-- Solo identificadores y roles, sin credenciales ni datos de pedidos.
create table if not exists public.panel_role_audit (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    actor_id uuid,
    profile_id uuid not null,
    old_role text,
    new_role text
);
alter table public.panel_role_audit enable row level security;
revoke all on public.panel_role_audit from public, anon, authenticated;
grant select on public.panel_role_audit to authenticated;
create or replace function public.audit_panel_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        insert into public.panel_role_audit (actor_id, profile_id, new_role) values (auth.uid(), new.id, new.role);
        return new;
    elsif tg_op = 'DELETE' then
        insert into public.panel_role_audit (actor_id, profile_id, old_role) values (auth.uid(), old.id, old.role);
        return old;
    elsif new.role is distinct from old.role then
        insert into public.panel_role_audit (actor_id, profile_id, old_role, new_role)
        values (auth.uid(), new.id, old.role, new.role);
    end if;
    return new;
end;
$$;
drop trigger if exists trg_audit_panel_role on public.profiles;
create trigger trg_audit_panel_role after insert or update or delete on public.profiles
    for each row execute function public.audit_panel_role();
revoke all on function public.handle_new_user(), public.protect_last_super_admin(), public.audit_panel_role() from public, anon, authenticated;

-- Las policies RESTRICTIVE se combinan con AND, incluso con policies permisivas
-- antiguas. Se conservan las lecturas públicas y no se borran policies ajenas.
do $$
declare
    t text;
    op text;
    predicate text;
    clause text;
    pname text;
begin
    foreach t in array array['products', 'categories', 'banners', 'size_guide', 'config', 'pages'] loop
        execute format('alter table public.%I enable row level security', t);
        predicate := case when t in ('config', 'pages') then 'public.is_super_admin()' else 'public.is_admin()' end;
        foreach op in array array['insert', 'update', 'delete'] loop
            pname := 'phase1_' || t || '_' || op;
            clause := case op
                when 'insert' then format('with check (%s)', predicate)
                when 'update' then format('using (%s) with check (%s)', predicate, predicate)
                else format('using (%s)', predicate) end;
            execute format('drop policy if exists %I on public.%I', pname, t);
            execute format('create policy %I on public.%I for %s to authenticated %s', pname, t, op, clause);
            execute format('drop policy if exists %I on public.%I', pname || '_guard', t);
            execute format('create policy %I on public.%I as restrictive for %s to public %s', pname || '_guard', t, op, clause);
        end loop;
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end;
$$;

alter table public.profiles enable row level security;
revoke insert, delete, truncate, references, trigger on public.profiles from public, anon, authenticated;
grant select, update on public.profiles to authenticated;
drop policy if exists phase1_profiles_select_guard on public.profiles;
create policy phase1_profiles_select_guard on public.profiles as restrictive for select to public
    using (id = auth.uid() or public.is_super_admin());
drop policy if exists phase1_profiles_update_guard on public.profiles;
create policy phase1_profiles_update_guard on public.profiles as restrictive for update to public
    using (id = auth.uid() or public.is_super_admin()) with check (id = auth.uid() or public.is_super_admin());
drop policy if exists phase1_profiles_insert_guard on public.profiles;
create policy phase1_profiles_insert_guard on public.profiles as restrictive for insert to public with check (false);
drop policy if exists phase1_profiles_delete_guard on public.profiles;
create policy phase1_profiles_delete_guard on public.profiles as restrictive for delete to public using (false);

alter table public.orders enable row level security;
drop policy if exists phase1_orders_select_guard on public.orders;
create policy phase1_orders_select_guard on public.orders as restrictive for select to public using (public.is_admin());
drop policy if exists phase1_orders_update_guard on public.orders;
create policy phase1_orders_update_guard on public.orders as restrictive for update to public
    using (public.is_admin()) with check (public.is_admin());
drop policy if exists phase1_orders_delete_guard on public.orders;
create policy phase1_orders_delete_guard on public.orders as restrictive for delete to public using (public.is_super_admin());

-- No se interfiere con la suscripción pública del newsletter.
alter table public.subscribers enable row level security;
do $$
declare t text; op text; predicate text; clause text; pname text;
begin
    foreach t in array array['subscribers', 'panel_role_audit'] loop
        foreach op in array array['select', 'update', 'delete'] loop
            predicate := case when op = 'select' or t = 'subscribers' then 'public.is_super_admin()' else 'false' end;
            clause := format('using (%s)', predicate);
            if op = 'update' then clause := clause || format(' with check (%s)', predicate); end if;
            pname := 'phase1_' || t || '_' || op || '_guard';
            execute format('drop policy if exists %I on public.%I', pname, t);
            execute format('create policy %I on public.%I as restrictive for %s to public %s', pname, t, op, clause);
        end loop;
    end loop;
end;
$$;
drop policy if exists phase1_audit_read on public.panel_role_audit;
create policy phase1_audit_read on public.panel_role_audit for select to authenticated using (public.is_super_admin());
drop policy if exists phase1_audit_insert_guard on public.panel_role_audit;
create policy phase1_audit_insert_guard on public.panel_role_audit as restrictive for insert to public with check (false);

-- Mismas rutas y buckets. Ambos roles conservan upload/update/delete.
-- El guard restringe solo estos dos buckets; los demás conservan sus policies.
-- Un Admin no puede reemplazar/borrar los archivos referenciados por config
-- (logos/portada técnica), aunque comparten bucket con categorías y banners.
create or replace function public.can_manage_panel_media(p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
    select public.is_admin() and p_bucket in ('product-images', 'site-assets')
        and (public.is_super_admin() or not exists (
            select 1 from public.config c
            cross join lateral (values (c.logo_url), (c.logo_white_url), (c.hero_banner_url)) asset(url)
            where split_part(split_part(asset.url, '/storage/v1/object/public/' || p_bucket || '/', 2), '?', 1)
                in (p_name, replace(p_name, ' ', '%20'))
        ));
$$;
revoke all on function public.can_manage_panel_media(text, text) from public;
grant execute on function public.can_manage_panel_media(text, text) to anon, authenticated, service_role;
do $$
declare op text; predicate text; guard text; clause text; guard_clause text;
begin
    predicate := 'public.can_manage_panel_media(bucket_id, name)';
    guard := '(bucket_id not in (''product-images'', ''site-assets'') or public.can_manage_panel_media(bucket_id, name))';
    foreach op in array array['insert', 'update', 'delete'] loop
        clause := case op
            when 'insert' then format('with check (%s)', predicate)
            when 'update' then format('using (%s) with check (%s)', predicate, predicate)
            else format('using (%s)', predicate) end;
        guard_clause := case op
            when 'insert' then format('with check (%s)', guard)
            when 'update' then format('using (%s) with check (%s)', guard, guard)
            else format('using (%s)', guard) end;
        execute format('drop policy if exists %I on storage.objects', 'phase1_media_' || op);
        execute format('create policy %I on storage.objects for %s to authenticated %s', 'phase1_media_' || op, op, clause);
        execute format('drop policy if exists %I on storage.objects', 'phase1_media_' || op || '_guard');
        execute format('create policy %I on storage.objects as restrictive for %s to public %s', 'phase1_media_' || op || '_guard', op, guard_clause);
    end loop;
end;
$$;
grant usage on sequence public.products_id_seq, public.banners_id_seq, public.size_guide_id_seq to authenticated;
notify pgrst, 'reload schema';
commit;
