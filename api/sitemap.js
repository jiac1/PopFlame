// /sitemap.xml generado desde el catálogo real (función de Vercel; ver "rewrites" en vercel.json).
//
// Antes el sitemap era un archivo fijo, con los productos y fechas escritos a mano: un producto nuevo
// no aparecía en Google hasta que alguien lo editara. Ahora se arma con los productos, categorías y
// páginas de Supabase (con la clave pública, lo mismo que lee la tienda) y Vercel lo guarda 1 hora.
// Si Supabase no responde, devuelve igual las páginas principales.

const SITE = 'https://pop-flame.vercel.app';
const SUPABASE_URL = 'https://ysxinhpymvhdnfbdanvn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WHh5SfBgWKa7_XhFQRxGqQ_SrWk_u9H';

const xmlEscape = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const day = (d) => {
    const t = d ? new Date(d) : null;
    return t && !isNaN(t) ? t.toISOString().slice(0, 10) : null;
};

function buildSitemap({ products = [], categories = [], pages = [] } = {}) {
    const urls = [];
    const add = (path, lastmod, changefreq, priority) => urls.push({ loc: SITE + path, lastmod, changefreq, priority });
    const newest = products.map(p => day(p.updated_at || p.created_at)).filter(Boolean).sort().pop() || null;

    add('/', newest, 'daily', '1.0');
    add('/pages/categoria.html', newest, 'daily', '0.9');
    for (const c of categories) {
        // Solo categorías con productos (las vacías tampoco se muestran en la tienda).
        if (!products.some(p => p.category_id === c.id)) continue;
        add(`/pages/categoria.html?cat=${encodeURIComponent(c.id)}`, newest, 'weekly', '0.8');
    }
    for (const p of products) {
        add(`/pages/producto.html?id=${encodeURIComponent(p.id)}`, day(p.updated_at || p.created_at), 'weekly', '0.7');
    }
    for (const pg of pages) {
        add(`/pages/info.html?slug=${encodeURIComponent(pg.slug)}`, day(pg.updated_at), 'monthly', '0.4');
    }

    const body = urls.map(u => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function fetchTable(query) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`Supabase respondió ${res.status} en ${query.split('?')[0]}`);
    return res.json();
}

async function handler(req, res) {
    let data = {};
    try {
        const [products, categories, pages] = await Promise.all([
            fetchTable('products?select=id,category_id,created_at,updated_at&order=id.desc'),
            fetchTable('categories?select=id&order=sort_order'),
            fetchTable('pages?select=slug,updated_at&order=slug')
        ]);
        data = { products, categories, pages };
    } catch (e) {
        console.error('sitemap:', e.message);
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // 1 hora en la caché de Vercel; si Supabase falló, solo 5 minutos.
    res.setHeader('Cache-Control', data.products ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=300');
    res.status(200).send(buildSitemap(data));
}

module.exports = handler;
module.exports.buildSitemap = buildSitemap;
