"""Local PostgreSQL only. Creates a fresh disposable DB; never reads production credentials.

python tests/run-sql-tests.py --pg-bin "C:/Program Files/PostgreSQL/18/bin" --port 55481
The local server must already be running, using trust authentication for postgres.
"""
import argparse
from pathlib import Path
import subprocess
import tempfile
import time
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
    for name in ['2026-11-07_phase1_rbac.sql', '2026-11-07_checkout_rpc.sql']:
        sql = Path('db', name).read_text(encoding='utf-8')
        run(dbname, sql)
        run(dbname, sql)  # Verify repeat application is harmless.
    run(dbname, Path('db/2026-11-07_phase1_verify.sql').read_text(encoding='utf-8'))
    result = run(dbname, Path('tests/phase1-rls.sql').read_text(encoding='utf-8'))
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
    print('SQL suite passed, including migration idempotency.')
finally:
    if created:
        run('postgres', f'drop database {dbname};')
