-- =========================================================
-- PopFlame - Schema de Supabase (instalación completa)
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query > Run
-- Es seguro volver a ejecutarlo (usa IF NOT EXISTS / OR REPLACE donde aplica).
-- Deja la base igual que una instalación antigua con todos los scripts de db/ aplicados.
-- =========================================================

-- ---------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------

create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    username    text not null unique,
    name        text,
    role        text not null default 'admin' check (role in ('admin', 'super_admin')),
    status      text not null default 'pending' check (status in ('active', 'pending')),
    created_at  timestamptz not null default now()
);

create table if not exists public.categories (
    id          text primary key,
    name        text not null,
    description text,
    image       text,
    sort_order  int not null default 0
);

create table if not exists public.products (
    id           bigint generated always as identity primary key,
    name         text not null unique,
    category_id  text not null references public.categories(id) on delete restrict,
    price        numeric not null check (price >= 0),
    sizes        text[] not null default '{}',
    colors       text[] not null default '{}',
    image        text,
    images       text[] not null default '{}',
    description  text,
    featured     boolean not null default false,
    stock        int not null default 0 check (stock >= 0),
    -- Estado manual del producto:
    --   'disponible' = en stock normal
    --   'agotado'    = sin stock, no se puede comprar
    --   'a_pedido'   = se hace por encargo (no muestra stock, no descuenta stock)
    --   'pocas'      = quedan pocas unidades (sí descuenta stock)
    status        text not null default 'disponible' check (status in ('disponible', 'agotado', 'a_pedido', 'pocas')),
    badge        text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- Los productos que ya existían quedan con su estado inicial coherente.
update public.products set status = 'agotado' where stock <= 0 and status = 'disponible';

create sequence if not exists public.order_number_seq start 1;

create table if not exists public.orders (
    id              bigint generated always as identity primary key,
    order_number    text not null unique default ('PF-' || lpad(nextval('public.order_number_seq')::text, 4, '0')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    customer_name   text not null,
    customer_email  text not null,
    customer_phone  text not null,
    -- Las entregas son presenciales en estaciones de Metro de Santiago; estos campos
    -- quedan opcionales (se coordina el punto exacto y los envíos a otras zonas por WhatsApp).
    customer_address text,
    customer_city   text,
    customer_region text,
    note            text,
    items           jsonb not null,
    subtotal        numeric not null,
    shipping        numeric not null default 0,
    total           numeric not null,
    status          text not null default 'pending'
                    check (status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
    payment_method  text not null default 'transfer'
);

create table if not exists public.config (
    id                  int primary key default 1 check (id = 1),
    store_name          text not null default 'PopFlame',
    whatsapp_number     text,
    shipping_cost       numeric not null default 5990,
    free_shipping_min   numeric not null default 50000,
    currency            text not null default 'CLP',
    hero_title          text default 'NUEVA COLECCIÓN',
    hero_subtitle       text default 'Streetwear que quema',
    social_instagram    text,
    social_tiktok       text,
    social_twitter      text,
    logo_url            text,
    logo_white_url      text,
    hero_banner_url     text,
    updated_at          timestamptz not null default now()
);

-- Slides del carrusel del hero (portada del sitio). Si esta tabla está vacía,
-- el sitio sigue mostrando el hero único de config (hero_banner_url/hero_title/...).
create table if not exists public.banners (
    id           bigint generated always as identity primary key,
    title        text,
    subtitle     text,
    media_url    text not null,
    link_url     text,
    sort_order   int not null default 0,
    active       boolean not null default true,
    created_at   timestamptz not null default now()
);

-- Páginas de contenido editable (Envíos, Devoluciones, Guía de Talles, Contacto...),
-- enlazadas desde el footer. El contenido admite HTML simple (negritas, párrafos,
-- listas) porque solo lo escribe el super_admin.
create table if not exists public.pages (
    slug         text primary key,
    title        text not null,
    content      text not null default '',
    updated_at   timestamptz not null default now()
);

-- Suscriptores del newsletter (footer "ÚNETE AL CLUB POPFLAME"). Reciben el correo de
-- bienvenida al suscribirse y el aviso de "producto nuevo" (ver supabase/functions/).
create table if not exists public.subscribers (
    id             bigint generated always as identity primary key,
    email          text not null unique,
    active         boolean not null default true,
    subscribed_at  timestamptz not null default now()
);

-- Medida real de cada talla por categoría (ej. poleras/S = "48cm"). Se muestra junto a la
-- talla seleccionada en la ficha de producto, para no obligar a mirar la guía de talles aparte.
create table if not exists public.size_guide (
    id           bigint generated always as identity primary key,
    category_id  text not null references public.categories(id) on delete cascade,
    size         text not null,
    measurement  text not null,
    -- Tabla de medidas detallada (Largo, Ancho pecho, Largo manga, Ancho hombro, etc.),
    -- guardada como { "Nombre de la medida": "valor" }. Las columnas de la tabla son
    -- las que el super_admin defina en el panel, no están fijas en el código.
    measurements jsonb not null default '{}'::jsonb,
    sort_order   int not null default 0,
    unique (category_id, size)
);

alter table public.size_guide add column if not exists measurements jsonb not null default '{}'::jsonb;


-- ---------------------------------------------------------
-- 1.5 COLUMNAS AGREGADAS DESPUÉS (para bases creadas con una versión anterior)
-- ---------------------------------------------------------
-- Estado del producto
alter table public.products add column if not exists status text;

update public.products set status = 'agotado'    where stock <= 0 and status is null;
update public.products set status = 'disponible' where stock > 0  and status is null;
update public.products set status = 'disponible' where status is null;

alter table public.products alter column status set default 'disponible';
alter table public.products alter column status set not null;

-- La restricción se rehace completa para que acepte los 4 estados.
alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
    check (status in ('disponible', 'agotado', 'a_pedido', 'pocas'));

-- Marca de stock aplicado en los pedidos (la usa el trigger de stock).
alter table public.orders add column if not exists stock_applied boolean not null default false;

-- Los pedidos ya pagados de antes se marcan como aplicados para no descontar dos veces.
update public.orders set stock_applied = true
 where status in ('confirmed', 'processing', 'shipped', 'delivered') and not stock_applied;

-- Datos de pago que ve el cliente al confirmar el pedido.
alter table public.config add column if not exists transfer_info text;

-- Estado de las cuentas (activo / pendiente).
alter table public.profiles add column if not exists status text;

-- Quien no tenga un rol válido pasa a admin pendiente de aprobación.
update public.profiles
   set role = 'admin', status = 'pending'
 where role is null or role not in ('admin', 'super_admin');

-- Las cuentas que ya existían y eran admin/super_admin quedan activas.
update public.profiles
   set status = case
        when status = 'active'  then 'active'
        when status = 'pending' then 'pending'
        when status is null     then 'active'
        else 'pending'
   end;

alter table public.profiles alter column role   set default 'admin';
alter table public.profiles alter column status set default 'pending';
alter table public.profiles alter column status set not null;

-- "pending" es un ESTADO, no un rol: solo existen admin y super_admin.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
    check (role in ('super_admin', 'admin'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
    check (status in ('active', 'pending'));


-- ---------------------------------------------------------
-- 2. ROLES, ACCESO AL PANEL Y PROTECCIÓN DE CUENTAS
--    Roles: admin / super_admin. Estado: active / pending.
--    Toda cuenta nueva queda PENDIENTE (sin acceso) hasta que un Super Admin la active.
--    La primera cuenta se activa a mano en el SQL Editor (ver el final de este archivo).
-- ---------------------------------------------------------
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

-- Toda cuenta nueva queda pendiente hasta que un Super Admin la apruebe.
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

-- Login del panel con nombre de usuario: devuelve el correo solo de cuentas ACTIVAS.
create or replace function public.email_for_username(p_username text)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
    select u.email::text
      from auth.users u
      join public.profiles p on p.id = u.id
     where lower(p.username) = lower(trim(p_username))
       and p.status = 'active'
     limit 1;
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- Solo un Super Admin activo puede cambiar roles, estados o nombres de usuario,
-- y siempre debe quedar al menos un Super Admin activo.
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
-- 3. TRIGGERS GENERALES
--    (Histórico) el trigger que limitaba al admin (dueño) a solo tocar el stock de
--    products ya no aplica: admin y super_admin tienen los mismos permisos sobre
--    productos, banners y tallas. Se elimina si existía de una instalación anterior.
-- ---------------------------------------------------------

drop trigger if exists trg_products_restrict_admin_update on public.products;
drop function if exists public.products_restrict_admin_update();

-- updated_at genérico para orders/config
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
    before update on public.orders
    for each row execute procedure public.set_updated_at();

drop trigger if exists trg_config_updated_at on public.config;
create trigger trg_config_updated_at
    before update on public.config
    for each row execute procedure public.set_updated_at();

drop trigger if exists trg_pages_updated_at on public.pages;
create trigger trg_pages_updated_at
    before update on public.pages
    for each row execute procedure public.set_updated_at();

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
    before update on public.products
    for each row execute procedure public.set_updated_at();

-- Cuando un pedido se marca "confirmed" (pagado/confirmado), pasa automáticamente
-- a "processing" (en preparación). No toca shipped/delivered/cancelled: esos
-- siguen siendo 100% manuales porque dependen de una acción real (despachar, etc.).
create or replace function public.orders_auto_processing()
returns trigger
language plpgsql as $$
begin
    if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
        new.status := 'processing';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_orders_auto_processing on public.orders;
create trigger trg_orders_auto_processing
    before update on public.orders
    for each row execute procedure public.orders_auto_processing();

-- Avisa a la Edge Function "notify-new-product" cada vez que se crea un producto,
-- para que le mande el correo a los suscriptores. Se hace con un trigger + pg_net en
-- vez de la interfaz "Database Webhooks" del dashboard porque en algunos proyectos
-- esa función del dashboard falla por un schema interno que no se crea solo
-- (error "schema supabase_functions does not exist").
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform net.http_post(
        url := 'https://ysxinhpymvhdnfbdanvn.supabase.co/functions/v1/notify-new-product',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer sb_publishable_WHh5SfBgWKa7_XhFQRxGqQ_SrWk_u9H'
        ),
        body := jsonb_build_object(
            'type', 'INSERT',
            'table', 'products',
            'record', row_to_json(new)::jsonb
        )
    );
    return new;
end;
$$;

drop trigger if exists trg_notify_new_product on public.products;
create trigger trg_notify_new_product
    after insert on public.products
    for each row execute procedure public.notify_new_product();

-- ---------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.categories enable row level security;
alter table public.products  enable row level security;
alter table public.orders    enable row level security;
alter table public.config    enable row level security;
alter table public.banners   enable row level security;
alter table public.pages     enable row level security;
alter table public.subscribers enable row level security;
alter table public.size_guide enable row level security;

-- profiles
drop policy if exists "profiles_select_own_or_super" on public.profiles;
create policy "profiles_select_own_or_super" on public.profiles
    for select using (id = auth.uid() or public.is_super_admin());

drop policy if exists "profiles_update_own_or_super" on public.profiles;
create policy "profiles_update_own_or_super" on public.profiles
    for update using (id = auth.uid() or public.is_super_admin())
    with check (id = auth.uid() or public.is_super_admin());

-- categories: lectura pública, escritura admin y super_admin
drop policy if exists "categories_select_public" on public.categories;
create policy "categories_select_public" on public.categories
    for select using (true);

drop policy if exists "categories_write_super_admin" on public.categories;
drop policy if exists "categories_write_admins" on public.categories;
create policy "categories_write_admins" on public.categories
    for all using (public.is_admin()) with check (public.is_admin());

-- Productos: lectura pública. Insert/update/delete permitido a admin y super_admin
-- por igual (el dueño puede gestionar el catálogo completo, no solo el stock).
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public" on public.products
    for select using (true);

drop policy if exists "products_insert_super_admin" on public.products;
drop policy if exists "products_insert_admins" on public.products;
create policy "products_insert_admins" on public.products
    for insert with check (public.is_admin());

drop policy if exists "products_delete_super_admin" on public.products;
drop policy if exists "products_delete_admins" on public.products;
create policy "products_delete_admins" on public.products
    for delete using (public.is_admin());

drop policy if exists "products_update_admins" on public.products;
create policy "products_update_admins" on public.products
    for update using (public.is_admin()) with check (public.is_admin());

-- orders: nadie inserta directo desde la API (ni anónimos ni admins): el checkout usa la
-- función create_order (sección 8), que calcula precios y totales en el servidor.
-- Solo admin/super_admin pueden verlos o actualizarlos; solo super_admin puede borrarlos.
drop policy if exists "orders_insert_public" on public.orders;
drop policy if exists "orders_insert_admins" on public.orders;
revoke insert on table public.orders from public, anon, authenticated;

drop policy if exists "orders_select_admins" on public.orders;
create policy "orders_select_admins" on public.orders
    for select using (public.is_admin());

drop policy if exists "orders_update_admins" on public.orders;
create policy "orders_update_admins" on public.orders
    for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders_delete_super_admin" on public.orders;
create policy "orders_delete_super_admin" on public.orders
    for delete using (public.is_super_admin());

-- config: lectura pública (el sitio necesita whatsapp/envío), escritura solo super_admin
drop policy if exists "config_select_public" on public.config;
create policy "config_select_public" on public.config
    for select using (true);

drop policy if exists "config_write_super_admin" on public.config;
create policy "config_write_super_admin" on public.config
    for all using (public.is_super_admin()) with check (public.is_super_admin());

-- banners: lectura pública, escritura solo super_admin
drop policy if exists "banners_select_public" on public.banners;
create policy "banners_select_public" on public.banners
    for select using (true);

-- banners: escritura permitida a admin y super_admin por igual
drop policy if exists "banners_write_super_admin" on public.banners;
drop policy if exists "banners_write_admins" on public.banners;
create policy "banners_write_admins" on public.banners
    for all using (public.is_admin()) with check (public.is_admin());

-- pages: lectura pública, escritura solo super_admin
drop policy if exists "pages_select_public" on public.pages;
create policy "pages_select_public" on public.pages
    for select using (true);

drop policy if exists "pages_write_super_admin" on public.pages;
create policy "pages_write_super_admin" on public.pages
    for all using (public.is_super_admin()) with check (public.is_super_admin());

-- subscribers: cualquiera (incluso anónimo) puede suscribirse; solo super_admin puede
-- ver/editar/borrar la lista. Las Edge Functions usan la service_role key (no RLS).
drop policy if exists "subscribers_insert_public" on public.subscribers;
create policy "subscribers_insert_public" on public.subscribers
    for insert with check (true);

drop policy if exists "subscribers_manage_super_admin" on public.subscribers;
create policy "subscribers_manage_super_admin" on public.subscribers
    for select using (public.is_super_admin());

drop policy if exists "subscribers_update_super_admin" on public.subscribers;
create policy "subscribers_update_super_admin" on public.subscribers
    for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "subscribers_delete_super_admin" on public.subscribers;
create policy "subscribers_delete_super_admin" on public.subscribers
    for delete using (public.is_super_admin());

-- size_guide: lectura pública, escritura solo super_admin
drop policy if exists "size_guide_select_public" on public.size_guide;
create policy "size_guide_select_public" on public.size_guide
    for select using (true);

-- size_guide: escritura permitida a admin y super_admin por igual
drop policy if exists "size_guide_write_super_admin" on public.size_guide;
drop policy if exists "size_guide_write_admins" on public.size_guide;
create policy "size_guide_write_admins" on public.size_guide
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 5.5 STORAGE: buckets públicos para imágenes subidas desde el panel
--    - "product-images": fotos de prendas
--    - "site-assets": logo, logo blanco, banner del hero, fotos de categorías/banners
--    Lectura pública, escritura admin y super_admin (ambos gestionan catálogo).
--    (site-assets se permite a ambos porque banners/categorías con foto los
--    usa el dueño también; la tabla `config` sigue siendo solo super_admin,
--    así que el logo/hero no queda expuesto igual.)
-- ---------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760,
        array['image/png','image/jpeg','image/webp','image/svg+xml','image/gif'])
on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- site-assets acepta imágenes Y video/gif (logo o banner animado/en movimiento), hasta 50MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 52428800,
        array['image/png','image/jpeg','image/webp','image/svg+xml','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
    for select using (bucket_id = 'product-images');

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

drop policy if exists "site_assets_public_read" on storage.objects;
create policy "site_assets_public_read" on storage.objects
    for select using (bucket_id = 'site-assets');

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
-- 5.55 Entregas presenciales en Metro: si la tabla orders ya existía con estas
--    columnas obligatorias (versión anterior de este schema), las vuelve opcionales.
-- ---------------------------------------------------------

alter table public.orders alter column customer_address drop not null;
alter table public.orders alter column customer_city drop not null;
alter table public.orders alter column customer_region drop not null;

-- ---------------------------------------------------------
-- 5.6 Si la tabla products ya existía sin la restricción "unique (name)"
--    (versión anterior de este schema), esto limpia los duplicados que haya
--    dejado y agrega la restricción para que correr este script de nuevo
--    nunca vuelva a duplicar productos.
-- ---------------------------------------------------------

delete from public.products a using public.products b
where a.name = b.name and a.id > b.id;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'products_name_key'
    ) then
        alter table public.products add constraint products_name_key unique (name);
    end if;
end $$;

-- ---------------------------------------------------------
-- 6. DATOS INICIALES (categorías, productos, configuración)
-- ---------------------------------------------------------

insert into public.categories (id, name, description, image, sort_order) values
    ('poleras',     'Poleras',     'Poleras exclusivas con estampados PopFlame', null, 1),
    ('polerones',   'Polerones',   'Polerones premium streetwear',               null, 2),
    ('pantalones',  'Pantalones',  'Pantalones urbanos y cómodos',                null, 3),
    ('accesorios',  'Accesorios',  'Complementos para tu outfit',                 null, 4),
    ('chaquetas',   'Chaquetas',   'Chaquetas y denim PopFlame',                  null, 5)
on conflict (id) do nothing;

-- Limpia las rutas de ejemplo (images/categories/*.jpg) que dejó una versión anterior
-- de este script y que nunca existieron como archivo real; ahora las fotos se suben
-- de verdad desde el panel (Categorías > Foto de portada).
update public.categories
set image = null
where image like 'images/categories/%';

-- Productos reales con fotos en images/products/. Precio, tallas y stock son valores
-- genéricos de partida: se ajustan desde el panel (Productos > Editar).
-- "images" guarda rutas completas porque producto.html las resuelve igual que "image".
-- (La polera cuadro = "Polera PopFlame Básica" y la chaqueta = "Chaqueta Mezclilla PopFlame"
-- ya se crearon desde el panel con fotos en Storage; no se repiten aquí.)
insert into public.products (name, category_id, price, sizes, colors, image, images, description, featured, stock, badge) values
    ('Cartera PopFlame', 'accesorios', 39990, '{Única}', '{Gris}',
     'images/products/accesorios/cartera-3.jpg',
     '{images/products/accesorios/cartera-3.jpg,images/products/accesorios/cartera-4.jpg,images/products/accesorios/cartera-1.jpg,images/products/accesorios/cartera-2.jpg,images/products/accesorios/cartera-5.jpg,images/products/accesorios/cartera-6.jpg,images/products/accesorios/cartera-7.jpg,images/products/accesorios/cartera-8.jpg}',
     'Cartera tote con textura croco y colgante metálico PopFlame.', true, 10, 'Nuevo'),
    ('Collar PopFlame', 'accesorios', 24990, '{Única}', '{Plateado}',
     'images/products/accesorios/joya-1.jpg',
     '{images/products/accesorios/joya-1.jpg,images/products/accesorios/joya-2.jpg,images/products/accesorios/joya-3.jpg}',
     'Collar de cadena plateada con dije del logo PopFlame.', true, 10, 'Nuevo')
on conflict (name) do nothing;

insert into public.config (id, store_name, whatsapp_number, shipping_cost, free_shipping_min, currency, hero_title, hero_subtitle)
values (1, 'PopFlame', null, 5990, 50000, 'CLP', 'NUEVA COLECCIÓN', 'Streetwear que quema')
on conflict (id) do nothing;

insert into public.size_guide (category_id, size, measurement, sort_order) values
    ('poleras', 'S', '48cm', 1),
    ('poleras', 'M', '51cm', 2),
    ('poleras', 'L', '54cm', 3),
    ('poleras', 'XL', '57cm', 4),
    ('polerones', 'S', '54cm', 1),
    ('polerones', 'M', '57cm', 2),
    ('polerones', 'L', '60cm', 3),
    ('polerones', 'XL', '63cm', 4),
    ('pantalones', '28', '71cm', 1),
    ('pantalones', '30', '76cm', 2),
    ('pantalones', '32', '81cm', 3),
    ('pantalones', '34', '86cm', 4),
    ('chaquetas', 'S', '56cm', 1),
    ('chaquetas', 'M', '59cm', 2),
    ('chaquetas', 'L', '62cm', 3),
    ('chaquetas', 'XL', '65cm', 4)
on conflict (category_id, size) do nothing;

insert into public.pages (slug, title, content) values
    ('envios', 'Envíos',
     '<p>Las entregas se coordinan de forma <strong>presencial en estaciones de Metro de Santiago</strong>, sin costo de envío.</p>' ||
     '<p>Si necesitas despacho a otra región o a una zona alejada de Santiago, lo coordinamos directamente por WhatsApp una vez confirmado tu pedido, y puede tener un costo adicional según la zona.</p>'),
    ('devoluciones', 'Devoluciones',
     '<p>Si tu producto llega con algún problema de fabricación, escríbenos por WhatsApp dentro de las 48 horas después de recibirlo y lo solucionamos.</p>' ||
     '<p>Los cambios de talla están sujetos a disponibilidad de stock.</p>'),
    ('guia-de-talles', 'Guía de Talles',
     '<p>Debajo de este texto vas a encontrar la tabla de medidas real de cada categoría.</p>'),
    ('contacto', 'Contacto',
     '<p>Escríbenos por WhatsApp o Instagram y te respondemos a la brevedad.</p>')
on conflict (slug) do nothing;

-- Si ya tenías la página "guia-de-talles" con el texto viejo (números fijos que ahora
-- duplicaban la tabla dinámica), la reemplaza. No toca la fila si ya la editaste a mano
-- con otro contenido distinto al default original.
update public.pages
set content = '<p>Debajo de este texto vas a encontrar la tabla de medidas real de cada categoría.</p>'
where slug = 'guia-de-talles'
  and content like '%Poleras:%S (48cm)%';

-- ---------------------------------------------------------
-- 7. INVENTARIO Y AUDITORÍA
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

-- Cada cambio de stock deja un movimiento auditable.
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

-- Ajuste de stock con control de concurrencia (dos admins a la vez).
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

-- Auditoría: registra cambios operativos, sin credenciales ni datos de pago privados.
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
        if v_before_source is not null then v_before := jsonb_build_object('name', v_before_source->>'name', 'category_id', v_before_source->>'category_id', 'price', v_before_source->>'price', 'stock', v_before_source->>'stock', 'sizes', v_before_source->'sizes', 'colors', v_before_source->>'colors', 'featured', v_before_source->>'featured', 'badge', v_before_source->>'badge'); end if;
        if v_after_source is not null then v_after := jsonb_build_object('name', v_after_source->>'name', 'category_id', v_after_source->>'category_id', 'price', v_after_source->>'price', 'stock', v_after_source->>'stock', 'sizes', v_after_source->'sizes', 'colors', v_after_source->>'colors', 'featured', v_after_source->>'featured', 'badge', v_after_source->>'badge'); end if;
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


-- ---------------------------------------------------------
-- 8. STOCK AUTOMÁTICO Y CHECKOUT
--    El navegador solo manda qué productos y cantidades; nombre, precio, stock y total
--    los calcula el servidor desde la tabla products (nadie puede alterar un precio).
-- ---------------------------------------------------------

-- Stock: se descuenta al marcar el pedido como pagado y se repone al cancelar.
-- Los productos "A Pedido" NO entran: se hacen bajo encargo.
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
               and (status is null or status <> 'a_pedido')
            returning stock into v_stock;
            if not found and exists (
                select 1 from public.products
                 where id = v_product_id and (status is null or status <> 'a_pedido')
            ) then
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
               and (status is null or status <> 'a_pedido');
            perform set_config('popflame.stock_reason', '', true);
            perform set_config('popflame.stock_order_id', '', true);
        end loop;
        new.stock_applied := false;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_orders_z_apply_stock on public.orders;
create trigger trg_orders_z_apply_stock
    before update on public.orders
    for each row execute procedure public.orders_apply_stock();

-- Checkout: el servidor calcula los precios y valida el stock.
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

    -- Stock: los productos 'a_pedido' se aceptan siempre (se hacen por encargo).
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

-- ---------------------------------------------------------
-- 9. NEWSLETTER
-- ---------------------------------------------------------
create or replace function public.unsubscribe_newsletter(p_email text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
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
language plpgsql security definer set search_path = public, pg_temp as $$
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


-- =========================================================
-- Fin del schema. Siguiente paso:
--   1. Authentication > Users > Add user > Create new user (marca Auto Confirm User).
--   2. Activa esa primera cuenta como Super Admin aquí mismo en el SQL Editor:
--        update public.profiles set role = 'super_admin', status = 'active'
--         where id = (select id from auth.users where lower(email) = lower('tu-correo@popflame.cl'));
--   Las cuentas siguientes quedan pendientes y se aprueban desde el panel (Usuarios).
-- =========================================================
