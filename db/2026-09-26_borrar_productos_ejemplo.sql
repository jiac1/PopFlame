-- =========================================================
-- PopFlame - Borra los 13 productos de ejemplo del schema original
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run
--
-- Solo borra un producto si sigue con su foto de ejemplo (images/products/...-N.jpg),
-- archivos que nunca existieron. Si a alguno ya le subiste una foto real desde el
-- panel, su imagen apunta a Supabase Storage y NO se borra.
-- Los pedidos no se ven afectados: guardan una copia de los productos en orders.items.
-- =========================================================

delete from public.products
where name in (
        'Polera PopFlame Logo',
        'Polera PopFlame Flame',
        'Polera PopFlame Urban',
        'Poleron PopFlame Zip',
        'Poleron PopFlame Oversized',
        'Poleron PopFlame Cropped',
        'Pantalón PopFlame Cargo',
        'Pantalón PopFlame Jogger',
        'Pantalón PopFlame Wide',
        'Gorra PopFlame Cap',
        'Gorro PopFlame Beanie',
        'Mochila PopFlame Bag',
        'Calcetines PopFlame Pack'
    )
  and image in (
        'images/products/poleras/polera-2.jpg',
        'images/products/poleras/polera-3.jpg',
        'images/products/poleras/polera-4.jpg',
        'images/products/polerones/poleron-2.jpg',
        'images/products/polerones/poleron-3.jpg',
        'images/products/polerones/poleron-4.jpg',
        'images/products/pantalones/pantalon-1.jpg',
        'images/products/pantalones/pantalon-2.jpg',
        'images/products/pantalones/pantalon-3.jpg',
        'images/products/accesorios/gorra-1.jpg',
        'images/products/accesorios/gorro-1.jpg',
        'images/products/accesorios/mochila-1.jpg',
        'images/products/accesorios/calcetines-1.jpg'
    )
returning id, name;
