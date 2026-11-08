"""Local PostgreSQL only. Creates a fresh disposable DB; never reads production credentials.

python tests/run-sql-tests.py --pg-bin "C:/Program Files/PostgreSQL/18/bin" --port 55481
The local server must already be running, using trust authentication for postgres.
"""
import argparse
from pathlib import Path
import subprocess
import tempfile
import time
import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

parser = argparse.ArgumentParser()
parser.add_argument('--pg-bin', required=True)
parser.add_argument('--port', type=int, required=True)
args = parser.parse_args()
psql = str(Path(args.pg_bin) / 'psql.exe')
base = [psql, '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', str(args.port), '-U', 'postgres']
dbname = 'popflame_phase1_test_' + str(time.time_ns())

def run(db, sql):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', encoding='utf-8', delete=False) as f:
        f.write(sql)
        filename = Path(f.name)
    try:
        result = subprocess.run(base + ['-d', db, '-f', str(filename)], capture_output=True, encoding='utf-8', errors='replace')
        if result.returncode:
            raise RuntimeError(result.stdout + '\n' + result.stderr)
        return result.stdout + result.stderr
    finally:
        filename.unlink()

schema = Path('db/schema.sql').read_text(encoding='utf-8')
# Extract only DDL, role functions, RLS and Storage bucket definitions. Excludes
# seeds, pg_net/webhooks, backfills and the full-schema execution workflow.
tables = schema[:schema.index('-- 2. FUNCIONES AUXILIARES')]
helpers = schema[schema.index('create or replace function public.current_role_name()'):schema.index('-- 3. TRIGGER:')]
triggers = schema[schema.index('create or replace function public.set_updated_at()'):schema.index('-- Avisa a la Edge Function')]
policies = schema[schema.index('alter table public.profiles  enable row level security;'):schema.index('-- 5.55 Entregas')]
historical = Path('db/2026-09-29_panel.sql').read_text(encoding='utf-8')
# Only the role protections + transfer column and stock trigger; no historical
# UPDATE backfill, newsletter functions or old create_order implementation.
roles = historical[historical.index('alter table public.profiles drop constraint'):historical.index('-- Stock automático:')]
stock = historical[historical.index('create or replace function public.orders_apply_stock()'):historical.index('-- Checkout:')]
shim = """
do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
$$;
""".replace("select nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'",
            "select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid")
