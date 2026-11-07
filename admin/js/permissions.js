// Una sola matriz para navegación y operaciones del panel. RLS aplica la misma
// separación en el servidor; esta matriz nunca sustituye las políticas SQL.
const AdminPermissions = (() => {
    const operations = ['resumen', 'pedidos', 'inventario', 'productos', 'categorias', 'banners', 'tallas', 'media'];
    const supervision = ['supervision', 'suscriptores', 'paginas', 'configuracion', 'usuarios', 'pedidos.eliminar'];
    const roles = {
        admin: new Set(operations),
        super_admin: new Set([...operations, ...supervision])
    };
    const tables = {
        products: ['productos', 'productos'], categories: ['categorias', 'categorias'],
        banners: ['banners', 'banners'], size_guide: ['tallas', 'tallas'],
        orders: ['pedidos', 'pedidos'], config: ['resumen', 'configuracion'],
        profiles: ['usuarios', 'usuarios'], pages: ['paginas', 'paginas'],
        subscribers: ['suscriptores', 'suscriptores'], panel_role_audit: ['supervision', undefined]
    };
    return Object.freeze({
        can(role, permission) { return roles[role]?.has(permission) === true; },
        home(role) { return role === 'super_admin' ? 'supervision' : 'resumen'; },
        forTable(table, operation) {
            if (table === 'orders' && operation === 'delete') return 'pedidos.eliminar';
            return tables[table]?.[operation === 'select' ? 0 : 1];
        }
    });
})();

// Conserva la API encadenada de supabase-js. Al ejecutar cada consulta se vuelve
// a validar identidad + perfil, incluso si el callback pertenece a una vista vieja.
// Las lecturas de sesión/perfil de AdminAuth usan el cliente original para evitar recursión.
const PanelData = {
    from(table) {
        let operation = 'select';
        const wrap = builder => new Proxy(builder, {
            get(target, key) {
                if (key === 'then') return (resolve, reject) => Promise.resolve().then(async () => {
                    const permission = AdminPermissions.forTable(table, operation);
                    try {
                        await Admin.requirePermission(permission);
                    } catch (error) {
                        return { data: null, count: null, error: { code: '42501', message: error.message } };
                    }
                    const epoch = Admin.accessEpoch || 0;
                    const result = await target;
                    if (epoch !== (Admin.accessEpoch || 0) || !Admin.can(permission)) {
                        return { data: null, count: null, error: { code: '42501', message: 'El acceso cambió durante la operación.' } };
                    }
                    return result;
                }).then(resolve, reject);
                const value = Reflect.get(target, key, target);
                if (typeof value !== 'function') return value;
                return (...args) => {
                    if (['insert', 'upsert', 'update', 'delete'].includes(key)) operation = key;
                    const result = value.apply(target, args);
                    return result && typeof result.then === 'function' ? wrap(result) : result;
                };
            }
        });
        return wrap(supabaseClient.from(table));
    }
};
