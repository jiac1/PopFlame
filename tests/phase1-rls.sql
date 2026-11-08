-- SUITE HISTÓRICA: crea fixtures de catálogo. NO ejecutar en esta etapa.
-- El runner actual usa security-rls.sql y no crea productos.
-- SOLO base desechable/staging sin integraciones externas. Fixtures ficticios.
-- run-sql-tests.py crea la base local y aplica solo DDL extraído + migraciones.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'FAIL: %', label; end if;
    raise notice 'PASS: %', label;
end;
$$;
create function pg_temp.denied(query text, label text, zero_ok boolean default false)
returns void language plpgsql as $$
declare n bigint;
begin
    begin
        execute query;
        get diagnostics n = row_count;
        if zero_ok and n = 0 then raise notice 'PASS: % (0 rows)', label; return; end if;
    exception when insufficient_privilege then raise notice 'PASS: % (42501)', label; return;
    end;
    raise exception 'FAIL: operation allowed: %', label;
end;
$$;
create function pg_temp.invalid_order(items jsonb, label text) returns void language plpgsql as $$
begin
    begin
        perform public.create_order('{"name":"Test Buyer","email":"buyer@example.invalid","phone":"912345678"}', items);
    exception when raise_exception then raise notice 'PASS: %', label; return;
    end;
    raise exception 'FAIL: invalid order accepted: %', label;
end;
$$;

insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-000000000001', 'super@example.invalid'),
    ('00000000-0000-4000-8000-000000000002', 'admin@example.invalid'),
    ('00000000-0000-4000-8000-000000000003', 'pending@example.invalid');
select pg_temp.assert_true((select bool_and(role = 'pending') from public.profiles), 'Every signup pending, including first signup');
update public.profiles set role = 'super_admin' where username = 'super';
update public.profiles set role = 'admin' where username = 'admin';
insert into public.categories(id, name) values ('__phase1', 'Fixture');
insert into public.products(name, category_id, price, stock, sizes, colors) values ('Fixture', '__phase1', 1000, 10, array['S', 'M'], array['Negro']);
insert into public.config(id, shipping_cost, free_shipping_min) values (1, 500, 10000);
update public.config set logo_url = 'https://example.invalid/storage/v1/object/public/site-assets/protected.png';
insert into storage.objects(bucket_id,name) values ('site-assets','protected.png');
insert into public.pages(slug, title) values ('__phase1', 'Fixture');
insert into public.orders(customer_name, customer_email, customer_phone, items, subtotal, total)
values ('Fixture', 'fixture@example.invalid', '900000000', '[]', 0, 0);
insert into public.subscribers(email) values ('subscriber@example.invalid');

-- Simula una policy heredada demasiado amplia: el guard debe seguir bloqueando.
create policy test_drift_categories on public.categories for all to public using (true) with check (true);
create policy test_drift_orders on public.orders for all to public using (true) with check (true);
create policy test_drift_profiles on public.profiles for all to public using (true) with check (true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"super_admin"}', true);
select pg_temp.assert_true(public.is_admin() and not public.is_super_admin(), 'JWT role claim cannot override profiles');
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'Admin sees own profile only');
select pg_temp.denied('update public.profiles set role = ''super_admin'' where username = ''admin''', 'Admin cannot self promote');
select pg_temp.denied('update public.profiles set username = ''hijack'' where username = ''admin''', 'Admin cannot change username');
select pg_temp.denied('update public.profiles set id = ''00000000-0000-4000-8000-000000000004'' where username = ''admin''', 'Profile identity immutable');
select pg_temp.denied('update public.profiles set created_at = now() + interval ''1 day'' where username = ''admin''', 'Profile creation time immutable');
select pg_temp.denied('update public.profiles set role = ''admin'' where username = ''pending''', 'Admin cannot approve another profile', true);
select pg_temp.denied('insert into public.profiles(id,username,role) values (gen_random_uuid(), ''injected'', ''super_admin'')', 'No direct profile insert');
select pg_temp.denied('delete from public.profiles where username = ''admin''', 'No direct profile delete');

