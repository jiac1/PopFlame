-- =========================================================
-- PopFlame · Permisos de producción (noviembre 2026)
--
-- La base publicada tenía políticas antiguas que los scripts anteriores debían reemplazar:
--   * "orders_insert_public": cualquiera podía crear pedidos directo por la API (con el total
--     que quisiera), saltándose create_order, que es la que calcula precios y valida stock.
--   * Categorías y fotos (Storage) solo para Super Admin, así que la dueña (Admin) no podía
--     subir fotos de productos ni editar categorías desde el panel.
--
-- Además agrega "guardas restrictivas": políticas AS RESTRICTIVE que se suman a todas las demás.
-- Aunque en el futuro alguien vuelva a crear una política permisiva antigua (por ejemplo, corriendo
-- un script viejo), la guarda la anula. Idea rescatada de la rama feature/phase1-rbac.
--
-- Se puede correr más de una vez.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Pedidos
-- ---------------------------------------------------------
-- Nadie inserta directo: el checkout usa create_order (security definer).
drop policy if exists "orders_insert_public" on public.orders;
drop policy if exists "orders_insert_admins" on public.orders;
revoke insert on table public.orders from public, anon, authenticated;

-- Desde el panel solo se cambia el estado del pedido. Totales, productos, datos del cliente y
-- stock_applied no se pueden editar por la API (los triggers internos sí los siguen manejando).
revoke update on table public.orders from public, anon, authenticated;
grant update (status) on table public.orders to authenticated;

drop policy if exists "orders_guard_insert" on public.orders;
create policy "orders_guard_insert" on public.orders
    as restrictive for insert to anon, authenticated with check (false);

drop policy if exists "orders_guard_select" on public.orders;
create policy "orders_guard_select" on public.orders
    as restrictive for select to anon, authenticated using ((select public.is_admin()));

drop policy if exists "orders_guard_update" on public.orders;
create policy "orders_guard_update" on public.orders
    as restrictive for update to anon, authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "orders_guard_delete" on public.orders;
create policy "orders_guard_delete" on public.orders
    as restrictive for delete to anon, authenticated using ((select public.is_super_admin()));

-- ---------------------------------------------------------
-- 2. Perfiles y suscriptores: nadie los crea por la API
-- ---------------------------------------------------------
-- Los perfiles los crea handle_new_user (security definer) al registrar la cuenta.
drop policy if exists "profiles_guard_insert" on public.profiles;
create policy "profiles_guard_insert" on public.profiles
    as restrictive for insert to anon, authenticated with check (false);

drop policy if exists "subscribers_insert_public" on public.subscribers;
revoke insert on table public.subscribers from anon, authenticated;
drop policy if exists "subscribers_guard_insert" on public.subscribers;
create policy "subscribers_guard_insert" on public.subscribers
    as restrictive for insert to anon, authenticated with check (false);

-- Mismas políticas de perfiles, pero evaluando auth.uid() una sola vez por consulta
-- (aviso de rendimiento de Supabase "auth_rls_initplan").
drop policy if exists "profiles_select_own_or_super" on public.profiles;
create policy "profiles_select_own_or_super" on public.profiles
    for select using (id = (select auth.uid()) or (select public.is_super_admin()));

drop policy if exists "profiles_update_own_or_super" on public.profiles;
create policy "profiles_update_own_or_super" on public.profiles
    for update using (id = (select auth.uid()) or (select public.is_super_admin()))
    with check (id = (select auth.uid()) or (select public.is_super_admin()));

-- ---------------------------------------------------------
-- 3. Categorías: Admin y Super Admin
-- ---------------------------------------------------------
drop policy if exists "categories_write_super_admin" on public.categories;
drop policy if exists "categories_write_admins" on public.categories;
create policy "categories_write_admins" on public.categories
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 4. Storage: fotos de productos y del sitio para Admin y Super Admin
-- ---------------------------------------------------------
drop policy if exists "product_images_super_admin_write" on storage.objects;
drop policy if exists "product_images_admins_write" on storage.objects;
create policy "product_images_admins_write" on storage.objects
    for insert with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_super_admin_update" on storage.objects;
drop policy if exists "product_images_admins_update" on storage.objects;
create policy "product_images_admins_update" on storage.objects
    for update using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_super_admin_delete" on storage.objects;
drop policy if exists "product_images_admins_delete" on storage.objects;
create policy "product_images_admins_delete" on storage.objects
    for delete using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "site_assets_super_admin_write" on storage.objects;
drop policy if exists "site_assets_admins_write" on storage.objects;
create policy "site_assets_admins_write" on storage.objects
    for insert with check (bucket_id = 'site-assets' and public.is_admin());

drop policy if exists "site_assets_super_admin_update" on storage.objects;
drop policy if exists "site_assets_admins_update" on storage.objects;
create policy "site_assets_admins_update" on storage.objects
    for update using (bucket_id = 'site-assets' and public.is_admin());

drop policy if exists "site_assets_super_admin_delete" on storage.objects;
drop policy if exists "site_assets_admins_delete" on storage.objects;
create policy "site_assets_admins_delete" on storage.objects
    for delete using (bucket_id = 'site-assets' and public.is_admin());

-- ---------------------------------------------------------
-- 5. Funciones internas
-- ---------------------------------------------------------
-- search_path fijo (aviso de seguridad de Supabase "function_search_path_mutable").
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.orders_auto_processing() set search_path = public, pg_temp;
alter function public.notify_new_product() set search_path = public, pg_temp;

-- Las funciones de trigger no se llaman por la API (/rest/v1/rpc/...). Al dispararse como
-- trigger no se revisa este permiso, así que quitarlo no cambia nada del funcionamiento.
do $$
declare r record;
begin
    for r in
        select p.oid::regprocedure as fn
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    end loop;
end $$;

-- ---------------------------------------------------------
-- 6. Índices de claves foráneas (la reversa de stock busca movimientos por pedido)
-- ---------------------------------------------------------
create index if not exists inventory_movements_order_id_idx on public.inventory_movements (order_id);
create index if not exists inventory_movements_actor_id_idx on public.inventory_movements (actor_id);
create index if not exists audit_events_actor_id_idx on public.audit_events (actor_id);
create index if not exists products_category_id_idx on public.products (category_id);

commit;
