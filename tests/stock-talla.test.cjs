// Stock por talla, fallos de compra del análisis de Codex, CSV y permisos de producción.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const permisos = read('db/2026-11-26_permisos_produccion.sql');
const tallas = read('db/2026-11-27_stock_por_talla.sql');
const schema = read('db/schema.sql');

const fnBody = (sql, name) => {
    const m = sql.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'));
    assert.ok(m, `${name} must be defined`);
    return m[0];
};

// ---------- Tienda: carrito y productos ----------

globalThis.PFSafety = require('../js/safety.js');
globalThis.PF = { url: (p = '') => '/' + p, escape: (s) => String(s ?? '') };
const PM = require('../js/products.js');
globalThis.ProductsManager = PM;
const toasts = [];
globalThis.UI = { toast: (msg) => toasts.push(msg) };
const Cart = require('../js/cart.js');
Cart.save = () => {}; Cart.updateUI = () => {}; Cart.bumpCount = () => {};

const row = (over = {}) => ({
    id: 1, name: 'Polerón', category_id: 'polerones', price: 30000, sizes: ['S', 'M', 'L'], colors: [],
    image: '', images: [], stock: 5, status: 'disponible', size_stock: {}, ...over
});
const load = (...rows) => { PM.products = rows.map(r => PM.mapProduct(r)); PM.loaded = true; return PM.products; };
const line = (productId, size, quantity) => ({ productId, name: 'Polerón', price: 30000, size, color: '', quantity, image: '' });

test('cart sync caps the SUM of all sizes to the product stock (Codex: 3 S + 3 M with stock 5)', () => {
    load(row({ stock: 5 }));
    Cart.cart = [line(1, 'S', 3), line(1, 'M', 3)];
    Cart.sync();
    assert.equal(Cart.quantityOf(1), 5);
    assert.deepEqual(Cart.cart.map(i => [i.size, i.quantity]), [['S', 3], ['M', 2]]);
});

test('a size with its own stock limits the cart, and the total still applies', () => {
    const [p] = load(row({ stock: 30, size_stock: { S: 1, M: 10, L: 10 } }));
    Cart.cart = [];
    assert.equal(Cart.addToCart(p, 'S', '', 3), true);
    assert.equal(Cart.quantityOfSize(1, 'S'), 1, 'only 1 unit of size S exists');
    assert.equal(Cart.addToCart(p, 'S', '', 1), false);
    assert.match(toasts.at(-1), /talla S/);
    assert.equal(Cart.addToCart(p, 'M', '', 4), true);
    assert.equal(Cart.quantityOf(1), 5);

    Cart.cart = [line(1, 'S', 4), line(1, 'M', 12)];
    Cart.sync();
    assert.deepEqual(Cart.cart.map(i => [i.size, i.quantity]), [['S', 1], ['M', 10]]);
});

test('sizes without their own number only follow the total (old products keep working)', () => {
    const [p] = load(row({ stock: 4, size_stock: { S: 1 } }));
    assert.equal(PM.availableFor(p, 'S'), 1);
    assert.equal(PM.availableFor(p, 'M'), 4);
    assert.equal(p.stock, 4, 'not every size is tracked: the total rules');
});

test('when every size has its own stock, the store cannot sell more than their sum', () => {
    const [p] = load(row({ stock: 30, size_stock: { S: 0, M: 2, L: 1 } }));
    assert.equal(p.stock, 3);
    assert.equal(PM.availableFor(p, 'S'), 0);
    const [q] = load(row({ stock: 30, size_stock: { S: 0, M: 0, L: 0 } }));
    assert.equal(q.stock, 0, 'every size sold out = product sold out');
    assert.equal(PM.stockState(q), 'out');
});

test('"A Pedido" ignores size stock and "Agotado" sells nothing', () => {
    const [p] = load(row({ status: 'a_pedido', stock: 0, size_stock: { S: 0 } }));
    assert.equal(PM.availableFor(p, 'S'), 99);
    const [q] = load(row({ status: 'agotado', stock: 9, size_stock: { S: 5 } }));
    assert.equal(PM.availableFor(q, 'S'), 0);
});

test('size stock of sizes no longer offered is ignored', () => {
    const [p] = load(row({ sizes: ['M'], size_stock: { S: 3, M: 2 } }));
    assert.deepEqual(p.sizeStock, { M: 2 });
});

test('a failed config query does not cache a store without WhatsApp/shipping (Codex)', async () => {
    const ok = (data) => ({ data, error: null });
    const builder = (result) => {
        const b = { select: () => b, order: () => b, eq: () => b, maybeSingle: () => Promise.resolve(result), then: (r, j) => Promise.resolve(result).then(r, j) };
        return b;
    };
    globalThis.supabaseClient = {
        from: (t) => builder(t === 'config' ? { data: null, error: { message: 'timeout' } } : ok([]))
    };
    const origError = console.error;
    console.error = () => {};
    try {
        assert.equal(await PM.fetchFresh(), null);
    } finally {
        console.error = origError;
        delete globalThis.supabaseClient;
    }
});

