// Cliente de Supabase compartido por todo el sitio (tienda + admin).
// La URL y la clave "publishable/anon" son seguras de exponer en el frontend:
// solo permiten lo que las políticas de RLS autorizan en Supabase.
// Requiere que el CDN de supabase-js esté cargado ANTES que este script.
(function () {
    const cfg = window.POPFLAME_RUNTIME;
    const productionHost = 'ysxinhpymvhdnfbdanvn.supabase.co';
    let url;
    try {
        url = new URL(cfg?.supabaseUrl);
        const hostname = url.hostname.replace(/\.$/, '');
        const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
        if (!['production', 'staging'].includes(cfg.environment)
            || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
            || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
        if (cfg.environment === 'production' && (location.origin !== 'https://pop-flame.vercel.app' || url.hostname !== productionHost)) throw new Error();
        if (cfg.environment === 'staging' && (hostname === productionHost || location.origin === 'https://pop-flame.vercel.app'
            || !(loopback || /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)))) throw new Error();
        const key = cfg.publishableKey;
        let anonJwt = false;
        if (typeof key === 'string' && key.split('.').length === 3) {
            const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            anonJwt = JSON.parse(atob(payload)).role === 'anon';
        }
        if (typeof key !== 'string' || !(key.startsWith('sb_publishable_') || anonJwt)) throw new Error();
    } catch {
        console.error('PopFlame: entorno sin configurar o destino no permitido.');
        return;
    }

    window.PopFlameEnvironment = Object.freeze({
        environment: cfg.environment,
        storageKey(base) { return cfg.environment === 'production' ? base : base + ':' + url.host; },
        allowsAsset(path) {
            if (cfg.environment === 'production') return true;
            try {
                const asset = new URL(path, location.href);
                return ['data:', 'blob:'].includes(asset.protocol) || [location.origin, url.origin].includes(asset.origin);
            } catch { return false; }
        }
    });

    if (!window.supabase) {
        console.error('supabase-js no está cargado. Agrega el <script> del CDN antes de supabaseClient.js');
        return;
    }

    window.supabaseClient = window.supabase.createClient(url.origin, cfg.publishableKey);
})();
