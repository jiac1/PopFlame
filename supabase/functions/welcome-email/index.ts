// Supabase Edge Function: welcome-email
//
// Envía el correo de bienvenida cuando alguien se suscribe al newsletter
// (la invoca js/app.js apenas se guarda el correo en la tabla subscribers).
//
// Seguridad: solo envía si ese correo se acaba de suscribir (últimos 10 minutos) y está activo,
// así nadie puede usar esta función para mandar correos a direcciones cualquiera.
//
// CÓMO DESPLEGARLA (sin usar la CLI de Supabase):
//   1. supabase.com > tu proyecto > Edge Functions > "Deploy a new function".
//   2. Nombre: welcome-email · pega todo este archivo como código.
//   3. Project Settings > Edge Functions > Secrets:
//        RESEND_API_KEY = tu API key de resend.com
//        FROM_EMAIL     = (opcional) remitente verificado, ej. "PopFlame <hola@popflame.cl>"
//        SITE_URL       = (opcional) dirección de la tienda, por defecto https://pop-flame.vercel.app

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function template(site: string, email: string) {
    const unsubscribe = `${site}/pages/baja.html?email=${encodeURIComponent(email)}`;
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bienvenido a PopFlame</title></head>
<body style="margin:0;padding:0;background:#F6F4F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4F0;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0B0B0B;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;">
    <tr><td style="background:#E31837;padding:10px 24px;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;text-align:center;">Streetwear hecho en Chile</td></tr>
    <tr><td style="padding:40px 32px 8px;">
      <div style="font-size:40px;line-height:1;font-weight:900;letter-spacing:-1px;text-transform:uppercase;">Pop<span style="color:#E31837;">Flame</span></div>
    </td></tr>
    <tr><td style="padding:24px 32px 8px;">
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.1;text-transform:uppercase;">Ya eres parte del club</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#D6D6D6;">Gracias por sumarte. Vas a ser de los primeros en enterarte de cada drop, reposición y lanzamiento, antes que nadie.</p>
      <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#D6D6D6;">Las entregas en Santiago son gratis en estaciones de Metro, y despachamos a todo Chile.</p>
      <a href="${site}/pages/categoria.html" style="display:inline-block;background:#FFFFFF;color:#0B0B0B;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;padding:16px 28px;">Ver la colección</a>
    </td></tr>
    <tr><td style="padding:40px 32px 32px;border-top:1px solid #2A2A2A;font-size:12px;line-height:1.6;color:#8A8A8A;">
      Recibes este correo porque te suscribiste en ${esc(site.replace(/^https?:\/\//, ''))}.<br>
      <a href="${unsubscribe}" style="color:#BDBDBD;">Darme de baja</a> · <a href="${site}/pages/info.html?slug=privacidad" style="color:#BDBDBD;">Política de privacidad</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    try {
        const { email } = await req.json();
        const address = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) return json({ error: 'correo inválido' }, 400);

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'PopFlame <onboarding@resend.dev>';
        const SITE = (Deno.env.get('SITE_URL') || 'https://pop-flame.vercel.app').replace(/\/+$/, '');
        if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY no configurada' }, 500);

        // Solo correos que se suscribieron hace menos de 10 minutos
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: sub } = await supabase.from('subscribers').select('id')
            .eq('email', address).eq('active', true).gte('subscribed_at', since).maybeSingle();
        if (!sub) return json({ skipped: true });

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: address,
                subject: 'Ya eres parte del club PopFlame 🔥',
                html: template(SITE, address),
                headers: { 'List-Unsubscribe': `<${SITE}/pages/baja.html?email=${encodeURIComponent(address)}>` }
            })
        });
        const data = await res.json();
        if (!res.ok) return json({ error: data }, 500);
        return json({ success: true });
    } catch (err) {
        return json({ error: String(err) }, 500);
    }
});