shim += """
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
"""
grants = """
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;
"""
created = False
try:
    run('postgres', f'create database {dbname};')
    created = True
    run(dbname, shim + tables + helpers + triggers + policies + roles
        + '\nalter table public.orders add column stock_applied boolean not null default false;\n' + stock + grants)
    stock_definitions = run(dbname, "select pg_get_functiondef('public.orders_apply_stock()'::regprocedure), pg_get_functiondef('public.orders_auto_processing()'::regprocedure);")
    for name in ['2026-11-07_phase1_rbac.sql', '2026-11-07_checkout_rpc.sql',
                 '2026-11-07_security_orders_media.sql', '2026-11-07_security_checkout.sql',
                 '2026-11-07_security_environment.sql']:
        sql = Path('db', name).read_text(encoding='utf-8')
        run(dbname, sql)
        run(dbname, sql)  # Verify repeat application is harmless.
    assert stock_definitions == run(dbname, "select pg_get_functiondef('public.orders_apply_stock()'::regprocedure), pg_get_functiondef('public.orders_auto_processing()'::regprocedure);")
    print('PASS: commercial stock/status function definitions unchanged.')
    run(dbname, Path('db/2026-11-07_phase1_verify.sql').read_text(encoding='utf-8'))
    run(dbname, Path('db/2026-11-07_security_verify.sql').read_text(encoding='utf-8'))
    # Prove an inherited UPDATE grant aborts the whole incremental migration.
    run(dbname, 'create role pf_security_inherited nologin; grant update(total) on public.orders to pf_security_inherited; grant pf_security_inherited to authenticated;')
    try:
        run(dbname, Path('db/2026-11-07_security_orders_media.sql').read_text(encoding='utf-8'))
        raise AssertionError('Inherited financial UPDATE was not detected')
    except RuntimeError as error:
        assert 'UPDATE heredado no permitido' in str(error), error
    finally:
        run(dbname, 'revoke pf_security_inherited from authenticated; revoke update(total) on public.orders from pf_security_inherited; drop role pf_security_inherited;')
    print('PASS: inherited financial UPDATE aborts migration; existing protected schema retained.')
    result = run(dbname, Path('tests/security-rls.sql').read_text(encoding='utf-8'))
    checks = [line.split('NOTICE:', 1)[1].strip() for line in result.splitlines() if 'NOTICE:  PASS:' in line]
    print('\n'.join(checks))
    print(f'{len(checks)} RLS/checkout checks passed.')
    # Two trusted connections try to remove different Super Admin accounts at
    # the same time. Exactly one may succeed; the other must see the new count.
    run(dbname, """
        insert into auth.users (id,email) values
            ('00000000-0000-4000-8000-000000000011','race1@example.invalid'),
            ('00000000-0000-4000-8000-000000000012','race2@example.invalid');
        update public.profiles set role = 'super_admin';
    """)
    barrier = Barrier(2)
    def demote(username):
        barrier.wait(timeout=10)
        try:
            run(dbname, f"begin; update public.profiles set role = 'admin' where username = '{username}'; select pg_sleep(0.3); commit;")
            return 'success'
        except RuntimeError as error:
            if 'Debe quedar al menos un Super Admin' not in str(error):
                raise
            return 'denied'
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = sorted(pool.map(demote, ['race1', 'race2']))
    assert outcomes == ['denied', 'success'], outcomes
    print('PASS: concurrent demotions leave one Super Admin.')

    # Only in this disposable DB: replace the inner creator with a tiny order
    # fixture writer. Exercise the REAL ledger/wrapper concurrently, without
    # creating products or bypassing live catalog/pricing rules anywhere else.
    run(dbname, """
        create or replace function public.create_order_validated_internal(p_customer jsonb,p_items jsonb)
        returns table(order_number text,total numeric) language plpgsql security definer set search_path = '' as $$
        declare receipt public.orders%rowtype;
        begin
            insert into public.orders(customer_name,customer_email,customer_phone,items,subtotal,total)
            values ('Synthetic receipt','local@example.invalid','900000000','[]',1234,1234) returning * into receipt;
            if p_customer->>'note' = 'force-fail' then raise exception 'Synthetic transaction failure'; end if;
            perform pg_sleep(0.1);
            return query select receipt.order_number, receipt.total;
        end $$;
    """)
    key = '00000000-0000-4000-8000-000000000099'
    payload = json.dumps({'idempotencyKey': key, 'name': 'Local test'})
    query = f"set role anon; select row_to_json(r) from public.create_order('{payload}'::jsonb, '[]') r;"
    barrier = Barrier(2)
    def replay(_):
        barrier.wait(timeout=10)
        return run(dbname, query)
    with ThreadPoolExecutor(max_workers=2) as pool:
        receipts = list(pool.map(replay, [0, 1]))
    assert receipts[0] == receipts[1], receipts
    assert run(dbname, query) == receipts[0]
    def metrics():
        output = run(dbname, "select json_build_array((select count(*) from public.orders), (select count(*) from public.order_requests), (select count(*) from public.products));")
        return json.loads(next(line.strip() for line in output.splitlines() if line.strip().startswith('[')))
    assert metrics() == [1, 1, 0], metrics()
    print('PASS: concurrent and sequential retries create exactly one synthetic order and return same receipt.')
    try:
        run(dbname, query.replace('Local test', 'Changed intent'))
        raise AssertionError('Reused key with changed payload accepted')
    except RuntimeError as error:
        assert 'corresponde a otros datos' in str(error), error
    print('PASS: same key with changed payload rejected.')
    failed_payload = json.dumps({'idempotencyKey': '00000000-0000-4000-8000-000000000098', 'note': 'force-fail'})
    try:
        run(dbname, f"set role anon; select * from public.create_order('{failed_payload}'::jsonb, '[]');")
        raise AssertionError('Failed core unexpectedly succeeded')
    except RuntimeError as error:
        assert 'Synthetic transaction failure' in str(error), error
    assert metrics() == [1, 1, 0]
    print('PASS: failed inner creator rolls back both order and ledger atomically.')
    run(dbname, 'delete from public.orders;')
    assert run(dbname, query) == receipts[0]
    assert metrics() == [0, 1, 0]
    print('PASS: retained ledger prevents recreation after permanent order deletion; zero products created.')
    print('SQL suite passed, including migration idempotency.')
finally:
    if created:
        run('postgres', f'drop database {dbname};')