-- CRUD real sobre fixtures para cada rol (incluye tallas, banners y Storage).
do $$
declare uid text; label text; pid bigint; bid bigint; sid bigint; media uuid; n bigint;
begin
    foreach uid in array array['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'] loop
        perform set_config('request.jwt.claims', jsonb_build_object('sub', uid)::text, true);
        label := public.current_role_name();
        insert into public.categories(id,name) values ('__crud_' || label, 'CRUD');
        update public.categories set description = 'edited' where id = '__crud_' || label;
        get diagnostics n = row_count;
        perform pg_temp.assert_true(n = 1, label || ' category update');
        insert into public.products(name,category_id,price,stock,sizes,colors,description)
        values ('CRUD ' || label, '__crud_' || label, 2000, 5, array['M'], array['Rojo'], 'test') returning id into pid;
        update public.products set price = 2100, stock = 6, sizes = array['M','L'], colors = array['Negro'], description = 'edited' where id = pid;
        get diagnostics n = row_count;
        perform pg_temp.assert_true(n = 1, label || ' product update incl inventory and variants');
        insert into public.size_guide(category_id,size,measurement) values ('__crud_' || label,'M','50 cm') returning id into sid;
        update public.size_guide set measurement = '51 cm' where id = sid;
        delete from public.size_guide where id = sid;
        insert into public.banners(media_url) values ('https://example.invalid/fixture.png') returning id into bid;
        update public.banners set title = 'edited' where id = bid;
        delete from public.banners where id = bid;
        foreach label in array array['product-images', 'site-assets'] loop
            insert into storage.objects(bucket_id,name) values (label, 'fixture.png') returning id into media;
            update storage.objects set name = 'fixture-edited.png' where id = media;
            get diagnostics n = row_count;
            perform pg_temp.assert_true(n = 1, public.current_role_name() || ' Storage update ' || label);
            delete from storage.objects where id = media;
        end loop;
        label := public.current_role_name();
        delete from public.products where id = pid;
        get diagnostics n = row_count;
        perform pg_temp.assert_true(n = 1, label || ' product delete');
        delete from public.categories where id = '__crud_' || label;
        get diagnostics n = row_count;
        perform pg_temp.assert_true(n = 1, label || ' category delete');
        perform pg_temp.assert_true((select count(*) = 1 from public.orders), label || ' orders read');
        update public.orders set note = 'edited';
        get diagnostics n = row_count;
        perform pg_temp.assert_true(n = 1, label || ' orders update');
    end loop;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002"}', true);
select pg_temp.denied('delete from public.orders', 'Admin cannot delete orders even with permissive drift', true);
select pg_temp.denied('update public.config set store_name = ''blocked''', 'Admin cannot change config/payments', true);
select pg_temp.denied('update public.pages set title = ''blocked''', 'Admin cannot edit advanced pages', true);
select pg_temp.assert_true((select count(*) = 0 from public.subscribers), 'Admin cannot read subscriber administration');
select pg_temp.assert_true((select count(*) = 0 from public.panel_role_audit), 'Admin cannot read role audit');
select pg_temp.denied('update storage.objects set metadata = ''{}'' where name = ''protected.png''', 'Admin cannot overwrite technical logo', true);
select pg_temp.denied('delete from storage.objects where name = ''protected.png''', 'Admin cannot delete technical logo', true);
do $$ begin
    begin
        delete from public.categories where id = '__phase1';
    exception when integrity_constraint_violation then raise notice 'PASS: FK protects category with products'; return;
    end;
    raise exception 'FAIL: deleted category with products';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001"}', true);
update public.config set store_name = 'Fixture supervision';
update public.pages set title = 'Fixture edited';
update storage.objects set metadata = '{"verified":true}' where name = 'protected.png';
select pg_temp.assert_true((select metadata->>'verified' = 'true' from storage.objects where name = 'protected.png'), 'Super Admin can manage technical logo');
select pg_temp.assert_true((select count(*) = 3 from public.profiles), 'Super Admin sees all profiles');
select pg_temp.assert_true((select count(*) = 1 from public.subscribers), 'Super Admin sees subscribers');
select pg_temp.denied('update public.profiles set role = ''admin'' where username = ''super''', 'Super Admin cannot change own role');
update public.profiles set role = 'pending' where username = 'admin';
select pg_temp.assert_true((select count(*) > 0 from public.panel_role_audit where old_role = 'admin' and new_role = 'pending'), 'Role changes audited');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002"}', true);
select pg_temp.assert_true(not public.is_admin(), 'Role change applies with unchanged JWT sub');
select pg_temp.denied('insert into public.categories(id,name) values (''__revoked'',''blocked'')', 'Demotion revokes writes immediately');
select pg_temp.assert_true((select count(*) = 0 from public.orders), 'Demotion revokes order reads immediately');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003"}', true);
select pg_temp.assert_true(not public.is_admin() and not public.is_super_admin(), 'Pending has no panel role');
select pg_temp.denied('update public.products set price = 1', 'Pending cannot edit products', true);
select pg_temp.denied('insert into public.banners(media_url) values (''x'')', 'Pending cannot insert banners');
select pg_temp.denied('insert into public.size_guide(category_id,size,measurement) values (''__phase1'',''L'',''x'')', 'Pending cannot insert size guide');
select pg_temp.denied('insert into storage.objects(bucket_id,name) values (''product-images'',''blocked.png'')', 'Pending cannot upload');
select pg_temp.denied('update public.profiles set role = ''super_admin'' where username = ''pending''', 'Pending cannot self promote');
select set_config('request.jwt.claims', '{}', true);
select pg_temp.denied('update public.profiles set role = ''super_admin''', 'Null identity is not a privileged API session', true);

