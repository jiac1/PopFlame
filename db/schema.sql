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
    sort_order   int not null default 0,
    unique (category_id, size)
);

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
-- 4. TRIGGER: un admin (dueño) solo puede tocar el stock de products.
--    Un super_admin puede editar cualquier campo.
-- ---------------------------------------------------------

create or replace function public.products_restrict_admin_update()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if public.is_super_admin() then
        return new;
    end if;

    if public.is_admin() then
        if new.name is distinct from old.name
           or new.category_id is distinct from old.category_id
           or new.price is distinct from old.price
           or new.sizes is distinct from old.sizes
           or new.colors is distinct from old.colors
           or new.image is distinct from old.image
           or new.images is distinct from old.images
           or new.description is distinct from old.description
           or new.featured is distinct from old.featured
           or new.badge is distinct from old.badge then
            raise exception 'Como admin solo puedes actualizar el stock del producto';
        end if;
        new.updated_at := now();
        return new;
    end if;

    raise exception 'No autorizado';
end;
$$;

drop trigger if exists trg_products_restrict_admin_update on public.products;
create trigger trg_products_restrict_admin_update
    before update on public.products
    for each row execute procedure public.products_restrict_admin_update();

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
-- update permitido a admin y super_admin (el trigger restringe qué columnas puede tocar admin)
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public" on public.products
    for select using (true);

drop policy if exists "products_insert_super_admin" on public.products;
create policy "products_insert_super_admin" on public.products
    for insert with check (public.is_super_admin());

drop policy if exists "products_delete_super_admin" on public.products;
create policy "products_delete_super_admin" on public.products
    for delete using (public.is_super_admin());

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

drop policy if exists "banners_write_super_admin" on public.banners;
create policy "banners_write_super_admin" on public.banners
    for all using (public.is_super_admin()) with check (public.is_super_admin());

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

drop policy if exists "size_guide_write_super_admin" on public.size_guide;
create policy "size_guide_write_super_admin" on public.size_guide
    for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------
-- 5.5 STORAGE: buckets públicos para imágenes subidas desde el panel
--    - "product-images": fotos de prendas
--    - "site-assets": logo, logo blanco, banner del hero
--    Lectura pública, escritura solo super_admin.
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
create policy "product_images_super_admin_write" on storage.objects
    for insert with check (bucket_id = 'product-images' and public.is_super_admin());

drop policy if exists "product_images_super_admin_update" on storage.objects;
create policy "product_images_super_admin_update" on storage.objects
    for update using (bucket_id = 'product-images' and public.is_super_admin());

drop policy if exists "product_images_super_admin_delete" on storage.objects;
create policy "product_images_super_admin_delete" on storage.objects
    for delete using (bucket_id = 'product-images' and public.is_super_admin());

drop policy if exists "site_assets_public_read" on storage.objects;
create policy "site_assets_public_read" on storage.objects
    for select using (bucket_id = 'site-assets');

drop policy if exists "site_assets_super_admin_write" on storage.objects;
create policy "site_assets_super_admin_write" on storage.objects
    for insert with check (bucket_id = 'site-assets' and public.is_super_admin());

drop policy if exists "site_assets_super_admin_update" on storage.objects;
create policy "site_assets_super_admin_update" on storage.objects
    for update using (bucket_id = 'site-assets' and public.is_super_admin());

drop policy if exists "site_assets_super_admin_delete" on storage.objects;
create policy "site_assets_super_admin_delete" on storage.objects
    for delete using (bucket_id = 'site-assets' and public.is_super_admin());

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
    ('accesorios',  'Accesorios',  'Complementos para tu outfit',                 null, 4)
on conflict (id) do nothing;

