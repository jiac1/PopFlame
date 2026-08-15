// Cliente de Supabase compartido por todo el sitio (tienda + admin).
// La URL y la clave "publishable/anon" son seguras de exponer en el frontend:
// solo permiten lo que las políticas de RLS autorizan en Supabase.
// Requiere que el CDN de supabase-js esté cargado ANTES que este script.
(function () {
    const SUPABASE_URL = 'https://ysxinhpymvhdnfbdanvn.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_WHh5SfBgWKa7_XhFQRxGqQ_SrWk_u9H';

    if (!window.supabase) {
        console.error('supabase-js no está cargado. Agrega el <script> del CDN antes de supabaseClient.js');
        return;
    }

    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
