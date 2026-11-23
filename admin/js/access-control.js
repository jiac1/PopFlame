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
        // Devuelve el problema de la contraseña nueva (texto para mostrar) o '' si está bien.
        passwordProblem(current, next, repeat) {
            if (!current) return 'Escribe tu contraseña actual.';
            if (!next || next.length < 8) return 'La contraseña nueva debe tener al menos 8 caracteres.';
            if (next.length > 72) return 'La contraseña nueva puede tener como máximo 72 caracteres.';
            if (next === current) return 'La contraseña nueva debe ser distinta a la actual.';
            if (next !== repeat) return 'Las contraseñas nuevas no coinciden.';
            return '';
        },
        statusLabel(status) {
            return status === 'active' ? 'Activo' : status === 'pending' ? 'Pendiente' : 'Inactivo';
        }
    };

    root.PFAccess = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
