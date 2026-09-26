-- =========================================================
-- PopFlame - Agrega Cartera, Collar y tallas de Chaquetas
-- Para una base que YA tiene el schema.sql aplicado (no toca nada existente).
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run
-- Precio, tallas y stock son genéricos: se ajustan desde el panel.
-- =========================================================

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

insert into public.size_guide (category_id, size, measurement, sort_order) values
    ('chaquetas', 'S', '56cm', 1),
    ('chaquetas', 'M', '59cm', 2),
    ('chaquetas', 'L', '62cm', 3),
    ('chaquetas', 'XL', '65cm', 4)
on conflict (category_id, size) do nothing;
