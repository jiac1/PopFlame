// Supabase Edge Function: notify-new-product
//
// Le avisa por correo a todos los suscriptores activos cuando se crea un producto nuevo.
// Se dispara con un Database Webhook (no la llama el sitio directamente).
//
// CÓMO DESPLEGARLA (sin usar la CLI de Supabase):
//   1. Ve a tu proyecto en supabase.com > Edge Functions > "Deploy a new function".
//   2. Nombre de la función: notify-new-product
//   3. Pega todo este archivo como código.
//   4. Los secrets RESEND_API_KEY / FROM_EMAIL son los mismos que configuraste
//      para welcome-email (Project Settings > Edge Functions > Secrets).
//      SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo, no hay que ponerlos.
//   5. Ve a Database > Webhooks > "Create a new hook":
//        Name: notify-new-product
//        Table: products
//        Events: solo "Insert"
//        Type: Supabase Edge Functions
//        Edge Function: notify-new-product
//      Guarda. Desde ahora, cada producto nuevo que crees en el panel dispara este correo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        const product = payload.record;
        if (!product) {
            return new Response(JSON.stringify({ error: 'sin producto en el payload' }), { status: 400, headers: corsHeaders });
        }

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'PopFlame <onboarding@resend.dev>';
        if (!RESEND_API_KEY) {
            return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), { status: 500, headers: corsHeaders });
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const { data: subscribers, error } = await supabase
            .from('subscribers')
            .select('email')
            .eq('active', true);

        if (error) throw error;

        if (!subscribers || subscribers.length === 0) {
            return new Response(JSON.stringify({ success: true, sent: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const price = Number(product.price || 0).toLocaleString('es-CL');
        const html = `
            <div style="font-family: Arial, sans-serif; background:#0A0A0A; color:#fff; padding:32px;">
                <h1 style="color:#E31837; margin:0 0 16px;">🔥 NUEVO DROP EN POPFLAME</h1>
                <h2 style="margin:0 0 8px;">${product.name}</h2>
                <p style="font-size:20px; color:#E31837; font-weight:bold; margin:0 0 16px;">$${price}</p>
                <p style="font-size:14px; line-height:1.6; color:#ccc;">${product.description || ''}</p>
            </div>
        `;

        // Resend acepta hasta 50 destinatarios por llamada; los mandamos en tandas usando
        // bcc para que los suscriptores no se vean los emails entre ellos.
        const emails: string[] = subscribers.map((s: { email: string }) => s.email);
        const chunkSize = 50;
        let sent = 0;
        const resendErrors: unknown[] = [];

        for (let i = 0; i < emails.length; i += chunkSize) {
            const chunk = emails.slice(i, i + chunkSize);
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: FROM_EMAIL,
                    to: FROM_EMAIL,
                    bcc: chunk,
                    subject: `🔥 Nuevo producto: ${product.name}`,
                    html
                })
            });
            if (res.ok) {
                sent += chunk.length;
            } else {
                resendErrors.push(await res.json());
            }
        }

        return new Response(JSON.stringify({ success: true, sent, resendErrors }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
    }
});
