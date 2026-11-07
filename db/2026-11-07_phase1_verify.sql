-- SOLO LECTURA. Guardar resultados antes/después en un lugar privado.
-- No ejecuta pedidos ni modifica datos. No devuelve JWT ni contraseñas.
select n.nspname as schema_name, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relname in
    ('profiles','products','categories','orders','config','banners','pages','size_guide','subscribers','panel_role_audit'))
    or (n.nspname = 'storage' and c.relname = 'objects')
order by 1, 2;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema in ('public','storage') and grantee in ('anon','authenticated','PUBLIC')
order by 1, 2, 3, 4;

select p.oid::regprocedure as function_name, pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer, p.proconfig, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.prosecdef or p.proname in ('is_admin','is_super_admin','current_role_name'))
order by 1;

-- Guardar estas definiciones ANTES de migrar para reversión selectiva.
select p.oid::regprocedure as function_name, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
    ('create_order','handle_new_user','protect_last_super_admin','current_role_name','is_admin','is_super_admin');

select tgrelid::regclass as table_name, tgname, pg_get_triggerdef(oid) as definition
from pg_trigger where not tgisinternal and tgrelid in
    ('public.profiles'::regclass, 'public.orders'::regclass, 'auth.users'::regclass);

select role, count(*) from public.profiles group by role order by role;
select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('product-images','site-assets');

-- Tras la migración checkout: false / false; y execute RPC = true para ambos.
select r as api_role,
    has_table_privilege(r, 'public.orders', 'INSERT') as direct_orders_insert,
    has_function_privilege(r, to_regprocedure('public.create_order(jsonb,jsonb)'), 'EXECUTE') as checkout_rpc
from unnest(array['anon','authenticated']) r;

-- Deben existir guards restrictivos DELETE(super) e INSERT(false) en orders.
select policyname, permissive, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'orders' order by policyname;
