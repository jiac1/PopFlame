-- Incremental: requiere las dos migraciones de Fase 1. Solo aplicar en staging tras revisión.
-- No cambia pedidos/productos ni archivos. No modifica los triggers comerciales.
begin;
do $$ begin
    if not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass
                   and tgname = 'trg_orders_z_apply_stock' and tgenabled <> 'D')
       or not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass
                   and tgname = 'trg_orders_auto_processing' and tgenabled <> 'D') then
        raise exception 'Faltan triggers comerciales de stock/estado: revisar baseline antes de migrar';
    end if;
end $$;

-- Un GRANT de tabla prevalece sobre restricciones por columna: retirar ambos.
revoke update on public.orders from public, anon, authenticated;
do $$
declare cols text;
begin
    select string_agg(quote_ident(attname), ', ' order by attnum) into cols
      from pg_attribute where attrelid = 'public.orders'::regclass and attnum > 0 and not attisdropped;
    execute format('revoke update (%s) on public.orders from public, anon, authenticated', cols);
end $$;
grant update (status) on public.orders to authenticated;

-- Falla de forma transaccional si otro rol heredado mantiene UPDATE financiero.
do $$
declare col text;
begin
    for col in select attname from pg_attribute
        where attrelid = 'public.orders'::regclass and attnum > 0 and not attisdropped and attname <> 'status'
    loop
        if has_column_privilege('authenticated', 'public.orders', col, 'UPDATE')
           or has_column_privilege('anon', 'public.orders', col, 'UPDATE') then
            raise exception 'Permiso UPDATE heredado no permitido en orders.%: revisar grants', col;
        end if;
    end loop;
    if has_column_privilege('anon', 'public.orders', 'status', 'UPDATE') then
        raise exception 'anon conserva UPDATE de status: revisar grants';
    end if;
end $$;

-- Defensa ante futuros GRANT amplios. Se ejecuta ANTES de updated_at/stock;
-- los cambios internos posteriores de esos triggers siguen permitidos.
create or replace function public.guard_order_client_update()
returns trigger language plpgsql set search_path = '' as $$
begin
    if current_setting('role', true) in ('anon', 'authenticated')
       and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
        raise exception 'Solo se permite cambiar el estado del pedido' using errcode = '42501';
    end if;
    return new;
end;
$$;
revoke all on function public.guard_order_client_update() from public, anon, authenticated;
drop trigger if exists trg_orders_00_client_update on public.orders;
create trigger trg_orders_00_client_update before update on public.orders
    for each row execute function public.guard_order_client_update();

-- Identidad canónica de los archivos técnicos: no se compara una URL en cada
-- operación de Storage. Solo el trigger de config mantiene este registro.
create table if not exists public.panel_technical_media (
    slot text primary key check (slot in ('logo_url', 'logo_white_url', 'hero_banner_url')),
    bucket_id text not null,
    object_name text not null check (length(object_name) > 0)
);
alter table public.panel_technical_media enable row level security;
revoke all on public.panel_technical_media from public, anon, authenticated;
grant select on public.panel_technical_media to authenticated;
drop policy if exists technical_media_read_super on public.panel_technical_media;
create policy technical_media_read_super on public.panel_technical_media for select to authenticated
    using (public.is_super_admin());
drop policy if exists technical_media_no_writes on public.panel_technical_media;
create policy technical_media_no_writes on public.panel_technical_media as restrictive
    for all to public using (public.is_super_admin()) with check (false);

-- Percent-decoding UTF-8 exactamente una vez. No convertir '+' en espacio en rutas.
create or replace function public.decode_storage_path(p_path text)
returns text language plpgsql immutable set search_path = '' as $$
declare i int := 1; bytes bytea := ''::bytea; ch text;
begin
    while i <= length(p_path) loop
        ch := substr(p_path, i, 1);
        if ch = '%' then
            if substr(p_path, i + 1, 2) !~ '^[0-9A-Fa-f]{2}$' then
                raise exception 'Codificación de ruta Storage inválida' using errcode = '22023';
            end if;
            bytes := bytes || decode(substr(p_path, i + 1, 2), 'hex');
            i := i + 3;
        else
            bytes := bytes || convert_to(ch, 'UTF8');
            i := i + 1;
        end if;
    end loop;
    return convert_from(bytes, 'UTF8');
