const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../db/2026-11-14_roles_inventory.sql'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');

test('database roles are only admin and super_admin, with pending as access status', () => {
    assert.match(migration, /check\s*\(\s*role\s+in\s*\('admin'\s*,\s*'super_admin'\)\s*\)/i);
    assert.match(migration, /check\s*\(\s*status\s+in\s*\('active'\s*,\s*'pending'\)\s*\)/i);
    assert.match(migration, /status\s*=\s*'active'/i);
    assert.match(schema, /check\s*\(\s*role\s+in\s*\('admin'\s*,\s*'super_admin'\)\s*\)/i);
});

test('Admin can manage categories and public users cannot insert orders directly', () => {
    assert.match(migration, /create\s+policy\s+"categories_write_admins"[\s\S]*?public\.is_admin\(\)/i);
    assert.match(migration, /drop\s+policy\s+if\s+exists\s+"orders_insert_public"/i);
    assert.match(migration, /revoke\s+insert\s+on\s+(?:table\s+)?public\.orders\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
    assert.doesNotMatch(schema, /create\s+policy\s+"orders_insert_public"/i);
});

test('stock changes are audited and do not silently clamp paid orders to zero', () => {
    assert.match(migration, /create\s+table\s+if\s+not\s+exists\s+public\.inventory_movements/i);
    assert.match(migration, /create\s+or\s+replace\s+function\s+public\.set_product_stock/i);
    assert.match(migration, /create\s+or\s+replace\s+function\s+public\.orders_apply_stock/i);
    assert.match(migration, /for\s+update/i);
    assert.match(migration, /raise\s+exception[^;]*stock/i);
    assert.doesNotMatch(migration, /greatest\s*\(\s*0\s*,\s*stock\s*-\s*coalesce/i);
});

test('Super Admin audit events are read-only to ordinary Admin users', () => {
    assert.match(migration, /create\s+table\s+if\s+not\s+exists\s+public\.audit_events/i);
    assert.match(migration, /create\s+policy\s+"audit_events_select_super_admin"[\s\S]*?public\.is_super_admin\(\)/i);
    assert.match(migration, /create\s+or\s+replace\s+function\s+public\.capture_audit_event/i);
});

test('username lookup no longer exists: the panel logs in with the full email', () => {
    // Historia: 2026-11-14 borró email_for_username y rompió el login (el panel aún la usaba),
    // 2026-11-23 la limitó a cuentas activas y 2026-11-25 la elimina junto con su uso en el panel,
    // porque igual le revelaba a cualquier visitante el correo de cada cuenta activa.
    const audit = fs.readFileSync(path.join(__dirname, '../db/2026-11-25_auditoria.sql'), 'utf8');
    for (const sql of [audit, schema]) {
        assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.email_for_username/i);
        assert.match(sql, /drop\s+function\s+if\s+exists\s+public\.email_for_username\(text\)/i);
    }
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../admin/js/admin.js'), 'utf8'), /email_for_username/);
});

test('schema.sql matches the hardened model of the migrations', () => {
    assert.match(schema, /revoke\s+insert\s+on\s+table\s+public\.orders\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
    assert.match(schema, /create\s+policy\s+"categories_write_admins"/i);
    assert.match(schema, /create\s+table\s+if\s+not\s+exists\s+public\.inventory_movements/i);
    assert.doesNotMatch(schema, /role\s+in\s*\([^)]*'pending'/i, 'pending must not be a role');
    assert.doesNotMatch(schema, /k1llu4@|ariaspopflame@/i, 'no hard-coded account emails');
    // is_admin / is_super_admin always require an active account
    for (const name of ['is_admin', 'is_super_admin']) {
        const fns = schema.match(new RegExp(`function\\s+public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`, 'gi')) || [];
        assert.ok(fns.length > 0);
        for (const fn of fns) assert.match(fn, /status\s*=\s*'active'/i);
    }
});

test('checkout refuses products manually marked as sold out', () => {
    const fix = fs.readFileSync(path.join(__dirname, '../db/2026-11-23_correcciones.sql'), 'utf8');
    for (const sql of [fix, schema]) assert.match(sql, /v_status\s*=\s*'agotado'/);
});

test('unsubscribe links need the secret per-subscriber code, not just the email', () => {
    const mig = fs.readFileSync(path.join(__dirname, '../db/2026-11-24_baja_con_codigo.sql'), 'utf8');
    for (const sql of [mig, schema]) {
        assert.match(sql, /unsubscribe_token\s+uuid\s+not\s+null\s+default\s+gen_random_uuid\(\)/i);
        assert.match(sql, /function\s+public\.unsubscribe_with_token\s*\(\s*p_token\s+uuid\s*\)/i);
        assert.match(sql, /drop\s+function\s+if\s+exists\s+public\.unsubscribe_newsletter\s*\(\s*text\s*\)/i);
        assert.match(sql, /revoke\s+insert\s+on\s+table\s+public\.subscribers\s+from\s+anon\s*,\s*authenticated/i);
    }
    assert.doesNotMatch(schema, /create\s+policy\s+"subscribers_insert_public"/i);
    assert.doesNotMatch(schema, /create\s+or\s+replace\s+function\s+public\.unsubscribe_newsletter/i);
});

test('unsubscribe page and emails use the code link', () => {
    const baja = fs.readFileSync(path.join(__dirname, '../js/baja.js'), 'utf8');
    assert.match(baja, /rpc\('unsubscribe_with_token'/);
    assert.doesNotMatch(baja, /get\('email'\)/);
    for (const f of ['welcome-email', 'notify-new-product']) {
        const src = fs.readFileSync(path.join(__dirname, `../supabase/functions/${f}/index.ts`), 'utf8');
        assert.match(src, /baja\.html\?t=/);
        assert.doesNotMatch(src, /baja\.html\?email=/);
    }
});
