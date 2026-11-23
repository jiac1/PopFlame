-- =========================================================
-- PopFlame · Link de baja del newsletter con código secreto
-- Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > New query > Run
-- (después de 2026-11-23_correcciones.sql). Se puede volver a ejecutar.
--
-- Antes: pages/baja.html?email=... daba de baja cualquier correo que alguien escribiera.
-- Ahora: cada suscriptor tiene un código aleatorio (unsubscribe_token) y el link de los
-- correos es pages/baja.html?t=<código>. Sin el código no se puede dar de baja a nadie.
-- Además, como la tienda ya no tiene formulario de newsletter, se cierra la inserción
-- pública en subscribers (nadie puede anotar correos ajenos desde la API).
-- =========================================================

begin;

-- 1. Código secreto por suscriptor (los que ya existían reciben uno automáticamente).
alter table public.subscribers
    add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists subscribers_unsubscribe_token_key
    on public.subscribers (unsubscribe_token);

-- 2. Baja con código. Devuelve el correo (enmascarado) para mostrarlo en la página,
--    o null si el código no existe. No revela nada más.
create or replace function public.unsubscribe_with_token(p_token uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_email text;
begin
    if p_token is null then return null; end if;
    update public.subscribers set active = false
     where unsubscribe_token = p_token
    returning email into v_email;
    if v_email is null then return null; end if;
    -- "ana.perez@gmail.com" -> "a***@gmail.com"
    return left(v_email, 1) || '***' || substring(v_email from position('@' in v_email));
end;
$$;

revoke all on function public.unsubscribe_with_token(uuid) from public;
grant execute on function public.unsubscribe_with_token(uuid) to anon, authenticated;

-- 3. La baja por correo (sin código) deja de ser pública.
drop function if exists public.unsubscribe_newsletter(text);

-- 4. Sin formulario en la tienda, nadie inserta suscriptores desde la API.
drop policy if exists "subscribers_insert_public" on public.subscribers;
revoke insert on table public.subscribers from anon, authenticated;

commit;
