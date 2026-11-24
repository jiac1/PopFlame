// Sitemap automático, recuperación de contraseña y limpieza del repositorio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const exists = (f) => fs.existsSync(path.join(__dirname, '..', f));
const { buildSitemap } = require('../api/sitemap.js');

test('sitemap lists products, categories with products and pages, escaping XML', () => {
    const xml = buildSitemap({
        products: [{ id: 7, category_id: 'poleras', updated_at: '2026-11-20T10:00:00Z' }],
        categories: [{ id: 'poleras' }, { id: 'vacia' }],
        pages: [{ slug: 'envios&cambios', updated_at: '2026-10-01T00:00:00Z' }]
    });
    assert.match(xml, /<loc>https:\/\/pop-flame\.vercel\.app\/pages\/producto\.html\?id=7<\/loc><lastmod>2026-11-20<\/lastmod>/);
    assert.match(xml, /categoria\.html\?cat=poleras/);
    assert.doesNotMatch(xml, /cat=vacia/, 'empty categories are hidden in the store too');
    assert.match(xml, /slug=envios%26cambios/);
    assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|quot;|apos;)/);
});

test('sitemap still answers with the main pages when Supabase fails', () => {
    const xml = buildSitemap({});
    assert.equal((xml.match(/<url>/g) || []).length, 2);
});

test('/sitemap.xml is served by the function (the static file is gone)', () => {
    const cfg = JSON.parse(read('vercel.json'));
    assert.deepEqual(cfg.rewrites, [{ source: '/sitemap.xml', destination: '/api/sitemap' }]);
    assert.equal(exists('sitemap.xml'), false);
    assert.match(read('robots.txt'), /Sitemap: https:\/\/pop-flame\.vercel\.app\/sitemap\.xml/);
});

test('password recovery sends a link and the reset page sets the new password', () => {
    const login = read('admin/js/login.js');
    assert.match(login, /resetPasswordForEmail\(email, \{\s*redirectTo: new URL\('restablecer\.html', location\.href\)\.href/);
    assert.match(login, /U\.esc\(email\)/);
    const page = read('admin/restablecer.html');
    assert.doesNotMatch(page, /<script>(?!<\/script>)|<script(?![^>]*\bsrc=)[^>]*>/, 'no inline scripts (CSP)');
    assert.match(page, /<meta name="robots" content="noindex, nofollow">/);
    const js = read('admin/js/restablecer.js');
    assert.match(js, /PASSWORD_RECOVERY/);
    assert.match(js, /updateUser\(\{ password: pass\.value \}\)/);
    assert.match(js, /signOut\(\)/);
});

test('outdated planning docs and the unused 1.3 MB logo were removed', () => {
    for (const f of ['PLAN.md', 'PLAN-ADMIN.md', 'images/logo.png']) assert.equal(exists(f), false, f);
    assert.ok(fs.statSync(path.join(__dirname, '..', 'images/products/accesorios/joya-1.jpg')).size < 400 * 1024);
});
