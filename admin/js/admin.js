// ============================================================
// PopFlame Admin - Auth + Panel logic
// Requiere que ../js/supabaseClient.js ya haya sido cargado.
// ============================================================

const AdminAuth = {
    async getActiveProfile() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return null;
        const { data: profile, error } = await supabaseClient
            .from('profiles').select('*').eq('id', session.user.id).single();
        if (error || !profile) return null;
        return profile;
    },

    async requireAuth() {
        const profile = await this.getActiveProfile();
        if (!profile) {
            window.location.href = 'index.html';
            return null;
        }
        return profile;
    },

    async login(username, password) {
        if (!username || !password) throw new Error('Ingresa usuario y contraseña');

        const { data: email, error: rpcErr } = await supabaseClient.rpc('email_for_username', { p_username: username });
        if (rpcErr) throw new Error('Error de conexión con el servidor');
        if (!email) throw new Error('Usuario no encontrado');

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Usuario o contraseña incorrectos');
    },

    async logout() {
        await supabaseClient.auth.signOut();
        window.location.href = 'index.html';
    }
};

// ============================================================
// Panel (solo se usa dentro de panel.html)
// ============================================================

const AdminPanel = {
    profile: null,
    products: [],
    categories: [],
    productImagesExisting: [],
    productImagesNewFiles: [],
    banners: [],

    async init(profile) {
        this.profile = profile;
        this.renderSidebar();
        this.bindModals();
        await this.switchTab('dashboard');
    },

    isSuperAdmin() {
        return this.profile.role === 'super_admin';
    },

    // ---------------- Sidebar & tabs ----------------

    renderSidebar() {
        document.getElementById('userName').textContent = this.profile.name || this.profile.username;
        document.getElementById('roleBadge').textContent = this.isSuperAdmin() ? 'Super Admin' : 'Admin';

        const superLinks = document.getElementById('superAdminLinks');
        superLinks.style.display = this.isSuperAdmin() ? 'block' : 'none';

        document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
            link.addEventListener('click', () => this.switchTab(link.dataset.tab));
        });

        document.getElementById('logoutBtn').addEventListener('click', () => AdminAuth.logout());
    },

    async switchTab(tab) {
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));

        const loaders = {
            dashboard: () => this.loadDashboard(),
            pedidos: () => this.loadOrders(),
            inventario: () => this.loadInventory(),
            productos: () => this.loadProducts(),
            categorias: () => this.loadCategories(),
            banners: () => this.loadBanners(),
            config: () => this.loadConfig(),
            usuarios: () => this.loadUsers()
        };
        if (loaders[tab]) await loaders[tab]();
    },

    toast(message, type = 'success') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    formatPrice(n) {
        return '$' + Number(n || 0).toLocaleString('es-CL');
    },

    // Igual que ProductsManager.resolveImagePath del sitio público, pero sin depender de él
    // (el panel no carga js/products.js, así que resuelve la ruta de forma independiente).
    resolveImagePath(path, prefix = '') {
        if (!path) return '';
        if (/^https?:\/\//i.test(path)) return path;
        return prefix + path;
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    },

    // Muestra la preview de logo/banner como <img> o <video> (loop, muteado) según el tipo de archivo
    setPreviewMedia(elId, url) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (!url) { el.style.display = 'none'; return; }

        const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(url);
        const wantsTag = isVideo ? 'VIDEO' : 'IMG';

        if (el.tagName !== wantsTag) {
            const replacement = document.createElement(isVideo ? 'video' : 'img');
            replacement.id = el.id;
            replacement.className = el.className;
            replacement.style.cssText = el.style.cssText;
            if (isVideo) {
                replacement.autoplay = true;
                replacement.loop = true;
                replacement.muted = true;
                replacement.playsInline = true;
            }
            el.replaceWith(replacement);
            replacement.src = url;
            replacement.style.display = 'block';
        } else {
            el.src = url;
            el.style.display = 'block';
        }
    },

    // Sube un archivo a un bucket público de Supabase Storage y devuelve la URL pública.
    async uploadImage(bucket, file) {
        if (!file) return null;
        const ext = file.name.split('.').pop();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabaseClient.storage.from(bucket).upload(path, file, { upsert: false });
        if (error) throw error;
        const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    },

    // ---------------- Dashboard ----------------

    async loadDashboard() {
        const container = document.getElementById('tab-dashboard');
        container.innerHTML = '<div class="loading">Cargando estadísticas...</div>';

        const [{ data: orders }, { data: products }] = await Promise.all([
            supabaseClient.from('orders').select('*').order('created_at', { ascending: false }),
            supabaseClient.from('products').select('*')
        ]);

        const allOrders = orders || [];
        const allProducts = products || [];

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const salesThisMonth = allOrders
            .filter(o => new Date(o.created_at) >= startOfMonth && o.status !== 'cancelled')
            .reduce((sum, o) => sum + Number(o.total), 0);

        const pendingCount = allOrders.filter(o => o.status === 'pending').length;
        const lowStock = allProducts.filter(p => p.stock <= 5);

        container.innerHTML = `
            <div class="page-header"><h1>Dashboard</h1></div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="label">Ventas del mes</div>
                    <div class="value">${this.formatPrice(salesThisMonth)}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Pedidos pendientes</div>
                    <div class="value ${pendingCount > 0 ? 'warning' : ''}">${pendingCount}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Total de pedidos</div>
                    <div class="value">${allOrders.length}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Productos con stock bajo</div>
                    <div class="value ${lowStock.length > 0 ? 'danger' : ''}">${lowStock.length}</div>
                </div>
            </div>
            <div class="card">
                <h3>Últimos pedidos</h3>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
                        <tbody>
                            ${allOrders.slice(0, 6).map(o => `
                                <tr>
                                    <td>${o.order_number}</td>
                                    <td>${this.escapeHtml(o.customer_name)}</td>
                                    <td>${this.formatPrice(o.total)}</td>
                                    <td><span class="badge ${o.status}">${o.status}</span></td>
                                    <td>${new Date(o.created_at).toLocaleDateString('es-CL')}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="5" class="empty-state">Sin pedidos todavía</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // ---------------- Pedidos ----------------

    async loadOrders() {
        const container = document.getElementById('tab-pedidos');
        container.innerHTML = '<div class="loading">Cargando pedidos...</div>';

        const { data: orders, error } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
        if (error) { container.innerHTML = `<div class="empty-state">Error cargando pedidos: ${error.message}</div>`; return; }

        const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        const canDelete = this.isSuperAdmin();

        container.innerHTML = `
            <div class="page-header"><h1>Pedidos</h1></div>
            ${this.isSuperAdmin() ? '<p style="font-size:12px;color:var(--admin-text-secondary);margin-bottom:16px;">Al marcar un pedido como "confirmed" pasa solo a "processing" (se considera ya en preparación). Despachado/entregado/cancelado siguen siendo manuales.</p>' : ''}
            <div class="card">
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Pedido</th><th>Cliente</th><th>Contacto</th><th>Total</th><th>Estado</th><th>Fecha</th>${canDelete ? '<th></th>' : ''}</tr></thead>
                        <tbody>
                            ${(orders || []).map(o => `
                                <tr>
                                    <td><strong>${o.order_number}</strong></td>
                                    <td>${this.escapeHtml(o.customer_name)}<br><span style="color:var(--admin-text-secondary)">${this.escapeHtml(o.customer_address)}, ${this.escapeHtml(o.customer_city)}</span></td>
                                    <td>${this.escapeHtml(o.customer_email)}<br>${this.escapeHtml(o.customer_phone)}</td>
                                    <td>${this.formatPrice(o.total)}</td>
                                    <td>
                                        <select class="status-select" data-order-id="${o.id}">
                                            ${statuses.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
                                        </select>
                                    </td>
                                    <td>${new Date(o.created_at).toLocaleString('es-CL')}</td>
                                    ${canDelete ? `<td><button class="btn btn-danger btn-sm delete-order-btn" data-id="${o.id}">Eliminar</button></td>` : ''}
                                </tr>
                            `).join('') || `<tr><td colspan="${canDelete ? 7 : 6}" class="empty-state">Sin pedidos todavía</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.querySelectorAll('.status-select').forEach(sel => {
            sel.addEventListener('change', async () => {
                const { error } = await supabaseClient.from('orders')
                    .update({ status: sel.value }).eq('id', sel.dataset.orderId);
                if (error) { this.toast('No se pudo actualizar el estado: ' + error.message, 'error'); return; }
                this.toast('Estado actualizado');
                await this.loadOrders(); // refleja el estado real (el trigger puede haberlo movido a "processing")
            });
        });

        container.querySelectorAll('.delete-order-btn').forEach(btn => {
            btn.addEventListener('click', () => this.deleteOrder(btn.dataset.id));
        });
    },

    async deleteOrder(id) {
        if (!confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return;
        const { error } = await supabaseClient.from('orders').delete().eq('id', id);
        if (error) { this.toast('No se pudo eliminar: ' + error.message, 'error'); return; }
        this.toast('Pedido eliminado');
        await this.loadOrders();
    },

    // ---------------- Inventario (admin y super_admin) ----------------

    async loadInventory() {
        const container = document.getElementById('tab-inventario');
        container.innerHTML = '<div class="loading">Cargando inventario...</div>';

        const { data: products, error } = await supabaseClient.from('products').select('*').order('name');
        if (error) { container.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }

        container.innerHTML = `
            <div class="page-header"><h1>Inventario</h1></div>
            <div class="card">
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Actualizar</th></tr></thead>
                        <tbody>
                            ${(products || []).map(p => `
                                <tr>
                                    <td>${this.escapeHtml(p.name)}</td>
                                    <td>${this.escapeHtml(p.category_id)}</td>
                                    <td>${this.formatPrice(p.price)}</td>
                                    <td>
                                        <span class="${p.stock <= 5 ? 'badge low-stock' : ''}">${p.stock}</span>
                                    </td>
                                    <td>
                                        <input type="text" inputmode="numeric" pattern="[0-9]*" value="${p.stock}" data-stock-id="${p.id}" style="width:80px;padding:6px 8px;border:1px solid var(--admin-border);border-radius:6px;">
                                        <button class="btn btn-secondary btn-sm save-stock-btn" data-stock-id="${p.id}">Guardar</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="5" class="empty-state">Sin productos</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.querySelectorAll('.save-stock-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.stockId;
                const input = container.querySelector(`input[data-stock-id="${id}"]`);
                const newStock = parseInt(input.value, 10);
                if (isNaN(newStock) || newStock < 0) { this.toast('Stock inválido', 'error'); return; }

                const { error } = await supabaseClient.from('products').update({ stock: newStock }).eq('id', id);
                if (error) { this.toast('No se pudo actualizar: ' + error.message, 'error'); }
                else { this.toast('Stock actualizado'); await this.loadInventory(); }
            });
        });
    },

    // ---------------- Productos (solo super_admin) ----------------

    async loadProducts() {
        if (!this.isSuperAdmin()) return;
        const container = document.getElementById('tab-productos');
        container.innerHTML = '<div class="loading">Cargando productos...</div>';

        const [{ data: products }, { data: categories }] = await Promise.all([
            supabaseClient.from('products').select('*').order('name'),
            supabaseClient.from('categories').select('*').order('sort_order')
        ]);
        this.products = products || [];
        this.categories = categories || [];
        this.selectedProductIds = new Set();

        container.innerHTML = `
            <div class="page-header">
                <h1>Productos</h1>
                <button class="btn btn-primary" id="newProductBtn">+ Nuevo producto</button>
            </div>
            <div class="card">
                <div class="toolbar" id="bulkToolbar" style="display:none;">
                    <span id="bulkCount"></span>
                    <button type="button" class="btn btn-secondary btn-sm" id="bulkEditBtn">Editar seleccionados</button>
                    <button type="button" class="btn btn-danger btn-sm" id="bulkDeleteBtn">Eliminar seleccionados</button>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th><input type="checkbox" id="selectAllProducts"></th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Destacado</th><th></th></tr></thead>
                        <tbody>
                            ${this.products.map(p => `
                                <tr>
                                    <td><input type="checkbox" class="product-select" data-id="${p.id}"></td>
                                    <td>${this.escapeHtml(p.name)}</td>
                                    <td>${this.escapeHtml(p.category_id)}</td>
                                    <td>${this.formatPrice(p.price)}</td>
                                    <td>${p.stock}</td>
                                    <td>${p.featured ? '✅' : '—'}</td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm edit-product-btn" data-id="${p.id}">Editar</button>
                                        <button class="btn btn-danger btn-sm delete-product-btn" data-id="${p.id}">Eliminar</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="7" class="empty-state">Sin productos. Crea el primero.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('newProductBtn').addEventListener('click', () => this.openProductModal());

        document.getElementById('selectAllProducts').addEventListener('change', (e) => {
            container.querySelectorAll('.product-select').forEach(cb => { cb.checked = e.target.checked; });
            this.syncProductSelection(container);
        });
        container.querySelectorAll('.product-select').forEach(cb => {
            cb.addEventListener('change', () => this.syncProductSelection(container));
        });
        document.getElementById('bulkDeleteBtn').addEventListener('click', () => this.bulkDeleteProducts());
        document.getElementById('bulkEditBtn').addEventListener('click', () => this.openBulkEditModal());

        container.querySelectorAll('.edit-product-btn').forEach(btn =>
            btn.addEventListener('click', () => this.openProductModal(btn.dataset.id)));
        container.querySelectorAll('.delete-product-btn').forEach(btn =>
            btn.addEventListener('click', () => this.deleteProduct(btn.dataset.id)));
    },

    openProductModal(id) {
        const product = id ? this.products.find(p => String(p.id) === String(id)) : null;
        const modal = document.getElementById('productModal');
        const form = document.getElementById('productForm');
        form.reset();
        document.getElementById('productModalTitle').textContent = product ? 'Editar producto' : 'Nuevo producto';
        document.getElementById('productId').value = product ? product.id : '';

        const catSelect = document.getElementById('productCategory');
        catSelect.innerHTML = this.categories.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');

        document.getElementById('productImageFile').value = '';
        document.getElementById('productImageUrlInput').value = '';
        this.productImagesExisting = product
            ? ((product.images && product.images.length) ? [...product.images] : (product.image ? [product.image] : []))
            : [];
        this.productImagesNewFiles = [];
        this.renderProductImagesGallery();

        if (product) {
            document.getElementById('productName').value = product.name;
            document.getElementById('productCategory').value = product.category_id;
            document.getElementById('productPrice').value = product.price;
            document.getElementById('productStock').value = product.stock;
            document.getElementById('productSizes').value = (product.sizes || []).join(', ');
            document.getElementById('productColors').value = (product.colors || []).join(', ');
            document.getElementById('productBadge').value = product.badge || '';
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productFeatured').checked = !!product.featured;
        }
        modal.classList.add('active');
    },

    // Dibuja las miniaturas de la galería (fotos existentes + nuevas seleccionadas aún no subidas)
    renderProductImagesGallery() {
        const container = document.getElementById('productImagesGallery');

        const existingThumbs = this.productImagesExisting.map((url, i) => `
            <div class="img-thumb">
                <img src="${this.resolveImagePath(url, '../')}">
                <button type="button" class="img-thumb-remove" data-kind="existing" data-index="${i}">×</button>
            </div>
        `).join('');

        const newThumbs = this.productImagesNewFiles.map((file, i) => `
            <div class="img-thumb">
                <img src="${URL.createObjectURL(file)}">
                <button type="button" class="img-thumb-remove" data-kind="new" data-index="${i}">×</button>
            </div>
        `).join('');

        container.innerHTML = (existingThumbs + newThumbs) || '<p class="img-gallery-empty">Sin fotos todavía</p>';

        container.querySelectorAll('.img-thumb-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                if (btn.dataset.kind === 'existing') this.productImagesExisting.splice(idx, 1);
                else this.productImagesNewFiles.splice(idx, 1);
                this.renderProductImagesGallery();
            });
        });
    },

    async saveProduct(e) {
        e.preventDefault();
        const id = document.getElementById('productId').value;
        const saveBtn = e.target.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
            const price = Number(document.getElementById('productPrice').value.trim());
            const stock = parseInt(document.getElementById('productStock').value.trim(), 10);
            if (!document.getElementById('productPrice').value.trim() || isNaN(price) || price < 0) {
                throw new Error('El precio debe ser un número válido');
            }
            if (!document.getElementById('productStock').value.trim() || isNaN(stock) || stock < 0) {
                throw new Error('El stock debe ser un número válido');
            }

            const uploadedUrls = [];
            for (const file of this.productImagesNewFiles) {
                uploadedUrls.push(await this.uploadImage('product-images', file));
            }
            const images = [...this.productImagesExisting, ...uploadedUrls];

            const payload = {
                name: document.getElementById('productName').value.trim(),
                category_id: document.getElementById('productCategory').value,
                price,
                stock,
                sizes: document.getElementById('productSizes').value.split(',').map(s => s.trim()).filter(Boolean),
                colors: document.getElementById('productColors').value.split(',').map(s => s.trim()).filter(Boolean),
                image: images[0] || null,
                images,
                badge: document.getElementById('productBadge').value.trim() || null,
                description: document.getElementById('productDescription').value.trim(),
                featured: document.getElementById('productFeatured').checked
            };

            const { error } = id
                ? await supabaseClient.from('products').update(payload).eq('id', id)
                : await supabaseClient.from('products').insert(payload);

            if (error) throw error;

            this.toast('Producto guardado');
            document.getElementById('productModal').classList.remove('active');
            await this.loadProducts();
        } catch (error) {
            this.toast('Error guardando producto: ' + error.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar';
        }
    },

    async deleteProduct(id) {
        if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
        const { error } = await supabaseClient.from('products').delete().eq('id', id);
        if (error) { this.toast('No se pudo eliminar: ' + error.message, 'error'); return; }
        this.toast('Producto eliminado');
        await this.loadProducts();
    },

    // ---------------- Selección múltiple / acciones en lote ----------------

    syncProductSelection(container) {
        this.selectedProductIds = new Set(
            Array.from(container.querySelectorAll('.product-select:checked')).map(cb => cb.dataset.id)
        );
        const count = this.selectedProductIds.size;
        const toolbar = document.getElementById('bulkToolbar');
        toolbar.style.display = count > 0 ? 'flex' : 'none';
        document.getElementById('bulkCount').textContent = `${count} seleccionado${count === 1 ? '' : 's'}`;
    },

    async bulkDeleteProducts() {
        const ids = Array.from(this.selectedProductIds);
        if (ids.length === 0) return;
        if (!confirm(`¿Eliminar ${ids.length} producto(s)? Esta acción no se puede deshacer.`)) return;

        const { error } = await supabaseClient.from('products').delete().in('id', ids);
        if (error) { this.toast('No se pudo eliminar: ' + error.message, 'error'); return; }
        this.toast(`${ids.length} producto(s) eliminado(s)`);
        await this.loadProducts();
    },

    openBulkEditModal() {
        if (this.selectedProductIds.size === 0) return;
        document.getElementById('bulkEditCount').textContent = this.selectedProductIds.size;
        document.getElementById('bulkEditForm').reset();

        const catSelect = document.getElementById('bulkCategory');
        catSelect.innerHTML = '<option value="">— Sin cambios —</option>' +
            this.categories.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');

        document.getElementById('bulkEditModal').classList.add('active');
    },

    async applyBulkEdit(e) {
        e.preventDefault();
        const ids = Array.from(this.selectedProductIds);
        if (ids.length === 0) return;

        const category = document.getElementById('bulkCategory').value;
        const featured = document.getElementById('bulkFeatured').value;
        const stockRaw = document.getElementById('bulkStock').value.trim();

        const payload = {};
        if (category) payload.category_id = category;
        if (featured) payload.featured = featured === 'true';
        if (stockRaw) {
            const stock = parseInt(stockRaw, 10);
            if (isNaN(stock) || stock < 0) { this.toast('Stock inválido', 'error'); return; }
            payload.stock = stock;
        }

        if (Object.keys(payload).length === 0) {
            this.toast('No cambiaste ningún campo', 'error');
            return;
        }

        const { error } = await supabaseClient.from('products').update(payload).in('id', ids);
        if (error) { this.toast('Error aplicando cambios: ' + error.message, 'error'); return; }

        this.toast(`${ids.length} producto(s) actualizado(s)`);
        document.getElementById('bulkEditModal').classList.remove('active');
        await this.loadProducts();
    },

    // ---------------- Categorías (solo super_admin) ----------------

    async loadCategories() {
        if (!this.isSuperAdmin()) return;
        const container = document.getElementById('tab-categorias');
        container.innerHTML = '<div class="loading">Cargando categorías...</div>';

        const { data: categories } = await supabaseClient.from('categories').select('*').order('sort_order');
        this.categories = categories || [];

        container.innerHTML = `
            <div class="page-header">
                <h1>Categorías</h1>
                <button class="btn btn-primary" id="newCategoryBtn">+ Nueva categoría</button>
            </div>
            <div class="card">
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>ID</th><th>Nombre</th><th>Descripción</th><th>Orden</th><th></th></tr></thead>
                        <tbody>
                            ${this.categories.map(c => `
                                <tr>
                                    <td>${this.escapeHtml(c.id)}</td>
                                    <td>${this.escapeHtml(c.name)}</td>
                                    <td>${this.escapeHtml(c.description || '')}</td>
                                    <td>${c.sort_order}</td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm edit-cat-btn" data-id="${c.id}">Editar</button>
                                        <button class="btn btn-danger btn-sm delete-cat-btn" data-id="${c.id}">Eliminar</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="5" class="empty-state">Sin categorías</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('newCategoryBtn').addEventListener('click', () => this.openCategoryModal());
        container.querySelectorAll('.edit-cat-btn').forEach(btn =>
            btn.addEventListener('click', () => this.openCategoryModal(btn.dataset.id)));
        container.querySelectorAll('.delete-cat-btn').forEach(btn =>
            btn.addEventListener('click', () => this.deleteCategory(btn.dataset.id)));
    },

    openCategoryModal(id) {
        const category = id ? this.categories.find(c => c.id === id) : null;
        document.getElementById('categoryForm').reset();
        document.getElementById('categoryModalTitle').textContent = category ? 'Editar categoría' : 'Nueva categoría';
        document.getElementById('categoryIdOriginal').value = category ? category.id : '';
        document.getElementById('categoryId').value = category ? category.id : '';
        document.getElementById('categoryId').disabled = !!category;
        document.getElementById('categoryName').value = category ? category.name : '';
        document.getElementById('categoryDescription').value = category ? (category.description || '') : '';
        document.getElementById('categorySortOrder').value = category ? category.sort_order : (this.categories.length + 1);
        document.getElementById('categoryModal').classList.add('active');
    },

    async saveCategory(e) {
        e.preventDefault();
        const originalId = document.getElementById('categoryIdOriginal').value;
        const payload = {
            id: document.getElementById('categoryId').value.trim().toLowerCase(),
            name: document.getElementById('categoryName').value.trim(),
            description: document.getElementById('categoryDescription').value.trim(),
            sort_order: parseInt(document.getElementById('categorySortOrder').value, 10) || 0
        };

        const { error } = originalId
            ? await supabaseClient.from('categories').update(payload).eq('id', originalId)
            : await supabaseClient.from('categories').insert(payload);

        if (error) { this.toast('Error guardando categoría: ' + error.message, 'error'); return; }

        this.toast('Categoría guardada');
        document.getElementById('categoryModal').classList.remove('active');
        await this.loadCategories();
    },

    async deleteCategory(id) {
        if (!confirm('¿Eliminar esta categoría? Falla si aún tiene productos asociados.')) return;
        const { error } = await supabaseClient.from('categories').delete().eq('id', id);
        if (error) { this.toast('No se pudo eliminar: ' + error.message, 'error'); return; }
        this.toast('Categoría eliminada');
        await this.loadCategories();
    },

    // ---------------- Banners del hero (solo super_admin) ----------------

    async loadBanners() {
        if (!this.isSuperAdmin()) return;
        const container = document.getElementById('tab-banners');
        container.innerHTML = '<div class="loading">Cargando banners...</div>';

        const { data: banners, error } = await supabaseClient.from('banners').select('*').order('sort_order');
        if (error) { container.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }
        this.banners = banners || [];

        container.innerHTML = `
            <div class="page-header">
                <h1>Banners del hero</h1>
                <button class="btn btn-primary" id="newBannerBtn">+ Nuevo banner</button>
            </div>
            <p style="font-size:12px;color:var(--admin-text-secondary);margin-bottom:16px;">
                Si no hay ningún banner activo, la portada muestra el banner único de Configuración. Con uno o más banners activos, la portada se convierte en un carrusel navegable.
            </p>
            <div class="card">
                <div class="table-wrap">
                    <table>
                        <thead><tr><th></th><th>Título</th><th>Orden</th><th>Activo</th><th></th></tr></thead>
                        <tbody>
                            ${this.banners.map(b => `
                                <tr>
                                    <td><img src="${this.resolveImagePath(b.media_url)}" style="width:60px;height:40px;object-fit:cover;border-radius:4px;" onerror="this.style.opacity=0.3"></td>
                                    <td>${this.escapeHtml(b.title || '(sin título)')}</td>
                                    <td>${b.sort_order}</td>
                                    <td>${b.active ? '✅' : '—'}</td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm edit-banner-btn" data-id="${b.id}">Editar</button>
                                        <button class="btn btn-danger btn-sm delete-banner-btn" data-id="${b.id}">Eliminar</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="5" class="empty-state">Sin banners todavía. La portada usa el hero único de Configuración.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('newBannerBtn').addEventListener('click', () => this.openBannerModal());
        container.querySelectorAll('.edit-banner-btn').forEach(btn =>
            btn.addEventListener('click', () => this.openBannerModal(btn.dataset.id)));
        container.querySelectorAll('.delete-banner-btn').forEach(btn =>
            btn.addEventListener('click', () => this.deleteBanner(btn.dataset.id)));
    },

    openBannerModal(id) {
        const banner = id ? this.banners.find(b => String(b.id) === String(id)) : null;
        document.getElementById('bannerForm').reset();
        document.getElementById('bannerModalTitle').textContent = banner ? 'Editar banner' : 'Nuevo banner';
        document.getElementById('bannerId').value = banner ? banner.id : '';
        document.getElementById('bannerFile').value = '';

        if (banner) {
            document.getElementById('bannerMediaUrl').value = banner.media_url || '';
            document.getElementById('bannerTitle').value = banner.title || '';
            document.getElementById('bannerSubtitle').value = banner.subtitle || '';
            document.getElementById('bannerLink').value = banner.link_url || '';
            document.getElementById('bannerSortOrder').value = banner.sort_order;
            document.getElementById('bannerActive').checked = !!banner.active;
        } else {
            document.getElementById('bannerSortOrder').value = this.banners.length + 1;
            document.getElementById('bannerActive').checked = true;
        }
        this.showBannerPreview(banner ? banner.media_url : '');
        document.getElementById('bannerModal').classList.add('active');
    },

    showBannerPreview(url, forceVideo) {
        const img = document.getElementById('bannerImagePreview');
        const video = document.getElementById('bannerVideoPreview');
        img.style.display = 'none';
        video.style.display = 'none';
        if (!url) return;
        if (forceVideo || /\.(mp4|webm|mov)(\?.*)?$/i.test(url)) {
            video.src = url;
            video.style.display = 'block';
        } else {
            img.src = this.resolveImagePath(url);
            img.style.display = 'block';
        }
    },

    async saveBanner(e) {
        e.preventDefault();
        const id = document.getElementById('bannerId').value;
        const saveBtn = e.target.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
            let mediaUrl = document.getElementById('bannerMediaUrl').value.trim();
            const file = document.getElementById('bannerFile').files[0];
            if (file) {
                mediaUrl = await this.uploadImage('site-assets', file);
            }
            if (!mediaUrl) throw new Error('Sube una imagen/video o pega una URL');

            const sortOrderRaw = document.getElementById('bannerSortOrder').value.trim();
            const sortOrder = sortOrderRaw ? parseInt(sortOrderRaw, 10) : 0;
            if (isNaN(sortOrder)) throw new Error('El orden debe ser un número');

            const payload = {
                media_url: mediaUrl,
                title: document.getElementById('bannerTitle').value.trim() || null,
                subtitle: document.getElementById('bannerSubtitle').value.trim() || null,
                link_url: document.getElementById('bannerLink').value.trim() || null,
                sort_order: sortOrder,
                active: document.getElementById('bannerActive').checked
            };

            const { error } = id
                ? await supabaseClient.from('banners').update(payload).eq('id', id)
                : await supabaseClient.from('banners').insert(payload);

            if (error) throw error;

            this.toast('Banner guardado');
            document.getElementById('bannerModal').classList.remove('active');
            await this.loadBanners();
        } catch (error) {
            this.toast('Error guardando banner: ' + error.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar';
        }
    },

    async deleteBanner(id) {
        if (!confirm('¿Eliminar este banner?')) return;
        const { error } = await supabaseClient.from('banners').delete().eq('id', id);
        if (error) { this.toast('No se pudo eliminar: ' + error.message, 'error'); return; }
        this.toast('Banner eliminado');
        await this.loadBanners();
    },

    // ---------------- Configuración (solo super_admin) ----------------

    async loadConfig() {
        if (!this.isSuperAdmin()) return;
        const container = document.getElementById('tab-config');
        container.innerHTML = '<div class="loading">Cargando configuración...</div>';

        const { data: cfg } = await supabaseClient.from('config').select('*').eq('id', 1).maybeSingle();

        container.innerHTML = `
            <div class="page-header"><h1>Configuración</h1></div>

            <div class="card">
                <h3>Imágenes de marca</h3>
                <div class="form-row-2" style="grid-template-columns: repeat(3, 1fr);">
                    <div class="field">
                        <label>Logo</label>
                        <img id="previewLogo" src="${cfg?.logo_url ? this.escapeHtml(cfg.logo_url) : ''}" style="display:${cfg?.logo_url ? 'block' : 'none'};max-height:60px;margin-bottom:8px;">
                        <input type="file" id="fileLogo" accept="image/*,video/mp4,video/webm,video/quicktime">
                        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" data-asset-upload="logo_url" data-asset-input="fileLogo" data-asset-preview="previewLogo">Subir logo</button>
                    </div>
                    <div class="field">
                        <label>Logo blanco (footer)</label>
                        <img id="previewLogoWhite" src="${cfg?.logo_white_url ? this.escapeHtml(cfg.logo_white_url) : ''}" style="display:${cfg?.logo_white_url ? 'block' : 'none'};max-height:60px;margin-bottom:8px;background:#222;padding:4px;">
                        <input type="file" id="fileLogoWhite" accept="image/*,video/mp4,video/webm,video/quicktime">
                        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" data-asset-upload="logo_white_url" data-asset-input="fileLogoWhite" data-asset-preview="previewLogoWhite">Subir logo blanco</button>
                    </div>
                    <div class="field">
                        <label>Banner del hero</label>
                        <img id="previewHero" src="${cfg?.hero_banner_url ? this.escapeHtml(cfg.hero_banner_url) : ''}" style="display:${cfg?.hero_banner_url ? 'block' : 'none'};max-height:60px;margin-bottom:8px;">
                        <input type="file" id="fileHero" accept="image/*,video/mp4,video/webm,video/quicktime">
                        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" data-asset-upload="hero_banner_url" data-asset-input="fileHero" data-asset-preview="previewHero">Subir banner</button>
                    </div>
                </div>
            </div>

            <div class="card">
                <form id="configForm">
                    <div class="form-row-2">
                        <div class="field">
                            <label>Nombre de la tienda</label>
                            <input type="text" id="cfgStoreName" value="${this.escapeHtml(cfg?.store_name || '')}" required>
                        </div>
                        <div class="field">
                            <label>WhatsApp de ventas (569XXXXXXXX)</label>
                            <input type="text" id="cfgWhatsapp" value="${this.escapeHtml(cfg?.whatsapp_number || '')}" placeholder="569XXXXXXXX">
                        </div>
                    </div>
                    <div class="form-row-2">
                        <div class="field">
                            <label>Costo de envío</label>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="cfgShipping" value="${cfg?.shipping_cost ?? 5990}" required>
                        </div>
                        <div class="field">
                            <label>Envío gratis desde</label>
                            <input type="text" inputmode="numeric" pattern="[0-9]*" id="cfgFreeMin" value="${cfg?.free_shipping_min ?? 50000}" required>
                        </div>
                    </div>
                    <div class="form-row-2">
                        <div class="field">
                            <label>Título del hero</label>
                            <input type="text" id="cfgHeroTitle" value="${this.escapeHtml(cfg?.hero_title || '')}">
                        </div>
                        <div class="field">
                            <label>Subtítulo del hero</label>
                            <input type="text" id="cfgHeroSubtitle" value="${this.escapeHtml(cfg?.hero_subtitle || '')}">
                        </div>
                    </div>
                    <div class="form-row-2">
                        <div class="field">
                            <label>Instagram (URL)</label>
                            <input type="text" id="cfgInstagram" value="${this.escapeHtml(cfg?.social_instagram || '')}">
                        </div>
                        <div class="field">
                            <label>TikTok (URL)</label>
                            <input type="text" id="cfgTiktok" value="${this.escapeHtml(cfg?.social_tiktok || '')}">
                        </div>
                    </div>
                    <div class="field">
                        <label>Twitter / X (URL)</label>
                        <input type="text" id="cfgTwitter" value="${this.escapeHtml(cfg?.social_twitter || '')}">
                    </div>
                    <button type="submit" class="btn btn-primary">Guardar configuración</button>
                </form>
            </div>
        `;

        this.setPreviewMedia('previewLogo', cfg?.logo_url);
        this.setPreviewMedia('previewLogoWhite', cfg?.logo_white_url);
        this.setPreviewMedia('previewHero', cfg?.hero_banner_url);

        container.querySelectorAll('[data-asset-upload]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const column = btn.dataset.assetUpload;
                const input = document.getElementById(btn.dataset.assetInput);
                const file = input.files[0];
                if (!file) { this.toast('Elige un archivo primero', 'error'); return; }

                btn.disabled = true;
                btn.textContent = 'Subiendo...';
                try {
                    const url = await this.uploadImage('site-assets', file);
                    const { error } = await supabaseClient.from('config').update({ [column]: url }).eq('id', 1);
                    if (error) throw error;
                    this.setPreviewMedia(btn.dataset.assetPreview, url);
                    this.toast('Imagen/video actualizado. Recarga el sitio para verlo aplicado.');
                } catch (error) {
                    this.toast('Error subiendo imagen: ' + error.message, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = btn.dataset.assetUpload === 'logo_url' ? 'Subir logo'
                        : btn.dataset.assetUpload === 'logo_white_url' ? 'Subir logo blanco' : 'Subir banner';
                }
            });
        });

        document.getElementById('configForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const shippingCost = Number(document.getElementById('cfgShipping').value.trim());
            const freeMin = Number(document.getElementById('cfgFreeMin').value.trim());
            if (isNaN(shippingCost) || shippingCost < 0 || isNaN(freeMin) || freeMin < 0) {
                this.toast('Costo de envío y envío gratis deben ser números válidos', 'error');
                return;
            }
            const payload = {
                store_name: document.getElementById('cfgStoreName').value.trim(),
                whatsapp_number: document.getElementById('cfgWhatsapp').value.trim() || null,
                shipping_cost: shippingCost,
                free_shipping_min: freeMin,
                hero_title: document.getElementById('cfgHeroTitle').value.trim(),
                hero_subtitle: document.getElementById('cfgHeroSubtitle').value.trim(),
                social_instagram: document.getElementById('cfgInstagram').value.trim() || null,
                social_tiktok: document.getElementById('cfgTiktok').value.trim() || null,
                social_twitter: document.getElementById('cfgTwitter').value.trim() || null
            };
            const { error } = await supabaseClient.from('config').update(payload).eq('id', 1);
            if (error) { this.toast('Error guardando: ' + error.message, 'error'); return; }
            this.toast('Configuración guardada');
        });
    },

    // ---------------- Usuarios (solo super_admin) ----------------

    async loadUsers() {
        if (!this.isSuperAdmin()) return;
        const container = document.getElementById('tab-usuarios');
        container.innerHTML = '<div class="loading">Cargando usuarios...</div>';

        const { data: users, error } = await supabaseClient.from('profiles').select('*').order('created_at');
        if (error) { container.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }

        container.innerHTML = `
            <div class="page-header"><h1>Usuarios</h1></div>
            <div class="card">
                <p style="color:var(--admin-text-secondary);margin-bottom:16px;font-size:13px;">
                    Para crear una cuenta nueva, agrégala en Supabase Dashboard &gt; Authentication &gt; Users.
                    Aquí puedes ajustar el nombre visible y el rol de las cuentas existentes.
                </p>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Creado</th><th></th></tr></thead>
                        <tbody>
                            ${(users || []).map(u => `
                                <tr>
                                    <td>${this.escapeHtml(u.username)}</td>
                                    <td><input type="text" value="${this.escapeHtml(u.name || '')}" data-name-id="${u.id}" style="padding:6px 8px;border:1px solid var(--admin-border);border-radius:6px;"></td>
                                    <td>
                                        <select class="status-select" data-role-id="${u.id}" ${u.id === this.profile.id ? 'disabled' : ''}>
                                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                                            <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>super_admin</option>
                                        </select>
                                    </td>
                                    <td>${new Date(u.created_at).toLocaleDateString('es-CL')}</td>
                                    <td><button class="btn btn-secondary btn-sm save-user-btn" data-id="${u.id}">Guardar</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.querySelectorAll('.save-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const name = container.querySelector(`input[data-name-id="${id}"]`).value.trim();
                const roleSelect = container.querySelector(`select[data-role-id="${id}"]`);
                const role = roleSelect.value;

                const { error } = await supabaseClient.from('profiles').update({ name, role }).eq('id', id);
                if (error) { this.toast('No se pudo actualizar: ' + error.message, 'error'); }
                else { this.toast('Usuario actualizado'); }
            });
        });
    },

    // ---------------- Modales: bind ----------------

    bindModals() {
        document.getElementById('productForm').addEventListener('submit', (e) => this.saveProduct(e));
        document.getElementById('categoryForm').addEventListener('submit', (e) => this.saveCategory(e));
        document.getElementById('bulkEditForm').addEventListener('submit', (e) => this.applyBulkEdit(e));
        document.getElementById('bannerForm').addEventListener('submit', (e) => this.saveBanner(e));

        document.getElementById('bannerFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.showBannerPreview(URL.createObjectURL(file), file.type.startsWith('video/'));
        });

        document.getElementById('productImageFile').addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            this.productImagesNewFiles.push(...files);
            e.target.value = '';
            this.renderProductImagesGallery();
        });

        document.getElementById('addImageUrlBtn').addEventListener('click', () => {
            const input = document.getElementById('productImageUrlInput');
            const url = input.value.trim();
            if (!url) return;
            this.productImagesExisting.push(url);
            input.value = '';
            this.renderProductImagesGallery();
        });

        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById(btn.dataset.closeModal).classList.remove('active');
            });
        });
    }
};