end;
$$;
create or replace function public.technical_media_identity(p_url text)
returns table (bucket_id text, object_name text)
language plpgsql immutable set search_path = '' as $$
declare path text; parts text[];
begin
    if nullif(trim(p_url), '') is null then return; end if;
    if strpos(p_url, chr(92)) > 0 or p_url ~ '[[:cntrl:]]' then
        raise exception 'Referencia técnica con separadores ambiguos' using errcode = '22023';
    end if;
    -- Quitar query/fragment ANTES de decodificar: %3F/%23 pueden ser parte del nombre.
    path := split_part(split_part(trim(p_url), '#', 1), '?', 1);
    path := regexp_replace(path, '^(https?:)?//[^/]+', '', 'i');
    path := public.decode_storage_path(path);
    if path ~ '(^|/)\.{1,2}(/|$)' or strpos(path, chr(92)) > 0 or path ~ '[[:cntrl:]]' then
        raise exception 'Ruta técnica Storage ambigua' using errcode = '22023';
    end if;
    parts := regexp_match(path,
        '^/storage/v1/(?:object/(?:public|sign|authenticated)|render/image/(?:public|sign|authenticated))/([^/]+)/(.+)$');
    if parts is null then
        if path ~ '(^|/)storage/' then
            raise exception 'Referencia técnica Storage no reconocida' using errcode = '22023';
        end if;
        return; -- Archivo local o externo: no es un objeto administrable de Storage.
    end if;
    if parts[2] ~ '(^|/)\.{1,2}(/|$)' or strpos(parts[2], chr(92)) > 0
       or parts[2] ~ '[[:cntrl:]]' then
        raise exception 'Ruta técnica Storage ambigua' using errcode = '22023';
    end if;
    return query select parts[1], parts[2];
end;
$$;
revoke all on function public.decode_storage_path(text), public.technical_media_identity(text) from public, anon, authenticated;

create or replace function public.sync_technical_media()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    delete from public.panel_technical_media;
    if tg_op <> 'DELETE' then
        insert into public.panel_technical_media(slot, bucket_id, object_name)
        select asset.slot, identity.bucket_id, identity.object_name
        from (values ('logo_url', new.logo_url), ('logo_white_url', new.logo_white_url),
                     ('hero_banner_url', new.hero_banner_url)) asset(slot, url)
        cross join lateral public.technical_media_identity(asset.url) identity;
        return new;
    end if;
    return old;
end;
$$;
revoke all on function public.sync_technical_media() from public, anon, authenticated;
drop trigger if exists trg_config_technical_media on public.config;
create trigger trg_config_technical_media after insert or update or delete on public.config
    for each row execute function public.sync_technical_media();

-- Backfill solo del registro NUEVO; no cambia config, imágenes ni datos comerciales.
delete from public.panel_technical_media;
insert into public.panel_technical_media(slot, bucket_id, object_name)
select asset.slot, identity.bucket_id, identity.object_name from public.config c
cross join lateral (values ('logo_url', c.logo_url), ('logo_white_url', c.logo_white_url),
                         ('hero_banner_url', c.hero_banner_url)) asset(slot, url)
cross join lateral public.technical_media_identity(asset.url) identity;

create or replace function public.can_manage_panel_media(p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
    select public.is_admin() and p_bucket in ('product-images', 'site-assets')
        and (public.is_super_admin() or not exists (
            select 1 from public.panel_technical_media m
            where m.bucket_id = p_bucket and m.object_name = p_name
        ));
$$;
notify pgrst, 'reload schema';
commit;
