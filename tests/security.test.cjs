const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;

function checkout(storage = new Map(), rpc = async () => ({ data: [{ order_number: 'TEST', total: 500 }], error: null })) {
    const ctx = vm.createContext({ crypto,
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        supabaseClient: { rpc, from() { throw new Error('Forbidden direct insert'); } }
    });
    vm.runInContext(fs.readFileSync('js/checkout.js', 'utf8').replace('Checkout.init();', ''), ctx);
    return { c: vm.runInContext('Checkout', ctx), ctx, storage };
}
const customer = { name: 'Fixture', email: 'fixture@example.invalid', phone: '900000000', note: '' };
const items = [{ productId: 123, quantity: 1, size: 'M', color: 'Negro', price: 1, name: 'simulated' }];

test('only valid server totals accepted, without recomputing or coercing the receipt', async () => {
    for (const total of [0, 500, '0', '500.25']) {
        const { c } = checkout(new Map(), async () => ({ data: [{ order_number: 'TEST', total }], error: null }));
        assert.equal((await c.createOrder(customer, items)).total, total);
    }
    for (const total of [null, undefined, '', ' ', '\t', -1, '-1', 'no', true, false, {}, [], NaN, Infinity, 'Infinity', '0x10']) {
        const { c } = checkout(new Map(), async () => ({ data: [{ order_number: 'TEST', total }], error: null }));
        await assert.rejects(() => c.createOrder(customer, items), /inválida/);
    }
});

test('lost response and reload retry with the same persisted key; no direct insert', async () => {
    const storage = new Map();
    const keys = [];
    let attempts = 0;
    const rpc = async (_name, args) => {
        keys.push(args.p_customer.idempotencyKey);
        assert.equal(args.p_items[0].price, undefined);
        if (++attempts === 1) throw new Error('Response lost after commit');
        return { data: [{ order_number: 'SAME', total: 500 }], error: null };
    };
    await assert.rejects(() => checkout(storage, rpc).c.createOrder(customer, items));
    assert.equal((await checkout(storage, rpc).c.createOrder(customer, items)).order_number, 'SAME');
    assert.equal(keys[0], keys[1]);
});

test('uncertain attempt cannot be replaced by a changed cart or customer', async () => {
    let calls = 0;
    const { c } = checkout(new Map(), async () => { calls++; throw new Error('offline'); });
    await assert.rejects(() => c.createOrder(customer, items));
    await assert.rejects(() => c.createOrder({ ...customer, email: 'changed@example.invalid' }, items), /pendiente/);
    await assert.rejects(() => c.createOrder(customer, [{ ...items[0], quantity: 2 }]), /pendiente/);
    assert.equal(calls, 1);
});

test('definite business rejection frees attempt, while 5xx and missing RPC retain it', async () => {
    for (const code of ['P0001', 'PGRST202', 'XX000']) {
        const { c, storage } = checkout(new Map(), async () => ({ error: { code, message: 'rejected' } }));
        await assert.rejects(() => c.createOrder(customer, items), error => {
            assert.equal(error.refreshCart, code === 'P0001');
            return true;
        });
        assert.equal(storage.has(c.attemptKey), code !== 'P0001');
    }
});

test('receipt rendering failure retains cart and attempt for recovery', async () => {
    const { c, ctx, storage } = checkout();
    c.prepareAttempt(customer, items);
    ctx.CartManager = { getItems: () => items, clearCart() { throw new Error('Cart must not be cleared'); } };
    c.renderConfirmation = () => { throw new Error('render failed'); };
    assert.throws(() => c.finishOrder({ total: 500 }, customer, items, ''), /render failed/);
    assert.equal(c.done, false);
    assert.equal(storage.has(c.attemptKey), true);
});

test('successful recovery clears key but preserves a different new cart', async () => {
    const { c, ctx, storage } = checkout();
    c.prepareAttempt(customer, items);
    let cleared = false;
    ctx.CartManager = { getItems: () => [{ ...items[0], quantity: 2 }], clearCart() { cleared = true; } };
    c.renderConfirmation = c.renderRecovery = () => {};
    c.finishOrder({ total: 500 }, customer, items, '');
    assert.equal(cleared, false);
    assert.equal(storage.has(c.attemptKey), false);
    const next = c.prepareAttempt(customer, items);
    assert.ok(next.key);
});

test('disabled storage or corrupt pending state fail before contacting backend', async () => {
    const { c, ctx, storage } = checkout(new Map(), async () => { throw new Error('BACKEND CALLED'); });
    ctx.localStorage.setItem = () => { throw new Error('storage disabled'); };
    await assert.rejects(() => c.createOrder(customer, items), /storage disabled/);
    storage.set(c.attemptKey, '{broken');
    await assert.rejects(() => c.createOrder(customer, items), /JSON/);
});

