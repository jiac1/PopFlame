-- SOLO runner local desechable. No crea productos, archivos binarios ni conexiones externas.
begin;
create function pg_temp.assert_true(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'FAIL: %', label; end if;
    raise notice 'PASS: %', label;
end $$;
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
    raise exception 'FAIL: allowed: %', label;
end $$;
create function pg_temp.invalid(query text, label text) returns void language plpgsql as $$
begin
    begin execute query;
    exception when invalid_parameter_value or check_violation or raise_exception then
        raise notice 'PASS: %', label; return;
    end;
    raise exception 'FAIL: accepted invalid input: %', label;
end $$;

select pg_temp.assert_true((select count(*) = 0 from public.products), 'No catalog fixtures');
insert into auth.users(id,email) values
    ('00000000-0000-4000-8000-000000000001','super@example.invalid'),
    ('00000000-0000-4000-8000-000000000002','admin@example.invalid'),
    ('00000000-0000-4000-8000-000000000003','pending@example.invalid');
select pg_temp.assert_true((select bool_and(role = 'pending') from public.profiles), 'All new accounts pending');
update public.profiles set role = 'super_admin' where username = 'super';
update public.profiles set role = 'admin' where username = 'admin';
insert into public.config(id,shipping_cost,free_shipping_min) values (1,0,0);
insert into public.orders(customer_name,customer_email,customer_phone,items,subtotal,total)
values ('Security fixture','security@example.invalid','900000000','[]',100,100);

set local role authenticated;
do $$
declare uid text; col text; n bigint;
begin
    foreach uid in array array['00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'] loop
        perform set_config('request.jwt.claims', jsonb_build_object('sub',uid)::text, true);
        perform pg_temp.assert_true(has_column_privilege('authenticated','public.orders','status','UPDATE'), public.current_role_name() || ': status privilege');
        foreach col in array array['total','subtotal','items','stock_applied','updated_at','customer_email','payment_method','note'] loop
            perform pg_temp.assert_true(not has_column_privilege('authenticated','public.orders',col,'UPDATE'), public.current_role_name() || ': no UPDATE ' || col);
            perform pg_temp.denied(format('update public.orders set %I = %I',col,col), public.current_role_name() || ': direct ' || col || ' rejected');
        end loop;
        perform pg_temp.denied('update public.orders set status = ''confirmed'', total = 1', 'Mixed status/financial update rejected');
        update public.orders set status = 'confirmed';
        get diagnostics n = row_count;
        perform pg_temp.assert_true(n = 1 and (select status = 'processing' and stock_applied and total = 100 and subtotal = 100 from public.orders), public.current_role_name() || ': stock/status triggers still run');
        update public.orders set status = 'delivered';
        perform pg_temp.assert_true((select stock_applied from public.orders), 'Further paid transition keeps stock flag');
        update public.orders set status = 'cancelled';
        perform pg_temp.assert_true((select not stock_applied from public.orders), 'Cancellation restores stock flag');
        -- Plan only: checks privileges/policies without creating any product/category.
        execute 'explain insert into public.categories(id,name) values (''never-created'',''plan only'')';
        execute 'explain insert into public.products(name,category_id,price) values (''never-created'',''never-created'',1)';
        execute 'explain update public.products set stock = 1';
        execute 'explain delete from public.products';
        perform pg_temp.assert_true(public.is_admin(), public.current_role_name() || ': operational CRUD policies retained (plan only)');
        perform pg_temp.denied('select public.create_order_validated_internal(''{}'',''[]'')', 'Internal checkout RPC not callable');
        perform pg_temp.denied('insert into public.orders(customer_name,customer_email,customer_phone,items,subtotal,total) values (''bad'',''bad'',''bad'',''[]'',0,0)', 'Authenticated cannot insert direct order');
    end loop;
end $$;

-- Defense against a future accidental table-wide GRANT.
reset role;
grant update on public.orders to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',true);
select pg_temp.denied('update public.orders set total = 1', 'Trigger blocks financial update despite broad GRANT');
select pg_temp.denied('update public.orders set stock_applied = true', 'Trigger blocks inventory flag despite broad GRANT');
update public.orders set status = 'processing';
select pg_temp.assert_true((select stock_applied and total = 100 from public.orders), 'Internal trigger changes remain permitted after drift');
reset role;
revoke update on public.orders from authenticated;
grant update(status) on public.orders to authenticated;

-- Every supported URL shape maps to the same raw object identity.
do $$
declare url text; bucket text; name text;
begin
    foreach url in array array[
        'https://example.invalid/storage/v1/object/public/site-assets/folder/%C3%B1%20logo.png',
        'https://example.invalid/storage/v1/object/sign/site-assets/folder/%C3%B1%20logo.png?token=synthetic',
        'https://example.invalid/storage/v1/object/authenticated/site-assets/folder/%C3%B1%20logo.png',
        'https://example.invalid/storage/v1/render/image/public/site-assets/folder/%C3%B1%20logo.png?width=100',
        'https://example.invalid/storage/v1/render/image/sign/site-assets/folder/%C3%B1%20logo.png?token=synthetic',
        'https://example.invalid/storage/v1/object/public/site-assets/folder%2F%C3%B1%20logo.png'
    ] loop
        select i.bucket_id,i.object_name into bucket,name from public.technical_media_identity(url) i;
        perform pg_temp.assert_true(bucket = 'site-assets' and name = 'folder/ñ logo.png', 'Canonical technical identity: ' || split_part(url,'?',1));
        update public.config set logo_url = url;
        perform set_config('role','authenticated',true);
        perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',true);
        perform pg_temp.assert_true(not public.can_manage_panel_media(bucket,name), 'Admin cannot manage aliased technical object');
        perform pg_temp.denied('insert into storage.objects(bucket_id,name) values (''site-assets'',''folder/ñ logo.png'')', 'Admin cannot create/overwrite protected identity');
        perform set_config('role','none',true);
    end loop;
    perform pg_temp.assert_true((select object_name = 'a+b%20?.png' from public.technical_media_identity('/storage/v1/object/public/site-assets/a+b%2520%3F.png')), 'Decode once; preserve plus and encoded question mark');
end $$;
select pg_temp.invalid('update public.config set logo_url = ''/storage/v1/object/public/site-assets/a/%2e%2e/logo.png''', 'Traversal reference fails closed');
select pg_temp.invalid('update public.config set logo_url = ''/storage/v1/object/public/site-assets/a%XX.png''', 'Malformed encoding fails closed');
select pg_temp.invalid('update public.config set logo_url = ''/storage/v1/unknown/site-assets/logo.png''', 'Unknown Storage route fails closed');
select pg_temp.invalid('update public.config set logo_url = ''/x/../storage/v1/object/public/site-assets/logo.png''', 'Dot segments before Storage prefix fail closed');
select pg_temp.invalid('update public.config set logo_url = chr(92) || ''storage/v1/object/public/site-assets/logo.png''', 'Browser backslash normalization cannot bypass identity');
insert into storage.objects(bucket_id,name) values ('site-assets','folder/ñ logo.png'),('site-assets','operational.png');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002"}',true);
select pg_temp.denied('update storage.objects set metadata = ''{}'' where name = ''folder/ñ logo.png''', 'Admin cannot replace technical image',true);
select pg_temp.denied('delete from storage.objects where name = ''folder/ñ logo.png''', 'Admin cannot delete technical image',true);
select pg_temp.denied('update storage.objects set name = ''folder/ñ logo.png'' where name = ''operational.png''', 'Admin cannot rename operational file onto technical identity');
select pg_temp.denied('update public.config set logo_url = null', 'Admin cannot unprotect by editing config',true);
select pg_temp.denied('delete from public.panel_technical_media', 'Clients cannot remove identity protection');
do $$ declare uid text; bucket text; n bigint; begin
    foreach uid in array array['00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'] loop
        perform set_config('request.jwt.claims',jsonb_build_object('sub',uid)::text,true);
        foreach bucket in array array['product-images','site-assets'] loop
            insert into storage.objects(bucket_id,name) values (bucket,'test-operational.png');
            update storage.objects set name = 'test-operational-edited.png' where bucket_id = bucket and name = 'test-operational.png';
            get diagnostics n = row_count;
            perform pg_temp.assert_true(n = 1, public.current_role_name() || ': operational image update ' || bucket);
            delete from storage.objects where bucket_id = bucket and name = 'test-operational-edited.png';
            get diagnostics n = row_count;
            perform pg_temp.assert_true(n = 1, public.current_role_name() || ': operational image delete ' || bucket);
        end loop;
    end loop;
end $$;
update storage.objects set metadata = '{"technical":true}' where name = 'folder/ñ logo.png';
select pg_temp.assert_true((select metadata->>'technical' = 'true' from storage.objects where name = 'folder/ñ logo.png'), 'Super Admin can update technical file');
select pg_temp.denied('update public.panel_environment set environment = ''production''', 'Client cannot change deployment identity');
select pg_temp.denied('update public.profiles set role = ''admin'' where username = ''super''', 'Super Admin cannot change own role');
delete from public.orders;
select pg_temp.assert_true((select count(*) = 0 from public.orders), 'Super Admin retains permanent order deletion');
reset role;
insert into public.orders(customer_name,customer_email,customer_phone,items,subtotal,total)
values ('RLS fixture','rls@example.invalid','900000000','[]',100,100);
set local role authenticated;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003"}',true);
select pg_temp.denied('update public.orders set status = ''confirmed''', 'Pending cannot update status',true);
select pg_temp.assert_true((select count(*) = 0 from public.orders), 'Pending cannot read existing private order');
select pg_temp.denied('insert into storage.objects(bucket_id,name) values (''product-images'',''blocked.png'')', 'Pending cannot upload');
select pg_temp.denied('update public.profiles set role = ''super_admin'' where username = ''pending''', 'Pending cannot self elevate');
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.denied('update public.orders set status = ''confirmed''', 'Anonymous cannot update status');
select pg_temp.denied('update public.orders set total = 0', 'Anonymous cannot update finances');
select pg_temp.denied('select public.create_order_validated_internal(''{}'',''[]'')', 'Anonymous cannot call internal RPC');
select pg_temp.denied('select * from public.order_requests', 'Ledger not public');
select pg_temp.invalid('select public.create_order(''{}'',''[]'')', 'Checkout requires idempotency key');
select pg_temp.invalid('select public.create_order(''{"idempotencyKey":"00000000-0000-4000-8000-000000000099","name":"Fixture","email":"fixture@example.invalid","phone":"900000000"}'',''[]'')', 'Core validation retained: empty cart rejected');
reset role;
select pg_temp.assert_true((select status = 'pending' and total = 100 from public.orders), 'Rejected actions leave existing order unchanged');
select pg_temp.assert_true((select count(*) = 0 from public.order_requests), 'Rejected checkout leaves no ledger record');
select pg_temp.invalid('update public.panel_environment set environment = ''staging'', notifications_enabled = true', 'Staging cannot enable external notifications');
select pg_temp.invalid('update public.panel_environment set environment = ''production'', notifications_enabled = true', 'Notifications require full explicit destination');
update public.panel_environment set environment = 'staging';
create schema if not exists net;
create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language plpgsql as $$
begin raise exception 'External notification forbidden in local tests'; end $$;
create temporary table notification_probe(id int);
create trigger notification_probe after insert on notification_probe for each row execute function public.notify_new_product();
insert into notification_probe values (1);
select pg_temp.assert_true((select count(*) = 1 from notification_probe), 'Staging trigger returns without external calls');
select pg_temp.assert_true((select count(*) = 0 from public.products), 'Zero products created throughout suite');
rollback;
