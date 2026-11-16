const test = require('node:test');
const assert = require('node:assert/strict');
const Access = require('../admin/js/access-control.js');

test('the only assignable profile roles are admin and super_admin', () => {
    assert.deepEqual(Access.ROLES, ['admin', 'super_admin']);
});

test('pending profiles have no panel access even when a role is assigned', () => {
    for (const role of Access.ROLES) {
        assert.equal(Access.canAccess({ role, status: 'pending' }), false);
        assert.equal(Access.can({ role, status: 'pending' }, 'inventory.manage'), false);
    }
});

test('admin can operate the store including categories and permanent product deletion', () => {
    const admin = { role: 'admin', status: 'active' };
    for (const permission of [
        'sales.view', 'products.manage', 'products.delete', 'prices_sizes.edit',
        'inventory.manage', 'orders.manage', 'banners.manage', 'categories.manage'
    ]) assert.equal(Access.can(admin, permission), true, permission);
    for (const permission of [
        'technical.manage', 'users.manage', 'audit.view', 'diagnostics.run', 'metrics.advanced'
    ]) assert.equal(Access.can(admin, permission), false, permission);
});

test('super admin can perform every declared capability', () => {
    const superAdmin = { role: 'super_admin', status: 'active' };
    for (const permission of Access.PERMISSIONS) {
        assert.equal(Access.can(superAdmin, permission), true, permission);
    }
});

test('unknown roles and inactive statuses are denied', () => {
    assert.equal(Access.canAccess({ role: 'owner', status: 'active' }), false);
    assert.equal(Access.canAccess({ role: 'admin', status: 'disabled' }), false);
    assert.equal(Access.canAccess(null), false);
});
