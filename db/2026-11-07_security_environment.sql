-- Sin configuración explícita, los efectos externos quedan desactivados.
-- Nunca copiar secretos de producción a staging. No cambia productos existentes.
begin;
create table if not exists public.panel_environment (
    id int primary key check (id = 1),
    environment text not null default 'unconfigured' check (environment in ('unconfigured', 'staging', 'production')),
    supabase_url text,
    publishable_key text,
    notifications_enabled boolean not null default false,
    check (not notifications_enabled or (
        environment = 'production'
        and supabase_url is not null and publishable_key is not null
        and supabase_url = 'https://ysxinhpymvhdnfbdanvn.supabase.co'
        and publishable_key like 'sb_publishable_%'
    ))
);
alter table public.panel_environment enable row level security;
revoke all on public.panel_environment from public, anon, authenticated;
grant select on public.panel_environment to authenticated;
drop policy if exists environment_read_super on public.panel_environment;
create policy environment_read_super on public.panel_environment for select to authenticated using (public.is_super_admin());
insert into public.panel_environment(id) values (1) on conflict (id) do nothing;

-- Reemplaza el destino hardcodeado del trigger histórico. Conserva su nombre y
-- trigger asociado. Configuración de entorno solo por dueño SQL, no desde clientes.
create or replace function public.notify_new_product()
returns trigger language plpgsql security definer set search_path = '' as $$
declare env public.panel_environment%rowtype;
begin
    select * into env from public.panel_environment where id = 1;
    if env.environment is distinct from 'production' or not coalesce(env.notifications_enabled, false) then
        return new;
    end if;
    perform net.http_post(
        url := env.supabase_url || '/functions/v1/notify-new-product',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || env.publishable_key),
        body := jsonb_build_object('type', 'INSERT', 'table', 'products', 'record', row_to_json(new)::jsonb)
    );
    return new;
end;
$$;
revoke all on function public.notify_new_product() from public, anon, authenticated;
commit;
