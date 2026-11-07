const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Sin red, tokens reales, navegador ni dependencias de test.
function harness(role = 'admin') {
    const elements = new Map();
    const events = {};
    const tasks = [];
    const state = { role, userId: 'user-1', profileId: 'user-1', executed: [], redirects: [], signOutError: null };
    const element = () => ({
        innerHTML: '', textContent: '', children: [], hidden: false, dataset: {},
        classList: { values: new Set(), contains(v) { return this.values.has(v); }, toggle() {}, remove(v) { this.values.delete(v); }, add(v) { this.values.add(v); } },
        appendChild(child) { this.children.push(child); },
        replaceChildren(...children) { this.children = children; this.innerHTML = ''; },
        querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, click() {}, focus() {}, setAttribute() {}
    });
    const document = {
        title: '', hidden: false, body: element(), activeElement: null,
        getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
        createElement: element, querySelectorAll: () => [],
        addEventListener(name, cb) { events['document:' + name] = cb; }
    };
    const location = { hash: '', replace(url) { state.redirects.push(url); } };
    function builder(table) {
        const query = { table, operation: 'select' };
        const b = {};
        for (const method of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'order', 'gte', 'limit', 'single', 'maybeSingle']) {
            b[method] = (...args) => {
                if (['insert', 'upsert', 'update', 'delete'].includes(method)) query.operation = method;
                if (method === 'eq') query[args[0]] = args[1];
                return b;
            };
        }
        b.then = (resolve, reject) => {
            if (table === 'profiles' && query.id) {
                const profile = state.role ? { id: state.profileId, role: state.role, name: 'Fixture', username: 'fixture' } : null;
                return Promise.resolve({ data: profile, error: state.profileError || null }).then(resolve, reject);
            }
            state.executed.push({ ...query });
            return Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
        };
        return b;
    }
    const client = {
        from: builder,
        auth: {
            async getSession() { return { data: { session: state.noSession ? null : { user: { id: 'user-1' } } }, error: state.sessionError }; },
            async getUser() { return { data: { user: { id: state.userId } }, error: state.identityError }; },
            async signOut() { state.signOut = true; return { error: state.signOutError }; },
            async signInWithPassword() { return { error: state.loginError }; },
            onAuthStateChange(cb) { state.onAuth = cb; }
        },
        async rpc() { return { data: 'fixture@example.invalid', error: null }; },
        storage: { from() { return { async upload() { state.uploaded = true; return { error: null }; }, getPublicUrl() { return { data: { publicUrl: 'https://example.invalid/test.png' } }; } }; } }
    };
    const ctx = vm.createContext({
        document, location, supabaseClient: client, console, URL, URLSearchParams,
        setTimeout(cb) { tasks.push(cb); }, setInterval(cb, ms) { events['interval:' + ms] = cb; },
        window: { addEventListener(name, cb) { events[name] = cb; }, scrollTo() {} },
        history: { replaceState(_a, _b, hash) { location.hash = hash; } }
    });
    for (const file of ['admin/js/permissions.js', 'admin/js/admin.js', 'admin/js/views-ventas.js', 'admin/js/views-catalogo.js', 'admin/js/views-sitio.js']) {
        vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    }
    const api = vm.runInContext('({AdminPermissions, PanelData, AdminAuth, Admin, UI, Uploads, Views, Data})', ctx);
    api.Admin.profile = { id: 'user-1', role, username: 'fixture' };
    return { ...api, state, elements, events, tasks, location, client, ctx };
}

test('matrix: operational access shared; advanced access and order deletion Super Admin only', () => {
    const { AdminPermissions: p } = harness();
    for (const role of ['admin', 'super_admin']) {
        for (const permission of ['resumen', 'pedidos', 'inventario', 'productos', 'categorias', 'banners', 'tallas', 'media']) assert.equal(p.can(role, permission), true);
    }
    for (const permission of ['supervision', 'configuracion', 'usuarios', 'paginas', 'suscriptores', 'pedidos.eliminar']) {
        assert.equal(p.can('admin', permission), false);
        assert.equal(p.can('super_admin', permission), true);
    }
    for (const role of ['pending', null, 'invented']) assert.equal(p.can(role, 'resumen'), false);
});

