-- Solo lectura, dueño SQL en staging. Guardar junto al snapshot previo de Fase 1.
select r as api_role, a.attname as column_name,
       has_column_privilege(r, 'public.orders', a.attname, 'UPDATE') as can_update
from unnest(array['anon','authenticated']) r
cross join pg_attribute a
where a.attrelid = 'public.orders'::regclass and a.attnum > 0 and not a.attisdropped
order by r, a.attnum;

-- Conservar relacl y attacl para reversión selectiva; information_schema solo no basta.
select c.oid::regclass, c.relacl, a.attname, a.attacl
from pg_class c join pg_attribute a on a.attrelid = c.oid
where c.oid = 'public.orders'::regclass and a.attnum > 0 and not a.attisdropped;

select r as api_role,
    has_function_privilege(r, 'public.create_order(jsonb,jsonb)', 'EXECUTE') as public_rpc,
    has_function_privilege(r, 'public.create_order_validated_internal(jsonb,jsonb)', 'EXECUTE') as internal_rpc,
    has_table_privilege(r, 'public.order_requests', 'SELECT,INSERT,UPDATE,DELETE') as direct_ledger_access
from unnest(array['anon','authenticated']) r;

select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid in ('public.orders'::regclass,'public.config'::regclass) and not tgisinternal order by tgname;
select slot,bucket_id,object_name from public.panel_technical_media order by slot;
select id,environment,supabase_url,notifications_enabled from public.panel_environment;
select p.oid::regprocedure, pg_get_userbyid(p.proowner) as owner, p.prosecdef,p.proconfig,p.proacl,
       pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('guard_order_client_update','technical_media_identity','decode_storage_path',
    'sync_technical_media','can_manage_panel_media','create_order','create_order_validated_internal','notify_new_product');
