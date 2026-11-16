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

test('username lookup that exposed Auth emails is removed', () => {
    assert.match(migration, /drop\s+function\s+if\s+exists\s+public\.email_for_username\s*\(\s*text\s*\)/i);
    assert.doesNotMatch(schema, /create\s+or\s+replace\s+function\s+public\.email_for_username/i);
});
