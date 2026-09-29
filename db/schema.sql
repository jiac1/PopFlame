-- =========================================================
-- PopFlame - Schema de Supabase
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query > Run
-- Es seguro volver a ejecutarlo (usa IF NOT EXISTS / OR REPLACE donde aplica).
-- =========================================================

-- ---------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------

create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    username    text not null unique,
    name        text,
    role        text not null check (role in ('super_admin', 'admin')),
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
    badge        text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

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
-- 2. FUNCIONES AUXILIARES DE ROL
-- ---------------------------------------------------------

create or replace function public.current_role_name()
returns text
language sql stable security definer set search_path = public as $$
    select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role in ('admin', 'super_admin')
    );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'super_admin'
    );
$$;

-- RPC pública: mapea "usuario" -> email real para poder hacer login con username.
-- Solo devuelve el email si el username existe (no expone nada más).
create or replace function public.email_for_username(p_username text)
returns text
language sql security definer set search_path = public as $$
    select u.email::text
    from auth.users u
    join public.profiles p on p.id = u.id
    where p.username = p_username
    limit 1;
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;

-- ---------------------------------------------------------
-- 3. TRIGGER: crear perfil automáticamente al crear un usuario en Auth
--    Asigna el rol según el email usado (ver lista abajo).
--    IMPORTANTE: ajusta esta lista si cambias los emails de las cuentas.
-- ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, username, role, name)
    values (
        new.id,
        split_part(new.email, '@', 1),
        case
            when new.email = 'k1llu4@popflame.cl' then 'super_admin'
            when new.email = 'ariaspopflame@popflame.cl' then 'admin'
            else 'admin'
        end,
        split_part(new.email, '@', 1)
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------
-- 4. (Histórico) el trigger que limitaba al admin (dueño) a solo tocar el stock de
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

-- categories: lectura pública, escritura solo super_admin
drop policy if exists "categories_select_public" on public.categories;
create policy "categories_select_public" on public.categories
    for select using (true);

drop policy if exists "categories_write_super_admin" on public.categories;
create policy "categories_write_super_admin" on public.categories
    for all using (public.is_super_admin()) with check (public.is_super_admin());

-- products: lectura pública, insert/delete solo super_admin,
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

-- orders: cualquiera (incluso anónimo, checkout público) puede crear un pedido pendiente;
-- solo admin/super_admin pueden verlos o actualizarlos; solo super_admin puede borrarlos.
drop policy if exists "orders_insert_public" on public.orders;
create policy "orders_insert_public" on public.orders
    for insert with check (status = 'pending');

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
-- 7. CHECKOUT: función segura para crear pedidos
--    El navegador solo manda qué productos y cantidades; nombre, precio, stock y total
--    los calcula el servidor desde la tabla products (nadie puede alterar un precio).
-- ---------------------------------------------------------

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

-- ---------------------------------------------------------
-- 8. CUENTAS, SEGURIDAD DE ROLES, DATOS DE PAGO Y STOCK AUTOMÁTICO
--    (reemplaza el trigger de roles por correo de más arriba)
-- ---------------------------------------------------------

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

-- =========================================================
-- Fin del schema. Siguiente paso: crear tu cuenta en Authentication > Users > Add user.
-- La primera cuenta queda como Super Admin; las siguientes quedan pendientes de aprobación.
-- =========================================================