test('identity verified remotely; pending, anonymous, forged session and read failures fail closed', async () => {
    for (const setup of [h => h.state.role = 'pending', h => h.state.noSession = true,
        h => h.state.identityError = new Error('invalid'), h => h.state.userId = 'other-user',
        h => h.state.profileError = new Error('offline'), h => h.state.profileId = 'other-user']) {
        const h = harness(); setup(h);
        assert.equal(await h.AdminAuth.getActiveProfile(), null);
        assert.equal(await h.AdminAuth.requireAuth(), null);
        assert.equal(h.state.redirects.at(-1), 'index.html');
    }
    assert.equal((await harness().AdminAuth.getActiveProfile()).role, 'admin');
});

test('every panel query checks permission at execution, including chained mutation returning rows', async () => {
    const h = harness();
    for (const table of ['products', 'categories', 'banners', 'size_guide']) {
        for (const op of ['insert', 'update', 'delete']) {
            const r = await h.PanelData.from(table)[op]({ name: 'fixture' }).select().single();
            assert.equal(r.error, null);
            assert.equal(h.state.executed.at(-1).operation, op);
        }
    }
    for (const query of [h.PanelData.from('orders').delete().select(), h.PanelData.from('config').update({}),
        h.PanelData.from('profiles').select(), h.PanelData.from('pages').select(), h.PanelData.from('unknown').select()]) {
        const before = h.state.executed.length;
        assert.equal((await query).error.code, '42501');
        assert.equal(h.state.executed.length, before);
    }
    assert.equal((await h.PanelData.from('config').select()).error, null); // Public payment data needed in orders.
    h.state.role = 'super_admin';
    assert.equal((await h.PanelData.from('orders').delete()).error, null);
});

test('stale callbacks lose access on downgrade and pending clears sensitive UI before redirect', async () => {
    const h = harness('super_admin');
    const stale = h.PanelData.from('config').update({ transfer_info: 'stale' });
    h.UI.sheetState = { isDirty: () => true };
    h.ctx.document.getElementById('sheet').classList.add('is-open');
    h.Views.pedidos.orders = [{ customer_name: 'sensitive fixture' }];
    h.state.role = 'admin';
    assert.equal((await stale).error.code, '42501');
    assert.equal(h.Admin.profile.role, 'admin');
    assert.equal(h.Views.pedidos.orders.length, 0);
    assert.equal(h.UI.sheetState, null);
    const pending = h.PanelData.from('products').update({ stock: 1 });
    h.state.role = 'pending';
    assert.equal((await pending).error.code, '42501');
    assert.equal(h.Admin.profile, null);
    assert.equal(h.elements.get('nav').innerHTML, '');
    assert.equal(h.state.redirects.at(-1), 'index.html');
});

test('navigation rejects unauthorized hashes and chooses distinct role home views', async () => {
    for (const role of ['admin', 'super_admin']) {
        const h = harness(role);
        const rendered = [];
        for (const name of Object.keys(h.Views)) h.Views[name].render = async () => rendered.push(name);
        await h.Admin.route();
        assert.equal(rendered.at(-1), role === 'admin' ? 'resumen' : 'supervision');
        h.location.hash = '#usuarios';
        await h.Admin.route();
        assert.equal(rendered.at(-1), role === 'admin' ? 'resumen' : 'usuarios');
        h.location.hash = '#categorias';
        await h.Admin.route();
        assert.equal(rendered.at(-1), 'categorias');
        h.location.hash = '#does-not-exist';
        await h.Admin.route();
        assert.equal(h.location.hash, role === 'admin' ? '#resumen' : '#supervision');
    }
});

test('direct restricted view invocation and stale delete-order handler cannot bypass access', async () => {
    const h = harness();
    await assert.rejects(() => h.Views.usuarios.render({}), /permiso/);
    h.UI.confirm = async () => true;
    await h.Views.pedidos.remove({ id: 1, order_number: 'FIXTURE' });
    assert.equal(h.state.executed.some(q => q.table === 'orders' && q.operation === 'delete'), false);
});

