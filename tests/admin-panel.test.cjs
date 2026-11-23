const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const admin = read('admin/js/admin.js');
const users = read('admin/js/views-sitio.js');
const catalog = read('admin/js/views-catalogo.js');
const sales = read('admin/js/views-ventas.js');

test('panel login and session use the account status, not a "pending" role', () => {
    assert.match(admin, /PFAccess\.canAccess\(profile\)/);
    assert.doesNotMatch(admin, /role === 'pending'/);
    for (const page of ['admin/index.html', 'admin/panel.html']) {
        const html = read(page);
        assert.ok(html.indexOf('js/access-control.js') > -1 && html.indexOf('js/access-control.js') < html.indexOf('js/admin.js'),
            `${page} must load access-control.js before admin.js`);
    }
});

test('users view approves accounts through profiles.status', () => {
    assert.doesNotMatch(users, /role === 'pending'/);
    assert.match(users, /payload\.status = status/);
});

test('product editor offers every product state the database accepts', () => {
    for (const state of ['disponible', 'agotado', 'a_pedido', 'pocas']) {
        assert.match(catalog, new RegExp(`<option value="${state}"`));
    }
});

test('inventory saves stock through the audited RPC and keeps separate timers', () => {
    assert.match(sales, /rpc\('set_product_stock'/);
    assert.match(sales, /'stock-' \+/);
    assert.match(sales, /'status-' \+/);
});

test('checkout has no direct insert fallback into orders', () => {
    assert.doesNotMatch(read('js/checkout.js'), /from\('orders'\)\.insert/);
});

test('panel has a change-password button that checks the current password first', () => {
    assert.match(read('admin/panel.html'), /id="passwordBtn"/);
    const fn = admin.slice(admin.indexOf('async changePassword('), admin.indexOf('async logout('));
    assert.ok(fn.indexOf('signInWithPassword') > -1 && fn.indexOf('signInWithPassword') < fn.indexOf('updateUser'),
        'must verify the current password before updating it');
});
