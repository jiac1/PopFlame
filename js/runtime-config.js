// Configuración pública, sin secretos. El servidor local de staging sustituye
// este recurso en memoria; un servidor estático común queda sin backend local.
(function () {
    window.POPFLAME_RUNTIME = Object.freeze(location.origin === 'https://pop-flame.vercel.app' ? {
        environment: 'production',
        supabaseUrl: 'https://ysxinhpymvhdnfbdanvn.supabase.co',
        publishableKey: 'sb_publishable_WHh5SfBgWKa7_XhFQRxGqQ_SrWk_u9H'
    } : { environment: 'unconfigured' });
})();
