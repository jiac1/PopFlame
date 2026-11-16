(function (root) {
    const ROLES = Object.freeze(['admin', 'super_admin']);
    const PERMISSIONS = Object.freeze([
        'sales.view',
        'products.manage',
        'products.delete',
        'prices_sizes.edit',
        'inventory.manage',
        'orders.manage',
        'banners.manage',
        'categories.manage',
        'pages.manage',
        'subscribers.manage',
        'technical.manage',
        'payments.manage',
        'users.manage',
        'audit.view',
        'diagnostics.run',
        'metrics.advanced',
        'features.configure',
        'orders.delete'
    ]);
    const ADMIN_PERMISSIONS = new Set([
        'sales.view', 'products.manage', 'products.delete', 'prices_sizes.edit',
        'inventory.manage', 'orders.manage', 'banners.manage', 'categories.manage'
    ]);
    const ROLE_LABELS = Object.freeze({
        admin: 'Administrador',
        super_admin: 'Super administrador'
    });

    const api = {
        ROLES,
        PERMISSIONS,
        ROLE_LABELS,
        canAccess(profile) {
            return !!profile && profile.status === 'active' && ROLES.includes(profile.role);
        },
        can(profile, permission) {
            if (!this.canAccess(profile) || !PERMISSIONS.includes(permission)) return false;
            return profile.role === 'super_admin' || ADMIN_PERMISSIONS.has(permission);
        },
        isSuper(profile) {
            return this.canAccess(profile) && profile.role === 'super_admin';
        },
        roleLabel(role) {
            return ROLE_LABELS[role] || 'Sin perfil';
        },
        statusLabel(status) {
            return status === 'active' ? 'Activo' : status === 'pending' ? 'Pendiente' : 'Inactivo';
        }
    };

    root.PFAccess = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
