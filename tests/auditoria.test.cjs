// Correcciones de la auditoría de noviembre 2026 (db/2026-11-25_auditoria.sql y cambios de la tienda/panel).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const audit = read('db/2026-11-25_auditoria.sql');
const schema = read('db/schema.sql');

const fnBody = (sql, name) => {
    const m = sql.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'));
    assert.ok(m, `${name} must be defined`);
    return m[0];
};

// ---------- Base de datos ----------

test('each product is announced to subscribers only once', () => {
    for (const sql of [audit, schema]) assert.match(sql, /newsletter_sent_at\s+timestamptz/i);
    const fn = read('supabase/functions/notify-new-product/index.ts');
    // Reclama la marca con un UPDATE condicional (atómico) en vez de solo leer el producto.
    assert.match(fn, /\.update\(\{\s*newsletter_sent_at:/);
    assert.match(fn, /\.is\('newsletter_sent_at',\s*null\)/);
    assert.match(fn, /\.gte\('created_at',\s*since\)/);
});

test('cancelling a paid order restores exactly what that order deducted', () => {
    for (const sql of [audit, schema]) {
        const fn = fnBody(sql, 'orders_apply_stock');
        const reversal = fn.slice(fn.indexOf('elsif not v_is_paid'));
        assert.match(reversal, /from\s+public\.inventory_movements[\s\S]*?where\s+order_id\s*=\s*new\.id/i);
        assert.match(reversal, /-sum\(delta\)/i);
    }
});

test('an order that already deducted stock cannot be deleted', () => {
    for (const sql of [audit, schema]) {
        assert.match(fnBody(sql, 'orders_block_delete_applied'), /if\s+old\.stock_applied\s+then\s+raise\s+exception/i);
        assert.match(sql, /create\s+trigger\s+trg_orders_block_delete_applied\s+before\s+delete\s+on\s+public\.orders/i);
    }
    assert.match(read('admin/js/views-ventas.js'), /if \(o\.stock_applied\)/);
});

test('new accounts get a unique username even when the part before @ repeats', () => {
    for (const sql of [audit, schema]) {
        const fn = fnBody(sql, 'handle_new_user');
        assert.match(fn, /while\s+exists\s*\(select 1 from public\.profiles where lower\(username\) = v_username\)/i);
        assert.match(fn, /v_username\s*:=\s*v_base\s*\|\|\s*v_n/i);
    }
});

test('storage buckets no longer accept SVG', () => {
    assert.doesNotMatch(schema, /image\/svg\+xml/);
    assert.doesNotMatch(audit.replace(/--.*$/gm, ''), /image\/svg\+xml/);
});

test('schema.sql does not use products.status before creating the column', () => {
    const create = schema.indexOf('add column if not exists status text');
    const firstUse = schema.search(/update public\.products set status/);
    assert.ok(create > -1 && firstUse > create, 'the first update of products.status must come after adding the column');
});

// ---------- Tienda ----------

const STORE_PAGES = ['index.html', 'pages/categoria.html', 'pages/producto.html', 'pages/checkout.html', 'pages/info.html', 'pages/baja.html'];

test('every page loads safety.js before the scripts that use it', () => {
    for (const page of STORE_PAGES) {
        const html = read(page);
        const safety = html.indexOf('js/safety.js');
        assert.ok(safety > -1, `${page} must load safety.js`);
        assert.ok(safety < html.indexOf('js/products.js'), `${page}: safety.js before products.js`);
    }
    for (const page of ['admin/index.html', 'admin/panel.html']) {
        const html = read(page);
        assert.ok(html.indexOf('js/safety.js') > -1 && html.indexOf('js/safety.js') < html.indexOf('js/admin.js'), `${page}: safety.js before admin.js`);
    }
});

test('help pages and the panel preview render page content through the sanitizer', () => {
    assert.match(read('js/info.js'), /content\.innerHTML = PFSafety\.sanitizeRichHtml\(/);
    assert.doesNotMatch(read('js/info.js'), /content\.innerHTML = data\.content/);
    assert.match(read('admin/js/views-sitio.js'), /pgPreview'\)\.innerHTML = PFSafety\.sanitizeRichHtml\(/);
});

test('product images reject active URLs and are escaped inside attributes', () => {
    globalThis.PFSafety = require('../js/safety.js');
    globalThis.PF = { url: (p = '') => 'https://tienda.test/' + p.replace(/^\/+/, ''), escape: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
    const PM = require('../js/products.js');
    assert.match(PM.resolveImagePath('javascript:alert(1)'), /placeholder\.svg$/);
    assert.equal(PM.resolveImagePath('images/a.jpg'), 'https://tienda.test/images/a.jpg');
    assert.equal(PM.resolveImagePath('https://x.supabase.co/a.jpg'), 'https://x.supabase.co/a.jpg');

    PM.categories = [];
    const card = PM.createProductCard({ id: 1, name: 'X', price: 1, images: ['images/a".jpg'], image: '', sizes: [], colors: [], stock: 1, status: 'disponible' });
    assert.doesNotMatch(card, /a"\.jpg/, 'a quote in the path must not break out of src=""');
    assert.doesNotMatch(card, /onerror=/);
});

test('social links only accept http(s) URLs', () => {
    assert.match(read('js/app.js'), /PF\.safeExternal\(s\.tiktok\)/);
    assert.match(read('js/app.js'), /PF\.safeExternal\(s\.twitter\)/);
    assert.match(read('js/info.js'), /PF\.safeExternal\(ProductsManager\.config\.socialLinks\?\.instagram\)/);
});

test('the header reads the same cache key the store writes', () => {
    const key = read('js/products.js').match(/cacheKey:\s*'([^']+)'/)[1];
    assert.match(read('js/layout.js'), new RegExp(`localStorage\\.getItem\\('${key}'\\)`));
});

test('"A Pedido" products are capped at 99 units in the cart', () => {
    globalThis.PFSafety = require('../js/safety.js');
    const PM = require('../js/products.js');
    globalThis.ProductsManager = PM;
    globalThis.UI = { toast() {} };
    const Cart = require('../js/cart.js');
    Cart.save = () => {}; Cart.updateUI = () => {}; Cart.bumpCount = () => {};
    const product = { id: 50, name: 'Encargo', price: 1000, image: '', status: 'a_pedido', stock: 0 };
    PM.products = [product];
    Cart.cart = [];
    assert.equal(Cart.addToCart(product, 'M', '', 90), true);
    assert.equal(Cart.addToCart(product, 'L', '', 20), true);
    assert.equal(Cart.quantityOf(50), 99);
    assert.equal(Cart.addToCart(product, 'S', '', 1), false);
});

// ---------- Panel ----------

test('editing a product saves stock through the audited RPC, not in the form update', () => {
    const catalog = read('admin/js/views-catalogo.js');
    const save = catalog.slice(catalog.indexOf('async save(existing, btn)'), catalog.indexOf('    duplicate(p) {'));
    const payload = save.slice(save.indexOf('const payload = {'), save.indexOf('};', save.indexOf('const payload = {')));
    assert.doesNotMatch(payload, /\bstock\b/, 'stock must not be part of the update payload');
    assert.match(save, /rpc\('set_product_stock'[\s\S]*?p_expected_stock:\s*existing\.stock/);
    const bulk = catalog.slice(catalog.indexOf('bulkEdit() {'));
    assert.doesNotMatch(bulk.slice(0, bulk.indexOf('Admin.route()')), /payload\.stock/);
    assert.match(bulk, /rpc\('set_product_stock'/);
});

test('order lists are fetched in pages instead of being cut at 1000 rows', () => {
    assert.match(read('admin/js/admin.js'), /async fetchAll\(build/);
    const sales = read('admin/js/views-ventas.js');
    assert.equal((sales.match(/U\.fetchAll\(\(\) => supabaseClient\.from\('orders'\)/g) || []).length, 2);
});

// ---------- Seguridad del sitio (CSP) ----------

test('no inline scripts or inline event handlers (required by the CSP)', () => {
    const files = [...STORE_PAGES, '404.html', 'admin/index.html', 'admin/panel.html',
        'pages/poleras.html', 'pages/polerones.html', 'pages/pantalones.html', 'pages/accesorios.html'];
    for (const f of files) {
        const html = read(f);
        assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/i, `${f} has an inline <script>`);
        assert.doesNotMatch(html, /\son[a-z]+="/i, `${f} has an inline event handler`);
    }
    for (const f of ['js/products.js', 'admin/js/admin.js', 'admin/js/views-catalogo.js', 'admin/js/views-ventas.js', 'admin/js/views-sitio.js']) {
        assert.doesNotMatch(read(f).replace(/^\s*\/\/.*$/gm, ''), /\son(click|error|load|change|input|submit)="/i, `${f} builds an inline event handler`);
    }
});

test('vercel sends a Content-Security-Policy and supabase-js is pinned with SRI', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const global = vercel.headers.find(h => h.source === '/(.*)').headers;
    const csp = global.find(h => h.key === 'Content-Security-Policy');
    assert.ok(csp, 'missing Content-Security-Policy');
    assert.match(csp.value, /script-src 'self' https:\/\/cdn\.jsdelivr\.net(;|$)/);
    assert.doesNotMatch(csp.value, /script-src[^;]*'unsafe-inline'/);
    assert.match(csp.value, /object-src 'none'/);
    for (const page of [...STORE_PAGES, 'admin/index.html', 'admin/panel.html']) {
        const tag = read(page).match(/<script[^>]*supabase-js[^>]*>/)[0];
        assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/, `${page}: supabase-js without integrity`);
        assert.match(tag, /crossorigin="anonymous"/);
    }
});