set local role anon;
select pg_temp.assert_true((select count(*) = 0 from public.orders), 'Anonymous cannot read orders');
select pg_temp.assert_true((select count(*) = 1 from public.products), 'Public catalog still readable');
select pg_temp.denied('insert into public.categories(id,name) values (''__anon'',''blocked'')', 'Anonymous cannot create categories');
select pg_temp.denied('insert into storage.objects(bucket_id,name) values (''site-assets'',''blocked.png'')', 'Anonymous cannot upload');
select pg_temp.denied('insert into public.orders(customer_name,customer_email,customer_phone,items,subtotal,total) values (''bad'',''bad'',''bad'',''[]'',0,0)', 'Direct checkout insertion denied');
select pg_temp.invalid_order(null, 'NULL cart rejected');
select pg_temp.invalid_order('{}', 'Object cart rejected');
select pg_temp.invalid_order('[]', 'Empty cart rejected');
select pg_temp.invalid_order('[{"productId":1,"quantity":-3}]', 'Negative quantity rejected');
select pg_temp.invalid_order('[{"productId":1,"quantity":1.5}]', 'Fractional quantity rejected');
select pg_temp.invalid_order('[{"productId":1}]', 'Missing quantity rejected');
select pg_temp.invalid_order('[{"productId":1,"quantity":100}]', 'Excessive quantity rejected');
select pg_temp.invalid_order('[{"productId":1,"quantity":7},{"productId":1,"quantity":4}]', 'Duplicate lines checked against aggregate stock');
select pg_temp.invalid_order('[{"productId":999999,"quantity":1}]', 'Unknown product rejected');
select * from public.create_order(
    '{"name":"Test Buyer","email":"buyer@example.invalid","phone":"912345678","total":0}',
    '[{"productId":1,"quantity":2,"size":"S","color":"Negro","price":1,"name":"forged"}]');
reset role;
select pg_temp.assert_true((select total = 2500 and subtotal = 2000 and shipping = 500
    and items->0->>'name' = 'Fixture' and (items->0->>'price')::numeric = 1000
    and status = 'pending' and payment_method = 'transfer' and stock_applied = false
    from public.orders where customer_email = 'buyer@example.invalid'), 'RPC takes prices, names, shipping and status from server');
select pg_temp.assert_true((select stock = 10 from public.products where name = 'Fixture'), 'Checkout does not reserve or alter stock');
-- Los triggers comerciales históricos se conservan: descuento una vez al pagar,
-- reposición al cancelar. Solo sobre el producto ficticio de esta transacción.
update public.orders set status = 'confirmed' where customer_email = 'buyer@example.invalid';
select pg_temp.assert_true((select stock = 8 from public.products where name = 'Fixture'), 'Payment still applies stock once');
update public.orders set status = 'delivered' where customer_email = 'buyer@example.invalid';
select pg_temp.assert_true((select stock = 8 from public.products where name = 'Fixture'), 'Further paid transitions do not double deduct');
update public.orders set status = 'cancelled' where customer_email = 'buyer@example.invalid';
select pg_temp.assert_true((select stock = 10 from public.products where name = 'Fixture'), 'Cancellation restores fixture stock');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001"}', true);
delete from public.orders where customer_email = 'fixture@example.invalid';
select pg_temp.assert_true(not exists (select 1 from public.orders where customer_email = 'fixture@example.invalid'), 'Super Admin can permanently delete orders');
reset role;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.denied('update public.profiles set role = ''pending'' where username = ''super''', 'Cannot remove last Super Admin, including trusted SQL');
select pg_temp.denied('delete from auth.users where email = ''super@example.invalid''', 'Cannot cascade-delete last Super Admin');
rollback;
