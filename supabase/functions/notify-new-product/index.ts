// Supabase Edge Function: notify-new-product
//
// Avisa por correo a los suscriptores activos cuando se crea un producto nuevo.
// La llama la base de datos sola (trigger trg_notify_new_product con pg_net en db/schema.sql).
//
// Seguridad: no confía en los datos que le llegan. Busca el producto por su id en la base de datos
// y solo envía si se creó hace menos de 15 minutos, así nadie puede mandar correos falsos a tus
// suscriptores llamando a esta función con un producto inventado.
//
// CÓMO DESPLEGARLA (sin usar la CLI de Supabase):
//   1. supabase.com > tu proyecto > Edge Functions > "Deploy a new function".
//   2. Nombre: notify-new-product · pega todo este archivo como código.
//   3. Usa los mismos secrets que welcome-email (RESEND_API_KEY, FROM_EMAIL, SITE_URL).
//      SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Product = { id: number; name: string; price: number; description: string | null; image: string | null; created_at: string };

function imageUrl(site: string, path: string | null) {
    if (!path) return `${site}/images/og-image.jpg`;
    return /^https?:\/\//i.test(path) ? path : `${site}/${path.replace(/^\/+/, '')}`;
}

function template(site: string, p: Product, email: string) {
    const url = `${site}/pages/producto.html?id=${p.id}`;
    const price = '$' + Math.round(Number(p.price || 0)).toLocaleString('es-CL');
    const unsubscribe = `${site}/pages/baja.html?email=${encodeURIComponent(email)}`;
    const desc = (p.description || '').slice(0, 220);
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)}</title></head>
<body style="margin:0;padding:0;background:#F6F4F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4F0;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;color:#0B0B0B;font-family:Arial,Helvetica,sans-serif;">
    <tr><td style="background:#0B0B0B;padding:18px 24px;">
      <span style="font-size:22px;font-weight:900;letter-spacing:-0.5px;text-transform:uppercase;color:#FFFFFF;">Pop<span style="color:#E31837;">Flame</span></span>
      <span style="float:right;font-size:11px;font-weight:bold;letter-spacing:2px;color:#E31837;text-transform:uppercase;line-height:26px;">Nuevo drop</span>
    </td></tr>
    <tr><td><a href="${url}"><img src="${esc(imageUrl(site, p.image))}" width="560" alt="${esc(p.name)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;"></a></td></tr>
    <tr><td style="padding:28px 32px 8px;">
      <h1 style="margin:0 0 8px;font-size:26px;line-height:1.1;text-transform:uppercase;">${esc(p.name)}</h1>
      <p style="margin:0 0 16px;font-size:20px;font-weight:bold;">${price}</p>
      ${desc ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4A4A4A;">${esc(desc)}</p>` : ''}
      <a href="${url}" style="display:inline-block;background:#0B0B0B;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;padding:16px 28px;">Comprar ahora</a>
      <p style="margin:20px 0 0;font-size:13px;color:#6F6A63;">Stock limitado · Entrega gratis en Metro de Santiago · Envíos a todo Chile</p>
    </td></tr>
    <tr><td style="padding:32px;border-top:1px solid #EEEEEE;font-size:12px;line-height:1.6;color:#6F6A63;">
      Recibes este correo porque eres parte del club PopFlame.<br>
      <a href="${unsubscribe}" style="color:#4A4A4A;">Darme de baja</a> · <a href="${site}/pages/info.html?slug=privacidad" style="color:#4A4A4A;">Política de privacidad</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    try {
        const payload = await req.json();
        const id = Number(payload?.record?.id);
        if (!id) return json({ error: 'sin id de producto' }, 400);

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'PopFlame <onboarding@resend.dev>';
        const SITE = (Deno.env.get('SITE_URL') || 'https://pop-flame.vercel.app').replace(/\/+$/, '');
        if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY no configurada' }, 500);

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        // El producto tiene que existir de verdad y ser recién creado
        const { data: product } = await supabase.from('products')
            .select('id, name, price, description, image, created_at').eq('id', id).maybeSingle();
        if (!product) return json({ skipped: 'producto no existe' });
        if (Date.now() - new Date(product.created_at).getTime() > 15 * 60 * 1000) return json({ skipped: 'producto antiguo' });

        const { data: subs, error } = await supabase.from('subscribers').select('email').eq('active', true);
        if (error) throw error;
        if (!subs?.length) return json({ success: true, sent: 0 });

        // Un correo por persona (con su propio link de baja), en tandas de 100 (límite de Resend batch)
        let sent = 0;
        const errors: unknown[] = [];
        for (let i = 0; i < subs.length; i += 100) {
            const batch = subs.slice(i, i + 100).map((s: { email: string }) => ({
                from: FROM_EMAIL,
                to: s.email,
                subject: `Nuevo drop: ${product.name} 🔥`,
                html: template(SITE, product as Product, s.email),
                headers: { 'List-Unsubscribe': `<${SITE}/pages/baja.html?email=${encodeURIComponent(s.email)}>` }
            }));
            const res = await fetch('https://api.resend.com/emails/batch', {
                method: 'POST',
                headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(batch)
            });
            if (res.ok) sent += batch.length;
            else errors.push(await res.json());
        }
        return json({ success: true, sent, errors });
    } catch (err) {
        return json({ error: String(err) }, 500);
    }
});
