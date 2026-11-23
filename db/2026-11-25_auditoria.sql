-- =========================================================
-- PopFlame · Correcciones de la auditoría (noviembre 2026)
-- Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > New query > Run
-- (después de 2026-11-24_baja_con_codigo.sql). Se puede volver a ejecutar.
--
-- Qué corrige:
--   1. Newsletter: cada producto se anuncia UNA sola vez (columna newsletter_sent_at).
--      Antes cualquiera con la clave pública podía llamar a la Edge Function muchas veces
--      durante 15 minutos y mandar el mismo correo repetido a todos los suscriptores.
--   2. Stock al cancelar: se repone exactamente lo que se descontó (según el historial de
--      inventario del pedido), no lo que diga el estado actual del producto.
--   3. Un pedido con stock descontado no se puede eliminar: primero se cancela (así el
--      stock vuelve). Antes, eliminarlo dejaba el stock descontado para siempre.
--   4. Login del panel: se elimina email_for_username. Revelaba a cualquier visitante el
--      correo de cada cuenta activa. Ahora se entra con el correo completo.
--   5. Cuentas nuevas con el mismo nombre antes de la @ (juan@gmail.com y juan@hotmail.com)
--      ya no fallan: la segunda queda como "juan2".
--   6. Los buckets de imágenes ya no aceptan SVG (un SVG puede llevar scripts).
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Newsletter: marca de "ya anunciado"
-- ---------------------------------------------------------
alter table public.products add column if not exists newsletter_sent_at timestamptz;

-- Los productos que ya existían no se vuelven a anunciar.
update public.products
   set newsletter_sent_at = created_at
 where newsletter_sent_at is null
   and created_at < now() - interval '15 minutes';

-- ---------------------------------------------------------
-- 2. Stock: descuento al pagar y reposición exacta al cancelar
-- ---------------------------------------------------------
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
        if exists (select 1 from public.inventory_movements where order_id = new.id) then
            -- Se repone exactamente lo que este pedido descontó (neto de reversas anteriores).
            -- Así no importa si el producto cambió de estado (ej. "A Pedido" <-> "Disponible")
            -- entre el pago y la cancelación.
            for v_product_id, v_quantity in
                select product_id, (-sum(delta))::integer
                  from public.inventory_movements
                 where order_id = new.id and product_id is not null
                 group by 1
                having sum(delta) < 0
                 order by 1
            loop
                perform set_config('popflame.stock_reason', 'Reversa del pedido ' || new.order_number, true);
                perform set_config('popflame.stock_order_id', new.id::text, true);
                update public.products set stock = stock + v_quantity where id = v_product_id;
                perform set_config('popflame.stock_reason', '', true);
                perform set_config('popflame.stock_order_id', '', true);
            end loop;
        else
            -- Pedidos pagados antes de que existiera el historial de inventario: se repone
            -- según los productos del pedido, como antes.
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
        end if;
        new.stock_applied := false;
    end if;
    return new;
end;
$$;

-- ---------------------------------------------------------
-- 3. No eliminar pedidos con stock descontado
-- ---------------------------------------------------------
create or replace function public.orders_block_delete_applied()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
    if old.stock_applied then
        raise exception 'Este pedido ya descontó stock. Cancélalo primero (así el stock vuelve) y después elimínalo.';
    end if;
    return old;
end;
$$;

drop trigger if exists trg_orders_block_delete_applied on public.orders;
create trigger trg_orders_block_delete_applied
    before delete on public.orders
    for each row execute procedure public.orders_block_delete_applied();

-- ---------------------------------------------------------
-- 4. Login solo con correo: se elimina la búsqueda pública de correos
-- ---------------------------------------------------------
drop function if exists public.email_for_username(text);

-- ---------------------------------------------------------
-- 5. Cuentas nuevas: nombre de usuario único aunque se repita lo de antes de la @
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_base text := lower(split_part(coalesce(new.email, ''), '@', 1));
    v_username text;
    v_n integer := 1;
begin
    if v_base = '' then raise exception 'El usuario necesita un correo válido'; end if;
    v_username := v_base;
    while exists (select 1 from public.profiles where lower(username) = v_username) loop
        v_n := v_n + 1;
        v_username := v_base || v_n;
    end loop;
    insert into public.profiles (id, username, role, status, name)
    values (new.id, v_username, 'admin', 'pending', v_username)
    on conflict (id) do nothing;
    return new;
end;
$$;

-- ---------------------------------------------------------
-- 6. Buckets sin SVG
-- ---------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
 where id = 'product-images';

update storage.buckets
   set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
 where id = 'site-assets';

commit;
