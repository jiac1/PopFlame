// Revisión de seguridad de la base REAL de producción, con la clave pública de la tienda.
//
// Las pruebas de tests/*.test.cjs revisan los archivos del repositorio. Esta revisa lo que está
// instalado de verdad en Supabase: en noviembre de 2026 se descubrió que la base publicada tenía
// políticas antiguas (cualquiera podía crear pedidos directo) aunque el repositorio decía otra cosa.
//
// Hace lo mismo que podría hacer cualquier visitante, sin iniciar sesión:
//   - Lecturas de tablas privadas (deben volver vacías o rechazadas).
//   - Un intento de crear un pedido directo (debe rechazarse). Si llegara a funcionar, deja un
//     pedido "PRUEBA AUTOMÁTICA (CI)" que hay que borrar, y la revisión falla.
//   - create_order con el carrito vacío (debe responder el error de validación, sin crear nada).
//
// Uso: node tests/produccion.check.mjs   (también corre en GitHub Actions, ver .github/workflows)

const URL_BASE = 'https://ysxinhpymvhdnfbdanvn.supabase.co';
const KEY = 'sb_publishable_WHh5SfBgWKa7_XhFQRxGqQ_SrWk_u9H';
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

async function call(path, options = {}) {
    const res = await fetch(URL_BASE + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
}

const denied = (r) => r.status === 401 || r.status === 403;
const emptyOrDenied = (r) => denied(r) || (r.status === 200 && Array.isArray(r.body) && r.body.length === 0);

// 1. Tablas privadas: un visitante no ve nada
for (const table of ['orders', 'profiles', 'subscribers', 'inventory_movements', 'audit_events']) {
    const r = await call(`/rest/v1/${table}?select=*&limit=1`);
    check(`Un visitante no puede leer "${table}"`, emptyOrDenied(r), `HTTP ${r.status}`);
}

// 2. Pedidos: nadie los crea directo (solo create_order)
{
    const r = await call('/rest/v1/orders', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
            customer_name: 'PRUEBA AUTOMÁTICA (CI) - borrar', customer_email: 'prueba-ci@example.invalid',
            customer_phone: '900000000', items: [], subtotal: 1, total: 1, status: 'pending'
        })
    });
    check('Un visitante no puede crear pedidos directo', denied(r), `HTTP ${r.status}`);
}

// 3. Suscriptores: nadie se agrega por la API
{
    const r = await call('/rest/v1/subscribers', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ email: 'prueba-ci@example.invalid' })
    });
    check('Un visitante no puede agregar suscriptores', denied(r), `HTTP ${r.status}`);
}

// 4. Funciones: las internas no se pueden llamar, el checkout sí y valida
{
    const r = await call('/rest/v1/rpc/email_for_username', { method: 'POST', body: JSON.stringify({ p_username: 'admin' }) });
    check('No existe la búsqueda pública de correos (email_for_username)', r.status === 404, `HTTP ${r.status}`);
}
{
    const r = await call('/rest/v1/rpc/set_product_stock', {
        method: 'POST',
        body: JSON.stringify({ p_product_id: 1, p_stock: 1, p_expected_stock: 0 })
    });
    check('Un visitante no puede ajustar stock', r.status >= 400 && r.status !== 500, `HTTP ${r.status}`);
}
{
    const r = await call('/rest/v1/rpc/create_order', {
        method: 'POST',
        body: JSON.stringify({ p_customer: { name: 'Prueba CI', email: 'prueba-ci@example.invalid', phone: '900000000' }, p_items: [] })
    });
    const msg = typeof r.body === 'object' ? r.body?.message : String(r.body);
    check('El checkout (create_order) existe y valida el carrito', r.status === 400 && /carrito est[aá] vac[ií]o/i.test(msg || ''), `HTTP ${r.status} ${msg || ''}`);
}
{
    const r = await call('/rest/v1/rpc/orders_apply_stock', { method: 'POST', body: '{}' });
    check('Las funciones internas (triggers) no se pueden llamar por la API', r.status >= 400, `HTTP ${r.status}`);
}

// 5. Columnas que la tienda necesita (si falta una migración, esto falla)
{
    const r = await call('/rest/v1/products?select=id,status,stock,size_stock&limit=1');
    check('La tabla products tiene status, stock y size_stock (stock por talla)', r.status === 200, `HTTP ${r.status}`);
}

// Resultado
let failed = 0;
for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${results.length - failed} de ${results.length} revisiones correctas.`);
if (failed) {
    console.log('\nLa base de producción no coincide con lo esperado. Revisa db/ y aplica la migración que falte.');
    process.exit(1);
}