function environment(origin, cfg) {
    const calls = [];
    const location = { origin, href: origin + '/admin/' };
    const window = { location, supabase: { createClient: (...args) => { calls.push(args); return {}; } } };
    const ctx = vm.createContext({ window, location, URL, atob, console: { error() {} } });
    vm.runInContext(fs.readFileSync('js/runtime-config.js', 'utf8'), ctx);
    if (cfg) window.POPFLAME_RUNTIME = cfg;
    vm.runInContext(fs.readFileSync('js/supabaseClient.js', 'utf8'), ctx);
    return { calls, window };
}

test('unconfigured localhost and Vercel previews cannot open production backend', () => {
    for (const origin of ['http://localhost:8000', 'http://127.0.0.1:8041', 'https://branch-preview.vercel.app']) {
        assert.equal(environment(origin).calls.length, 0);
        for (const supabaseUrl of ['https://ysxinhpymvhdnfbdanvn.supabase.co', 'https://ysxinhpymvhdnfbdanvn.supabase.co.']) {
            assert.equal(environment(origin, { environment: 'staging', supabaseUrl, publishableKey: 'sb_publishable_test' }).calls.length, 0);
        }
    }
});

test('production defaults preserve URL, public key, cache namespace and login client', () => {
    const { calls, window } = environment('https://pop-flame.vercel.app');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'https://ysxinhpymvhdnfbdanvn.supabase.co');
    assert.equal(window.PopFlameEnvironment.storageKey('popflame_cart'), 'popflame_cart');
});

test('staging isolates caches/assets and rejects secret credentials', () => {
    const cfg = { environment: 'staging', supabaseUrl: 'https://qa-fixture.supabase.co', publishableKey: 'sb_publishable_test' };
    const { calls, window } = environment('http://127.0.0.1:8041', cfg);
    assert.equal(calls.length, 1);
    assert.notEqual(window.PopFlameEnvironment.storageKey('pf_store_cache'), 'pf_store_cache');
    assert.equal(window.PopFlameEnvironment.allowsAsset('https://ysxinhpymvhdnfbdanvn.supabase.co/storage/v1/object/public/site-assets/x.png'), false);
    assert.equal(window.PopFlameEnvironment.allowsAsset('/images/logo.png'), true);
    for (const publishableKey of ['sb_secret_no', 'invalid', btoa('{}') + '.' + btoa('{"role":"service_role"}') + '.signature']) {
        assert.equal(environment('http://127.0.0.1:8041', { ...cfg, publishableKey }).calls.length, 0);
    }
});

test('all connected HTML loads configuration first and has no production preconnect', () => {
    const files = ['index.html', 'admin/index.html', 'admin/panel.html', ...fs.readdirSync('pages').map(f => 'pages/' + f)];
    for (const file of files.filter(f => f.endsWith('.html'))) {
        const html = fs.readFileSync(file, 'utf8');
        if (!html.includes('supabaseClient.js')) continue;
        assert.ok(html.indexOf('runtime-config.js') < html.indexOf('supabaseClient.js'), file);
        assert.equal(/preconnect[^>]*ysxinhpymvhdnfbdanvn/.test(html), false, file);
    }
});

test('panel adapter denies non-status order writes before sending a query', async () => {
    let executed = 0;
    const builder = { update() { return this; }, eq() { return this; }, then(resolve) { executed++; resolve({ error: null }); } };
    const ctx = vm.createContext({ supabaseClient: { from: () => builder }, Admin: { async requirePermission() {}, can: () => true } });
    vm.runInContext(fs.readFileSync('admin/js/permissions.js', 'utf8'), ctx);
    const panel = vm.runInContext('PanelData', ctx);
    for (const column of ['total', 'subtotal', 'items', 'stock_applied', 'note']) {
        assert.equal((await panel.from('orders').update({ [column]: 1 }).eq('id', 1)).error.code, '42501');
    }
    assert.equal(executed, 0);
    assert.equal((await panel.from('orders').update({ status: 'confirmed' })).error, null);
    assert.equal(executed, 1);
});

for (const name of ['welcome-email', 'notify-new-product']) {
    test(`${name}: actual handler guard skips effects before reading payload outside explicit production`, async () => {
        const source = fs.readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');
        const start = source.indexOf('=> {', source.indexOf('Deno.serve')) + 4;
        const end = source.indexOf('\n    try {', start);
        assert.ok(start > 4 && end > start);
        // Execute the actual preamble in a VM with no fetch/network primitives.
        for (const env of [
            { POPFLAME_ENV: 'staging', POPFLAME_NOTIFICATIONS_ENABLED: 'true' },
            { POPFLAME_ENV: 'production' },
            { POPFLAME_ENV: 'production', POPFLAME_NOTIFICATIONS_ENABLED: 'true' }
        ]) {
            const handler = vm.runInNewContext('(async req => {' + source.slice(start, end) + '\nreturn null;})', {
                Deno: { env: { get: key => env[key] } },
                json: (body, status) => ({ body, status })
            });
            const response = await handler({ method: 'POST', json() { throw new Error('Payload must not be read'); } });
            if (env.POPFLAME_ENV === 'production' && env.POPFLAME_NOTIFICATIONS_ENABLED === 'true') assert.equal(response, null);
            else { assert.equal(response.status, 200); assert.equal(response.body.skipped, true); }
        }
    });
}