test('product page distinguishes load error, empty catalog and missing product (Codex)', () => {
    const src = read('js/product.js');
    assert.match(src, /render: \(store, meta\) => this\.render\(meta\)/);
    assert.match(src, /if \(meta\.failed\) this\.renderNotFound\(true\)/);
    assert.match(src, /else if \(meta\.fresh \|\| ProductsManager\.products\.length\) this\.renderNotFound\(\)/);
    assert.match(src, /No pudimos cargar el producto/);
    // Las tallas agotadas se deshabilitan y la cantidad respeta la talla elegida
    assert.match(src, /ProductsManager\.availableFor\(p, s\) <= 0/);
    assert.match(src, /CartManager\.remainingFor\(p, this\.size\)/);
});

// ---------- Panel ----------

const loadAdminU = () => {
    const ctx = { console, PFAccess: {}, supabaseClient: {}, document: {}, window: {}, location: {}, globalThis: null };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('admin/js/admin.js') + '\n;globalThis.__U = U;', ctx);
    return ctx.__U;
};

test('CSV export neutralizes spreadsheet formulas but keeps phone numbers (Codex/OWASP)', () => {
    const U = loadAdminU();
    assert.equal(U.csvCell('=HYPERLINK("http://x","clic")'), `"'=HYPERLINK(""http://x"",""clic"")"`);
    assert.equal(U.csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
    assert.equal(U.csvCell('-2+3+cmd|calc'), `"'-2+3+cmd|calc"`);
    assert.equal(U.csvCell('+56 9 1234-5678'), '"+56 9 1234-5678"');
    assert.equal(U.csvCell(24990), '"24990"');
    assert.equal(U.csvCell('Ana'), '"Ana"');
    for (const f of ['admin/js/views-ventas.js', 'admin/js/views-sitio.js']) assert.match(read(f), /U\.csvCell/);
});

test('size stock helpers in the panel', () => {
    const U = loadAdminU();
    assert.equal(JSON.stringify(U.sizeStockOf({ sizes: ['S', 'M'], size_stock: { S: 2, XL: 1 } })), '{"S":2}');
    assert.equal(U.sameSizeStock({ S: 1, M: 2 }, { M: 2, S: 1 }), true);
    assert.equal(U.sameSizeStock({ S: 1 }, { S: 1, M: 0 }), false);
});

test('the product editor and Inventario save size stock through set_product_stock', () => {
    const catalog = read('admin/js/views-catalogo.js');
    assert.match(catalog, /id="pSizeStockOn"/);
    assert.match(catalog, /insert\(\{ \.\.\.payload, stock, size_stock: sizeStock \}\)/);
    assert.match(catalog, /p_size_stock: sizeStock, p_expected_size_stock: prevSizeStock/);
    const save = catalog.slice(catalog.indexOf('async save(existing, btn)'), catalog.indexOf('    duplicate(p) {'));
    const payload = save.slice(save.indexOf('const payload = {'), save.indexOf('};', save.indexOf('const payload = {')));
    assert.doesNotMatch(payload, /size_stock/, 'size stock is not part of the plain update');
    const inv = read('admin/js/views-ventas.js');
    assert.match(inv, /p_size_stock: merged, p_expected_size_stock: prev/);
});

test('the panel re-checks the session without logging out on a network error', () => {
    const src = read('admin/js/admin.js');
    const fn = src.slice(src.indexOf('async revalidate()'), src.indexOf('async route()'));
    assert.match(fn, /if \(error\) return;/);
    assert.match(fn, /PFAccess\.canAccess\(profile\)/);
    assert.match(src, /visibilitychange/);
});

// ---------- Base de datos: stock por talla ----------

test('size stock is a validated jsonb column and movements record the size', () => {
    for (const sql of [tallas, schema]) {
        assert.match(sql, /add column if not exists size_stock jsonb not null default '\{\}'::jsonb/);
        assert.match(sql, /check \(public\.valid_size_stock\(size_stock\)\)/);
        assert.match(sql, /\^\[0-9\]\{1,6\}\$/);
    }
    assert.match(tallas, /alter table public\.inventory_movements add column if not exists size text/);
    assert.match(schema, /size\s+text,\s+-- null = stock total/);
});

test('paying an order deducts the total AND the size; cancelling restores both', () => {
    for (const sql of [tallas, schema]) {
        const fn = fnBody(sql, 'orders_apply_stock');
        const paid = fn.slice(fn.indexOf('if v_is_paid and not old.stock_applied'), fn.indexOf('elsif not v_is_paid'));
        assert.match(paid, /set stock = stock - v_quantity/);
        assert.match(paid, /jsonb_set\(size_stock, array\[v_size\], to_jsonb\(v_left\)\)/);
        assert.match(paid, /continue when not found or v_status = 'a_pedido' or not \(v_size_stock \? v_size\)/);
        assert.match(paid, /raise exception 'No queda stock suficiente de la talla/);
        const reversal = fn.slice(fn.indexOf('elsif not v_is_paid'));
        assert.match(reversal, /select product_id, size, \(-sum\(delta\)\)::integer/);
        assert.match(reversal, /group by 1, 2/);
        assert.match(reversal, /if v_size is null then\s+update public\.products set stock = stock \+ v_quantity/);
    }
});

test('the stock history trigger logs total and per-size changes', () => {
    for (const sql of [tallas, schema]) {
        const fn = fnBody(sql, 'track_product_stock_change');
        assert.match(fn, /new\.size_stock is distinct from old\.size_stock/);
        assert.match(sql, /after update of stock, size_stock on public\.products/);
    }
});

test('checkout validates the stock of the chosen size on the server', () => {
    for (const sql of [tallas, schema]) {
        const fn = fnBody(sql, 'create_order');
        assert.match(fn, /v_size_stock \? v_size/);
        assert.match(fn, /raise exception 'La talla % de "%" ya no tiene stock suficiente'/);
        assert.match(fn, /Una talla del carrito ya no está disponible/);
    }
});

test('set_product_stock accepts size stock with its own concurrency check, old calls still work', () => {
    for (const sql of [tallas, schema]) {
        const fn = fnBody(sql, 'set_product_stock');
        assert.match(fn, /p_size_stock jsonb default null/);
        assert.match(fn, /p_expected_size_stock jsonb default null/);
        assert.match(fn, /p_expected_size_stock is distinct from v_current_sizes/);
        assert.match(fn, /errcode = '40001'/);
        assert.match(fn, /no está entre las tallas del producto/);
        assert.match(sql, /drop function if exists public\.set_product_stock\(bigint, integer, integer, text\);/);
        assert.match(sql, /grant execute on function public\.set_product_stock\(bigint, integer, integer, text, jsonb, jsonb\) to authenticated/);
    }
});

// ---------- Base de datos: permisos de producción ----------

test('orders: no direct inserts, only the status can be updated, restrictive guards', () => {
    for (const sql of [permisos, schema]) {
        assert.match(sql, /drop policy if exists "orders_insert_public" on public\.orders/);
        assert.match(sql, /revoke update on table public\.orders from public, anon, authenticated;\s*grant update \(status\) on table public\.orders to authenticated/);
        assert.match(sql, /create policy "orders_guard_insert" on public\.orders\s+as restrictive for insert to anon, authenticated with check \(false\)/);
        assert.match(sql, /create policy "orders_guard_delete" on public\.orders\s+as restrictive for delete/);
        assert.match(sql, /create policy "profiles_guard_insert" on public\.profiles\s+as restrictive/);
        assert.match(sql, /create policy "subscribers_guard_insert" on public\.subscribers\s+as restrictive/);
    }
    // El panel solo cambia el estado de los pedidos
    const updates = read('admin/js/views-ventas.js').match(/from\('orders'\)\.update\(([^)]*)\)/g) || [];
    assert.ok(updates.length > 0);
    for (const u of updates) assert.match(u, /update\(\{ status \}\)/);
});

test('Admin can manage categories and photos (the owner could not upload product photos)', () => {
    for (const sql of [permisos, schema]) {
        assert.match(sql, /drop policy if exists "categories_write_super_admin"/);
        assert.match(sql, /create policy "categories_write_admins"/);
        for (const bucket of ['product_images', 'site_assets']) {
            for (const op of ['write', 'update', 'delete']) {
                assert.match(sql, new RegExp(`drop policy if exists "${bucket}_super_admin_${op}"`));
                assert.match(sql, new RegExp(`create policy "${bucket}_admins_${op}"[\\s\\S]*?public\\.is_admin\\(\\)`));
            }
        }
    }
});

test('trigger functions are not callable through the API', () => {
    for (const sql of [permisos, schema]) {
        assert.match(sql, /p\.prorettype = 'trigger'::regtype/);
        assert.match(sql, /revoke execute on function %s from public, anon, authenticated/);
    }
});

test('CI runs the tests and checks the real production database', () => {
    const wf = read('.github/workflows/pruebas.yml');
    assert.match(wf, /node --test tests\/\*\.test\.cjs/);
    assert.match(wf, /node tests\/produccion\.check\.mjs/);
    assert.match(read('.github/workflows/supabase-keepalive.yml'), /if: github\.ref == 'refs\/heads\/main'/);
});