test('logout clears UI; signed-out, focus, visibility and periodic events revalidate access', async () => {
    const h = harness();
    h.Admin.bind();
    assert.equal(typeof h.events.focus, 'function');
    assert.equal(typeof h.events['document:visibilitychange'], 'function');
    h.state.onAuth('SIGNED_OUT');
    assert.equal(h.Admin.profile, null);
    assert.equal(h.state.redirects.at(-1), 'index.html');
    await h.AdminAuth.logout();
    assert.equal(h.state.signOut, true);
    const h2 = harness();
    h2.Admin.loadBrand = async () => {};
    h2.Admin.refreshBadge = async () => {};
    h2.Admin.route = async () => {};
    await h2.Admin.init(h2.Admin.profile);
    assert.equal(typeof h2.events['interval:30000'], 'function');
    h2.state.role = 'pending';
    await h2.events.focus();
    assert.equal(h2.Admin.profile, null);
});

test('login accepts approved roles and signs out pending/unknown roles', async () => {
    for (const role of ['admin', 'super_admin']) {
        const h = harness(role);
        await h.AdminAuth.login('fixture', 'synthetic-password');
        assert.equal(h.state.signOut, undefined);
    }
    for (const role of ['pending', 'unknown']) {
        const h = harness(role);
        await assert.rejects(() => h.AdminAuth.login('fixture', 'synthetic-password'), /aprobada/);
        assert.equal(h.state.signOut, true);
    }
});

test('query results arriving after logout are discarded and logout failures are reported', async () => {
    const h = harness();
    let release;
    let started;
    const began = new Promise(resolve => { started = resolve; });
    h.client.from = () => ({ select() { return this; }, then(resolve, reject) {
        started();
        return new Promise(r => { release = r; }).then(resolve, reject);
    } });
    h.AdminAuth.getActiveProfile = async () => h.Admin.profile;
    const pending = Promise.resolve(h.PanelData.from('orders').select());
    await began;
    h.Admin.clearAccess();
    release({ data: [{ customer_name: 'stale' }], error: null });
    const result = await pending;
    assert.equal(result.error.code, '42501');
    assert.equal(result.data, null);
    const h2 = harness();
    h2.state.signOutError = new Error('offline');
    await h2.AdminAuth.logout();
    assert.equal(h2.Admin.profile, null);
    assert.equal(h2.state.redirects.length, 0);
    assert.equal(h2.elements.get('toasts').children.length, 1);
});

test('media uploads remain available to both roles and are rejected after revocation', async () => {
    for (const role of ['admin', 'super_admin']) {
        const h = harness(role);
        h.Uploads.compress = async f => f;
        await h.Uploads.upload('product-images', { name: 'fixture.png', size: 10 });
        assert.equal(h.state.uploaded, true);
    }
    const h = harness();
    h.state.role = 'pending';
    await assert.rejects(() => h.Uploads.upload('product-images', { name: 'fixture.png', size: 10 }), /permiso/);
    assert.equal(h.state.uploaded, undefined);
});

function checkoutHarness(response) {
    const ctx = vm.createContext({
        supabaseClient: { rpc: async (name, args) => { ctx.sent = { name, args }; return response; }, from() { throw new Error('Direct insert forbidden'); } }
    });
    const source = fs.readFileSync('js/checkout.js', 'utf8').replace('Checkout.init();', '');
    vm.runInContext(source, ctx);
    return { checkout: vm.runInContext('Checkout', ctx), ctx };
}

test('checkout uses RPC with a limited payload and preserves the authoritative total', async () => {
    const { checkout, ctx } = checkoutHarness({ data: [{ order_number: 'FIXTURE-1', total: 2500 }], error: null });
    const order = await checkout.createOrder({ name: 'Fixture' }, [{ productId: 1, quantity: 2, price: 1, total: 1 }]);
    assert.equal(order.total, 2500);
    assert.equal(ctx.sent.name, 'create_order');
    assert.equal(ctx.sent.args.p_items[0].price, undefined);
});

test('missing/failed RPC never falls back to direct orders insertion; malformed success rejected', async () => {
    for (const response of [
        { error: { code: 'PGRST202', message: 'missing' } },
        { error: { code: 'P0001', message: 'stock insuficiente' } },
        { error: null, data: [] },
        { error: null, data: [{ order_number: 'x', total: 'invalid' }] }
    ]) {
        const { checkout } = checkoutHarness(response);
        await assert.rejects(() => checkout.createOrder({}, []));
    }
});
