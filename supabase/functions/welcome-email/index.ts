// Supabase Edge Function: welcome-email
//
// Envía un correo de bienvenida cuando alguien se suscribe al newsletter
// (se invoca desde js/app.js -> setupNewsletter() apenas se guarda el email).
//
// CÓMO DESPLEGARLA (sin usar la CLI de Supabase):
//   1. Ve a tu proyecto en supabase.com > Edge Functions > "Deploy a new function".
//   2. Nombre de la función: welcome-email
//   3. Pega todo este archivo como código.
//   4. Ve a Project Settings > Edge Functions > Secrets y agrega:
//        RESEND_API_KEY = tu API key de resend.com
//        FROM_EMAIL     = (opcional) remitente verificado, ej. "PopFlame <ventas@tudominio.cl>"
//                         si no lo pones, usa el remitente de pruebas de Resend (onboarding@resend.dev)

// CORS: sin esto, el navegador bloquea la llamada que hace el sitio (js/app.js) antes
// de que la función llegue a ejecutarse.
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { email } = await req.json();
        if (!email || typeof email !== 'string') {
            return new Response(JSON.stringify({ error: 'email requerido' }), { status: 400, headers: corsHeaders });
        }

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'PopFlame <onboarding@resend.dev>';

        if (!RESEND_API_KEY) {
            return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), { status: 500, headers: corsHeaders });
        }

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: email,
                subject: '🔥 ¡Bienvenido al Club PopFlame!',
                html: `
                    <div style="font-family: Arial, sans-serif; background:#0A0A0A; color:#fff; padding:32px;">
                        <h1 style="color:#E31837; margin:0 0 16px;">¡BIENVENIDO A POPFLAME!</h1>
                        <p style="font-size:15px; line-height:1.6;">Gracias por unirte al club. Desde ahora te avisaremos apenas salga un producto nuevo y de nuestras ofertas exclusivas.</p>
                        <p style="margin-top:24px; font-weight:bold;">Streetwear que quema 🔥</p>
                    </div>
                `
            })
        });

        const data = await res.json();
        if (!res.ok) {
            return new Response(JSON.stringify({ error: data }), { status: 500, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
    }
});