-- Limpia las rutas de ejemplo (images/categories/*.jpg) que dejó una versión anterior
-- de este script y que nunca existieron como archivo real; ahora las fotos se suben
-- de verdad desde el panel (Categorías > Foto de portada).
update public.categories
set image = null
where image like 'images/categories/%';

insert into public.products (name, category_id, price, sizes, colors, image, images, description, featured, stock, badge) values
    ('Polera PopFlame Básica', 'poleras', 29990, '{S,M,L,XL}', '{Negro,Blanco}', 'images/products/poleras/polera-1.jpg', '{polera-1.jpg}', 'Polera de algodón 100% con estampado PopFlame. Diseño exclusivo streetwear.', true, 50, 'Nuevo'),
    ('Polera PopFlame Logo', 'poleras', 32990, '{S,M,L,XL}', '{Negro}', 'images/products/poleras/polera-2.jpg', '{polera-2.jpg}', 'Polera premium con logo bordado PopFlame. Edición limitada.', true, 30, 'Edición Limitada'),
    ('Polera PopFlame Flame', 'poleras', 34990, '{S,M,L,XL}', '{Negro,Rojo}', 'images/products/poleras/polera-3.jpg', '{polera-3.jpg}', 'Polera con estampado de llama PopFlame. 100% algodón.', false, 40, null),
    ('Polera PopFlame Urban', 'poleras', 29990, '{S,M,L,XL}', '{Blanco,Gris}', 'images/products/poleras/polera-4.jpg', '{polera-4.jpg}', 'Polera urbana con diseño minimalista PopFlame.', false, 45, null),
    ('Poleron PopFlame Hoodie', 'polerones', 59990, '{S,M,L,XL}', '{Negro,Gris}', 'images/products/polerones/poleron-1.jpg', '{poleron-1.jpg}', 'Poleron con capucha premium. Estampado PopFlame en pecho.', true, 25, 'Popular'),
    ('Poleron PopFlame Zip', 'polerones', 64990, '{S,M,L,XL}', '{Negro}', 'images/products/polerones/poleron-2.jpg', '{poleron-2.jpg}', 'Poleron con cierre full zip. Diseño premium streetwear.', true, 20, null),
    ('Poleron PopFlame Oversized', 'polerones', 69990, '{S,M,L,XL}', '{Gris,Negro}', 'images/products/polerones/poleron-3.jpg', '{poleron-3.jpg}', 'Poleron oversized con logo grande PopFlame en espalda.', false, 15, null),
    ('Poleron PopFlame Cropped', 'polerones', 54990, '{S,M,L}', '{Negro,Blanco}', 'images/products/polerones/poleron-4.jpg', '{poleron-4.jpg}', 'Poleron cropped para estilo urbano. Estampado frontal.', false, 30, null),
    ('Pantalón PopFlame Cargo', 'pantalones', 49990, '{28,30,32,34,36}', '{Negro,"Verde Militar"}', 'images/products/pantalones/pantalon-1.jpg', '{pantalon-1.jpg}', 'Pantalón cargo con bolsillos laterales. Tela resistente.', true, 35, null),
    ('Pantalón PopFlame Jogger', 'pantalones', 44990, '{S,M,L,XL}', '{Negro,Gris}', 'images/products/pantalones/pantalon-2.jpg', '{pantalon-2.jpg}', 'Jogger cómodo con elastano. Perfecto para el día a día.', false, 40, null),
    ('Pantalón PopFlame Wide', 'pantalones', 52990, '{28,30,32,34}', '{Negro}', 'images/products/pantalones/pantalon-3.jpg', '{pantalon-3.jpg}', 'Pantalón wide leg con estampado lateral PopFlame.', false, 25, null),
    ('Gorra PopFlame Cap', 'accesorios', 19990, '{Única}', '{Negro,Blanco,Rojo}', 'images/products/accesorios/gorra-1.jpg', '{gorra-1.jpg}', 'Gorra snapback con logo bordado PopFlame.', true, 60, 'Nuevo'),
    ('Gorro PopFlame Beanie', 'accesorios', 14990, '{Única}', '{Negro,Gris}', 'images/products/accesorios/gorro-1.jpg', '{gorro-1.jpg}', 'Gorro tejido con etiqueta PopFlame.', false, 50, null),
    ('Mochila PopFlame Bag', 'accesorios', 39990, '{Única}', '{Negro}', 'images/products/accesorios/mochila-1.jpg', '{mochila-1.jpg}', 'Mochila urbana con múltiples compartimentos y logo PopFlame.', false, 20, null),
    ('Calcetines PopFlame Pack', 'accesorios', 12990, '{S,M,L}', '{Negro,Blanco}', 'images/products/accesorios/calcetines-1.jpg', '{calcetines-1.jpg}', 'Pack de 3 pares de calcetines con logo PopFlame.', false, 100, null)
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
    ('pantalones', '34', '86cm', 4)
on conflict (category_id, size) do nothing;

insert into public.pages (slug, title, content) values
    ('envios', 'Envíos',
     '<p>Las entregas se coordinan de forma <strong>presencial en estaciones de Metro de Santiago</strong>, sin costo de envío.</p>' ||
     '<p>Si necesitas despacho a otra región o a una zona alejada de Santiago, lo coordinamos directamente por WhatsApp una vez confirmado tu pedido, y puede tener un costo adicional según la zona.</p>'),
    ('devoluciones', 'Devoluciones',
     '<p>Si tu producto llega con algún problema de fabricación, escríbenos por WhatsApp dentro de las 48 horas después de recibirlo y lo solucionamos.</p>' ||
     '<p>Los cambios de talla están sujetos a disponibilidad de stock.</p>'),
    ('guia-de-talles', 'Guía de Talles',
     '<p><strong>Poleras:</strong> S (48cm), M (51cm), L (54cm), XL (57cm)</p>' ||
     '<p><strong>Polerones:</strong> S (54cm), M (57cm), L (60cm), XL (63cm)</p>' ||
     '<p><strong>Chaquetas:</strong> S (55cm), M (58cm), L (61cm), XL (64cm)</p>' ||
     '<p><strong>Pantalones:</strong> 28 (71cm), 30 (76cm), 32 (81cm), 34 (86cm)</p>' ||
     '<p>* Medidas aproximadas del contorno del pecho/cintura.</p>'),
    ('contacto', 'Contacto',
     '<p>Escríbenos por WhatsApp o Instagram y te respondemos a la brevedad.</p>')
on conflict (slug) do nothing;

-- =========================================================
-- Fin del schema. Siguiente paso: crear los usuarios de acceso en
-- Authentication > Users > Add user (ver README.md).
-- =========================================================
