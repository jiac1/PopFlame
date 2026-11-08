-- Requiere create_order de Fase 1. Mantiene su firma pública y validaciones.
-- Publicar el cliente que envía idempotencyKey antes de exigirlo en el servidor.
begin;
create table if not exists public.order_requests (
    request_key uuid primary key,
    request_hash text not null,
    order_number text not null,
    total numeric not null check (total >= 0 and total < 'Infinity'::numeric and total <> 'NaN'::numeric),
    created_at timestamptz not null default now()
);
alter table public.order_requests enable row level security;
revoke all on public.order_requests from public, anon, authenticated;
drop policy if exists order_requests_private on public.order_requests;
create policy order_requests_private on public.order_requests as restrictive
    for all to public using (false) with check (false);

-- Renombrar una sola vez conserva el cuerpo validado; no duplicar lógica comercial.
do $$ begin
    if to_regprocedure('public.create_order_validated_internal(jsonb,jsonb)') is null then
        alter function public.create_order(jsonb,jsonb) rename to create_order_validated_internal;
    end if;
end $$;
revoke all on function public.create_order_validated_internal(jsonb,jsonb) from public, anon, authenticated;

create or replace function public.create_order(p_customer jsonb, p_items jsonb)
returns table (order_number text, total numeric)
language plpgsql security definer set search_path = '' as $$
declare key uuid; fingerprint text; receipt public.order_requests%rowtype; created record;
begin
    if jsonb_typeof(p_customer) is distinct from 'object'
       or coalesce(p_customer->>'idempotencyKey', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'Falta una clave válida para confirmar el pedido' using errcode = '22023';
    end if;
    key := (p_customer->>'idempotencyKey')::uuid;
    fingerprint := encode(sha256(convert_to(jsonb_build_object(
        'customer', p_customer - 'idempotencyKey', 'items', p_items)::text, 'UTF8')), 'hex');
    perform pg_catalog.pg_advisory_xact_lock(70612, hashtext(key::text));
    select * into receipt from public.order_requests r where r.request_key = key;
    if found then
        if receipt.request_hash <> fingerprint then
            raise exception 'La clave del pedido corresponde a otros datos' using errcode = '22023';
        end if;
        return query select receipt.order_number, receipt.total;
        return;
    end if;
    select * into strict created from public.create_order_validated_internal(p_customer - 'idempotencyKey', p_items);
    insert into public.order_requests(request_key, request_hash, order_number, total)
    values (key, fingerprint, created.order_number, created.total);
    return query select created.order_number::text, created.total::numeric;
end;
$$;
revoke all on function public.create_order(jsonb,jsonb) from public;
grant execute on function public.create_order(jsonb,jsonb) to anon, authenticated;
do $$ begin
    if has_function_privilege('anon', 'public.create_order_validated_internal(jsonb,jsonb)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.create_order_validated_internal(jsonb,jsonb)', 'EXECUTE') then
        raise exception 'Un permiso heredado expone el RPC interno';
    end if;
end $$;
notify pgrst, 'reload schema';
commit;
