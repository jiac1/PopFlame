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
    name         text not null,
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
    customer_address text not null,
    customer_city   text not null,
    customer_region text not null,
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

-- ---------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.categories enable row level security;
alter table public.products  enable row level security;
alter table public.orders    enable row level security;
alter table public.config    enable row level security;

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

-- ---------------------------------------------------------
-- 5.5 STORAGE: buckets públicos para imágenes subidas desde el panel
--    - "product-images": fotos de prendas
--    - "site-assets": logo, logo blanco, banner del hero
--    Lectura pública, escritura solo super_admin.
-- ---------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

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
-- 6. DATOS INICIALES (categorías, productos, configuración)
-- ---------------------------------------------------------

insert into public.categories (id, name, description, image, sort_order) values
    ('poleras',     'Poleras',     'Poleras exclusivas con estampados PopFlame', 'images/categories/poleras.jpg', 1),
    ('polerones',   'Polerones',   'Polerones premium streetwear',               'images/categories/polerones.jpg', 2),
    ('pantalones',  'Pantalones',  'Pantalones urbanos y cómodos',                'images/categories/pantalones.jpg', 3),
    ('accesorios',  'Accesorios',  'Complementos para tu outfit',                 'images/categories/accesorios.jpg', 4)
on conflict (id) do nothing;

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
on conflict do nothing;

insert into public.config (id, store_name, whatsapp_number, shipping_cost, free_shipping_min, currency, hero_title, hero_subtitle)
values (1, 'PopFlame', null, 5990, 50000, 'CLP', 'NUEVA COLECCIÓN', 'Streetwear que quema')
on conflict (id) do nothing;

-- =========================================================
-- Fin del schema. Siguiente paso: crear los usuarios de acceso en
-- Authentication > Users > Add user (ver README.md).
-- =========================================================
