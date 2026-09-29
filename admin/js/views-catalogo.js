// ============================================================
// Panel · Catálogo: Productos, Categorías, Banners y Guía de tallas
// ============================================================

const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Única'];
const COLOR_PRESETS = ['Negro', 'Blanco', 'Gris', 'Azul', 'Rojo', 'Beige', 'Café', 'Verde militar', 'Plateado', 'Dorado'];
const BADGE_PRESETS = ['Nuevo', 'Popular', 'Edición limitada', 'Oferta', 'Últimas unidades'];

// Chips seleccionables (tallas / colores) + campo para agregar valores propios
const ChipPicker = {
    render(id, presets, selected, { swatch = false } = {}) {
        const all = [...presets, ...selected.filter(s => !presets.some(p => p.toLowerCase() === s.toLowerCase()))];
        return `
            <div class="chips" id="${id}" data-picker>
                ${all.map(v => this.chip(v, selected.some(s => s.toLowerCase() === v.toLowerCase()), swatch)).join('')}
                <span class="chip-add"><input type="text" placeholder="Otra…" aria-label="Agregar otra opción" data-add-input><button type="button" data-add>Agregar</button></span>
            </div>`;
    },
    chip(v, on, swatch) {
        return `<button type="button" class="chip${on ? ' is-active' : ''}" data-value="${U.esc(v)}" aria-pressed="${on}">${swatch ? `<span class="dot" style="background:${U.swatch(v)}"></span>` : ''}${U.esc(v)}</button>`;
    },
    bind(root, { swatch = false, onChange } = {}) {
        root.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip[data-value]');
            if (chip) {
                chip.classList.toggle('is-active');
                chip.setAttribute('aria-pressed', chip.classList.contains('is-active'));
                onChange && onChange();
                return;
            }
            if (e.target.closest('[data-add]')) this.add(root, swatch, onChange);
        });
        root.querySelector('[data-add-input]').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.add(root, swatch, onChange); }
        });
    },
    add(root, swatch, onChange) {
        const input = root.querySelector('[data-add-input]');
        const v = input.value.trim();
        if (!v) return;
        const existing = [...root.querySelectorAll('.chip[data-value]')].find(c => c.dataset.value.toLowerCase() === v.toLowerCase());
        if (existing) existing.classList.add('is-active');
        else root.querySelector('.chip-add').insertAdjacentHTML('beforebegin', this.chip(v, true, swatch));
        input.value = '';
        onChange && onChange();
    },
    values(root) { return [...root.querySelectorAll('.chip.is-active[data-value]')].map(c => c.dataset.value); }
};

// ---------------- Productos ----------------
Views.productos = {
    products: [],
    query: '',
    cat: '',
    selected: new Set(),

    async render(view) {
        Admin.header('Productos', 'Crea, edita y organiza el catálogo de la tienda.',
            `<button class="btn btn-dark keep-label" id="newProduct">${ICON.plus}<span>Nuevo producto</span></button>`);
        const [{ data, error }, cats] = await Promise.all([
            supabaseClient.from('products').select('*').order('id', { ascending: false }),
            Data.categoriesList(true)
        ]);
        if (error) throw error;
        this.products = data || [];
        this.selected = new Set();

        view.innerHTML = `
            <div class="toolbar">
                <label class="search">${ICON.search}<input type="search" id="prodSearch" placeholder="Buscar producto" value="${U.esc(this.query)}"></label>
                <select class="select-sm" id="prodCat" aria-label="Filtrar por categoría">
                    <option value="">Todas las categorías</option>
                    ${cats.map(c => `<option value="${U.esc(c.id)}" ${this.cat === c.id ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}
                </select>
            </div>
            <div id="bulkbar"></div>
            <div class="card" id="prodCard"></div>`;

        document.getElementById('newProduct').addEventListener('click', () => this.edit());
        document.getElementById('prodSearch').addEventListener('input', U.debounce(e => { this.query = e.target.value; this.renderList(); }, 150));
        document.getElementById('prodCat').addEventListener('change', e => { this.cat = e.target.value; this.renderList(); });
        const card = document.getElementById('prodCard');
        card.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (act) {
                e.stopPropagation();
                const p = this.products.find(x => x.id === +act.dataset.id);
                if (act.dataset.act === 'dup') this.duplicate(p);
                if (act.dataset.act === 'del') this.remove([p]);
                return;
            }
            if (e.target.closest('.check')) return;
            const row = e.target.closest('[data-product]');
            if (row) this.edit(this.products.find(x => x.id === +row.dataset.product));
        });
        card.addEventListener('change', (e) => {
            if (e.target.id === 'checkAll') {
                this.visible().forEach(p => e.target.checked ? this.selected.add(p.id) : this.selected.delete(p.id));
                this.renderList();
            } else if (e.target.dataset.select) {
                const id = +e.target.dataset.select;
                e.target.checked ? this.selected.add(id) : this.selected.delete(id);
                this.renderBulk();
            }
        });
        this.renderList();
    },

    visible() {
        const q = U.normalize(this.query);
        return this.products.filter(p => (!this.cat || p.category_id === this.cat) && (!q || U.normalize(p.name + ' ' + (p.description || '')).includes(q)));
    },

    renderList() {
        const list = this.visible();
        const card = document.getElementById('prodCard');
        this.renderBulk();
        if (!list.length) {
            card.innerHTML = this.products.length
                ? U.empty('search', 'Sin resultados', 'Ningún producto coincide con la búsqueda.')
                : U.empty('shirt', 'Aún no hay productos', 'Crea el primero y aparecerá en la tienda al instante.', `<button class="btn btn-dark" onclick="Views.productos.edit()">${ICON.plus}Nuevo producto</button>`);
            return;
        }
        const allOn = list.every(p => this.selected.has(p.id));
        card.innerHTML = `
            <div class="table-wrap"><table class="table responsive">
                <thead><tr>
                    <th class="w-check"><label class="check"><input type="checkbox" id="checkAll" ${allOn ? 'checked' : ''} aria-label="Seleccionar todos"></label></th>
                    <th>Producto</th><th class="num">Precio</th><th class="num">Stock</th><th>Tallas</th><th></th>
                </tr></thead>
                <tbody>${list.map(p => `
                    <tr class="is-clickable" data-product="${p.id}">
                        <td class="w-check"><label class="check"><input type="checkbox" data-select="${p.id}" ${this.selected.has(p.id) ? 'checked' : ''} aria-label="Seleccionar ${U.esc(p.name)}"></label></td>
                        <td class="cell-primary"><div class="cell-main">
                            <img class="thumb" src="${U.img(p.image)}" alt="" loading="lazy">
                            <div><strong>${U.esc(p.name)} ${p.featured ? `<span class="pill dark no-dot" title="Destacado" style="height:18px;padding:0 6px;font-size:10px">★ Destacado</span>` : ''}</strong>
                            <small>${U.esc(Data.catName(p.category_id))}${p.badge ? ` · ${U.esc(p.badge)}` : ''}</small></div>
                        </div></td>
                        <td data-label="Precio" class="num strong">${U.money(p.price)}</td>
                        <td data-label="Stock" class="num"><span class="${p.stock <= 0 ? 'red strong' : p.stock <= LOW_STOCK ? 'strong' : ''}">${p.stock <= 0 ? 'Agotado' : p.stock}</span></td>
                        <td data-label="Tallas"><span class="muted">${U.esc((p.sizes || []).join(', ') || '—')}</span></td>
                        <td class="actions">
                            <a class="icon-btn" href="../pages/producto.html?id=${p.id}" target="_blank" rel="noopener" title="Ver en la tienda" onclick="event.stopPropagation()">${ICON.external}</a>
                            <button class="icon-btn" data-act="dup" data-id="${p.id}" title="Duplicar">${ICON.copy}</button>
                            <button class="icon-btn is-danger" data-act="del" data-id="${p.id}" title="Eliminar">${ICON.trash}</button>
                        </td>
                    </tr>`).join('')}</tbody>
            </table></div>`;
    },

    renderBulk() {
        const box = document.getElementById('bulkbar');
        const n = this.selected.size;
        if (!n) { box.innerHTML = ''; return; }
        box.innerHTML = `
            <div class="bulkbar">
                <span>${n} seleccionado${n === 1 ? '' : 's'}</span>
                <div class="spacer"></div>
                <button class="btn btn-ghost btn-sm" id="bulkEdit">${ICON.edit}Editar en lote</button>
                <button class="btn btn-red btn-sm" id="bulkDel">${ICON.trash}Eliminar</button>
                <button class="icon-btn" id="bulkClear" style="color:#fff" aria-label="Quitar selección">${ICON.close}</button>
            </div>`;
        document.getElementById('bulkEdit').onclick = () => this.bulkEdit();
        document.getElementById('bulkDel').onclick = () => this.remove(this.products.filter(p => this.selected.has(p.id)));
        document.getElementById('bulkClear').onclick = () => { this.selected.clear(); this.renderList(); };
    },

    // ---- Editor ----
    photos: [],   // [{ url } | { file, preview }]

    edit(p = null, copyFrom = null) {
        const src = p || copyFrom || {};
        const cats = Data.categories || [];
        if (!cats.length) {
            UI.toast(Admin.isSuper() ? 'Primero crea una categoría en Categorías' : 'Pide a un Super Admin que cree una categoría primero', 'error');
            return;
        }
        this.photos = (src.images && src.images.length ? src.images : (src.image ? [src.image] : [])).map(url => ({ url }));
        const sizes = src.sizes || [];
        const colors = src.colors || [];
        const badgeCustom = src.badge && !BADGE_PRESETS.includes(src.badge);

        const body = `
            <form id="productForm" novalidate>
                <div class="sheet-section">
                    <h3>Fotos</h3>
                    <div class="photos" id="photos"></div>
                    <input type="file" id="photoFiles" accept="image/*" multiple hidden>
                    <p class="muted mt-8">La primera foto es la principal (la que se ve en el catálogo). Usa las flechas para cambiar el orden. Se comprimen solas al subir.</p>
                    <div class="row mt-8">
                        <input class="input" id="photoUrl" placeholder="…o pega el link de una imagen" style="height:36px;font-size:14px">
                        <button type="button" class="btn btn-ghost btn-sm" id="photoUrlAdd">Agregar</button>
                    </div>
                </div>

                <div class="sheet-section">
                    <h3>Información</h3>
                    <div class="field"><label for="pName">Nombre</label><input id="pName" name="name" maxlength="80" value="${U.esc(copyFrom ? src.name + ' (copia)' : src.name || '')}" required><span class="error" data-err="name"></span></div>
                    <div class="form-grid">
                        <div class="field"><label for="pCat">Categoría</label>
                            <select id="pCat" name="category">${cats.map(c => `<option value="${U.esc(c.id)}" ${src.category_id === c.id ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select>
                        </div>
                        <div class="field"><label for="pPrice">Precio</label>
                            <div class="input-group"><span class="prefix">$</span><input id="pPrice" name="price" inputmode="numeric" value="${src.price ? Number(src.price).toLocaleString('es-CL') : ''}" placeholder="29.990"></div>
                            <span class="error" data-err="price"></span>
                        </div>
                        <div class="field"><label for="pStock">Stock disponible</label><input id="pStock" name="stock" type="number" inputmode="numeric" min="0" value="${src.stock ?? ''}" placeholder="10"><span class="error" data-err="stock"></span></div>
                        <div class="field"><label for="pBadge">Etiqueta en la foto</label>
                            <select id="pBadge" name="badge">
                                <option value="">Sin etiqueta</option>
                                ${BADGE_PRESETS.map(b => `<option ${src.badge === b ? 'selected' : ''}>${b}</option>`).join('')}
                                <option value="__custom" ${badgeCustom ? 'selected' : ''}>Otra…</option>
                            </select>
                            <input id="pBadgeCustom" name="badgeCustom" placeholder="Texto de la etiqueta" maxlength="24" value="${badgeCustom ? U.esc(src.badge) : ''}" ${badgeCustom ? '' : 'hidden'} style="margin-top:6px">
                        </div>
                    </div>
                    <div class="field"><label for="pDesc">Descripción</label>
                        <textarea id="pDesc" name="description" maxlength="1200" rows="4" placeholder="Material, corte, detalles del diseño…">${U.esc(src.description || '')}</textarea>
                        <span class="hint" id="descCount"></span>
                    </div>
                </div>

                <div class="sheet-section">
                    <h3>Tallas</h3>
                    ${ChipPicker.render('pSizes', SIZE_PRESETS, sizes)}
                    <p class="muted mt-8">Para accesorios usa solo "Única".</p>
                </div>
                <div class="sheet-section">
                    <h3>Colores</h3>
                    ${ChipPicker.render('pColors', COLOR_PRESETS, colors, { swatch: true })}
                </div>

                <div class="sheet-section">
                    <h3>Visibilidad</h3>
                    <label class="switch"><input type="checkbox" id="pFeatured" name="featured" ${src.featured ? 'checked' : ''}><span class="track"></span>Destacar en la portada y en "Destacados"</label>
                </div>
            </form>`;

        const foot = `
            ${p ? `<button class="btn btn-danger" id="pDelete">${ICON.trash}<span>Eliminar</span></button>
                   <a class="btn btn-ghost" href="../pages/producto.html?id=${p.id}" target="_blank" rel="noopener">${ICON.external}<span>Ver</span></a>` : ''}
            <div class="spacer"></div>
            <button class="btn btn-ghost" data-sheet-close>Cancelar</button>
            <button class="btn btn-dark" id="pSave">${p ? 'Guardar cambios' : 'Crear producto'}</button>`;

        let initial = '';
        const form = () => document.getElementById('productForm');
        const snapshot = () => UI.snapshot(form()) + JSON.stringify(this.photos.map(x => x.url || x.preview))
            + ChipPicker.values(document.getElementById('pSizes')).join() + ChipPicker.values(document.getElementById('pColors')).join();

        UI.openSheet({
            title: p ? 'Editar producto' : 'Nuevo producto',
            body, foot, wide: true,
            isDirty: () => snapshot() !== initial,
            onOpen: () => {
                this.renderPhotos();
                ChipPicker.bind(document.getElementById('pSizes'));
                ChipPicker.bind(document.getElementById('pColors'), { swatch: true });

                const desc = document.getElementById('pDesc');
                const count = () => { document.getElementById('descCount').textContent = `${desc.value.length} / 1200`; };
                desc.addEventListener('input', count); count();

                const price = document.getElementById('pPrice');
                price.addEventListener('input', () => {
                    const n = U.int(price.value);
                    price.value = n ? n.toLocaleString('es-CL') : '';
                });
                document.getElementById('pBadge').addEventListener('change', (e) => {
                    const custom = document.getElementById('pBadgeCustom');
                    custom.hidden = e.target.value !== '__custom';
                    if (!custom.hidden) custom.focus();
                });

                const files = document.getElementById('photoFiles');
                files.addEventListener('change', () => { this.addFiles(files.files); files.value = ''; });
                document.getElementById('photoUrlAdd').addEventListener('click', () => {
                    const input = document.getElementById('photoUrl');
                    const url = input.value.trim();
                    if (!/^https?:\/\//i.test(url)) { UI.toast('Pega un link que empiece con https://', 'error'); return; }
                    this.photos.push({ url });
                    input.value = '';
                    this.renderPhotos();
                });

                document.getElementById('pSave').addEventListener('click', (e) => this.save(p, e.currentTarget));
                document.getElementById('pDelete')?.addEventListener('click', () => this.remove([p], true));
                initial = snapshot();
            }
        });
    },

    addFiles(fileList) {
        const files = [...fileList].filter(f => f.type.startsWith('image/'));
        if (!files.length) { UI.toast('Solo se pueden subir imágenes', 'error'); return; }
        files.forEach(file => this.photos.push({ file, preview: URL.createObjectURL(file) }));
        this.renderPhotos();
    },

    renderPhotos() {
        const box = document.getElementById('photos');
        const n = this.photos.length;
        box.innerHTML = this.photos.map((ph, i) => `
            <div class="photo">
                <img src="${ph.preview || U.img(ph.url)}" alt="Foto ${i + 1}">
                ${i === 0 ? '<span class="main-tag">Principal</span>' : ph.file ? '<span class="main-tag new-tag">Nueva</span>' : ''}
                <div class="tools">
                    <button type="button" data-move="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover a la izquierda">${ICON.left}</button>
                    <button type="button" class="rm" data-rm="${i}" aria-label="Quitar foto">${ICON.trash}</button>
                    <button type="button" data-move="1" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Mover a la derecha">${ICON.right}</button>
                </div>
            </div>`).join('') + `
            <button type="button" class="dropzone" id="dropzone">${ICON.upload}<span>Subir fotos<br><small class="muted">o arrástralas aquí</small></span></button>`;

        box.onclick = (e) => {
            const mv = e.target.closest('[data-move]');
            const rm = e.target.closest('[data-rm]');
            if (e.target.closest('#dropzone')) document.getElementById('photoFiles').click();
            if (mv) {
                const i = +mv.dataset.i, j = i + Number(mv.dataset.move);
                [this.photos[i], this.photos[j]] = [this.photos[j], this.photos[i]];
                this.renderPhotos();
            }
            if (rm) { this.photos.splice(+rm.dataset.rm, 1); this.renderPhotos(); }
        };
        const dz = document.getElementById('dropzone');
        ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
        ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-over'); }));
        dz.addEventListener('drop', (e) => this.addFiles(e.dataTransfer.files));
    },

    async save(existing, btn) {
        const f = document.getElementById('productForm');
        const err = (k, msg) => {
            const el = f.querySelector(`[data-err="${k}"]`);
            if (el) el.textContent = msg || '';
            el?.closest('.field')?.classList.toggle('has-error', !!msg);
        };
        ['name', 'price', 'stock'].forEach(k => err(k, ''));

        const name = document.getElementById('pName').value.trim();
        const price = U.int(document.getElementById('pPrice').value);
        const stock = U.int(document.getElementById('pStock').value);
        let bad = false;
        if (name.length < 2) { err('name', 'Escribe el nombre del producto.'); bad = true; }
        if (!price || price <= 0) { err('price', 'Ingresa un precio mayor a $0.'); bad = true; }
        if (stock === null || stock < 0) { err('stock', 'Ingresa el stock (0 si está agotado).'); bad = true; }
        const sizes = ChipPicker.values(document.getElementById('pSizes'));
        if (!sizes.length) { UI.toast('Elige al menos una talla (o "Única")', 'error'); bad = true; }
        if (bad) { f.querySelector('.has-error input')?.focus(); return; }

        const badgeSel = document.getElementById('pBadge').value;
        const badge = badgeSel === '__custom' ? document.getElementById('pBadgeCustom').value.trim() : badgeSel;

        UI.setLoading(btn, true);
        try {
            const images = [];
            for (const ph of this.photos) {
                images.push(ph.file ? await Uploads.upload('product-images', ph.file) : ph.url);
            }
            if (!images.length && !(await UI.confirm({ title: '¿Guardar sin fotos?', text: 'El producto se verá con una imagen genérica en la tienda.', ok: 'Guardar igual', danger: false }))) {
                UI.setLoading(btn, false);
                return;
            }
            const payload = {
                name,
                category_id: document.getElementById('pCat').value,
                price,
                stock,
                sizes,
                colors: ChipPicker.values(document.getElementById('pColors')),
                image: images[0] || null,
                images,
                badge: badge || null,
                description: document.getElementById('pDesc').value.trim(),
                featured: document.getElementById('pFeatured').checked
            };
            const { error } = existing
                ? await supabaseClient.from('products').update(payload).eq('id', existing.id)
                : await supabaseClient.from('products').insert(payload);
            if (error) {
                if (error.code === '23505') { err('name', 'Ya existe un producto con ese nombre.'); throw new Error('Ya existe un producto con ese nombre'); }
                throw error;
            }
            await UI.closeSheet(true);
            UI.toast(existing ? 'Cambios guardados' : 'Producto creado — ya está en la tienda');
            Admin.route();
        } catch (e) {
            UI.toast('No se pudo guardar: ' + e.message, 'error');
        } finally {
            UI.setLoading(btn, false);
        }
    },

    duplicate(p) {
        const copy = { ...p, id: null, stock: 0 };
        this.edit(null, copy);
    },

    async remove(list, fromSheet = false) {
        const one = list.length === 1;
        const ok = await UI.confirm({
            title: one ? `¿Eliminar "${list[0].name}"?` : `¿Eliminar ${list.length} productos?`,
            text: 'Desaparecen de la tienda para siempre. Los pedidos antiguos conservan su detalle. Si solo no hay stock, mejor deja el stock en 0.',
            ok: one ? 'Eliminar producto' : 'Eliminar productos'
        });
        if (!ok) return;
        const { error } = await supabaseClient.from('products').delete().in('id', list.map(p => p.id));
        if (error) { UI.toast('No se pudo eliminar: ' + error.message, 'error'); return; }
        if (fromSheet) await UI.closeSheet(true);
        UI.toast(one ? 'Producto eliminado' : `${list.length} productos eliminados`);
        Admin.route();
    },

    bulkEdit() {
        const ids = [...this.selected];
        const cats = Data.categories || [];
        UI.openSheet({
            title: `Editar ${ids.length} producto${ids.length === 1 ? '' : 's'}`,
            body: `
                <div class="callout">${ICON.info}<div>Solo se cambian los campos que modifiques. Lo que dejes en "Sin cambios" queda igual en cada producto.</div></div>
                <div class="field"><label for="bCat">Categoría</label><select id="bCat"><option value="">Sin cambios</option>${cats.map(c => `<option value="${U.esc(c.id)}">${U.esc(c.name)}</option>`).join('')}</select></div>
                <div class="field"><label for="bFeat">Destacado</label><select id="bFeat"><option value="">Sin cambios</option><option value="1">Destacar</option><option value="0">Quitar destacado</option></select></div>
                <div class="field"><label for="bStock">Stock</label><input id="bStock" type="number" min="0" inputmode="numeric" placeholder="Sin cambios"></div>
                <div class="field"><label for="bPrice">Precio</label><div class="input-group"><span class="prefix">$</span><input id="bPrice" inputmode="numeric" placeholder="Sin cambios"></div></div>`,
            foot: `<div class="spacer"></div><button class="btn btn-ghost" data-sheet-close>Cancelar</button><button class="btn btn-dark" id="bApply">Aplicar a ${ids.length}</button>`,
            onOpen: () => document.getElementById('bApply').addEventListener('click', async (e) => {
                const payload = {};
                const cat = document.getElementById('bCat').value;
                const feat = document.getElementById('bFeat').value;
                const stockRaw = document.getElementById('bStock').value.trim();
                const priceRaw = document.getElementById('bPrice').value.trim();
                if (cat) payload.category_id = cat;
                if (feat) payload.featured = feat === '1';
                if (stockRaw) { const s = U.int(stockRaw); if (s === null || s < 0) return UI.toast('Stock inválido', 'error'); payload.stock = s; }
                if (priceRaw) { const pr = U.int(priceRaw); if (!pr || pr <= 0) return UI.toast('Precio inválido', 'error'); payload.price = pr; }
                if (!Object.keys(payload).length) return UI.toast('No cambiaste ningún campo', 'error');
                UI.setLoading(e.currentTarget, true);
                const { error } = await supabaseClient.from('products').update(payload).in('id', ids);
                UI.setLoading(e.currentTarget, false);
                if (error) return UI.toast('No se pudo aplicar: ' + error.message, 'error');
                await UI.closeSheet(true);
                UI.toast(`${ids.length} producto${ids.length === 1 ? '' : 's'} actualizado${ids.length === 1 ? '' : 's'}`);
                Admin.route();
            })
        });
    }
};

// ---------------- Categorías (Super Admin) ----------------
Views.categorias = {
    async render(view) {
        Admin.header('Categorías', 'Ordenan el menú de la tienda. Las que no tienen productos se ocultan solas.',
            `<button class="btn btn-dark keep-label" id="newCat">${ICON.plus}<span>Nueva categoría</span></button>`);
        const [cats, { data: prods }] = await Promise.all([
            Data.categoriesList(true),
            supabaseClient.from('products').select('category_id')
        ]);
        this.counts = {};
        (prods || []).forEach(p => { this.counts[p.category_id] = (this.counts[p.category_id] || 0) + 1; });

        view.innerHTML = `<div class="card" id="catCard"></div>`;
        document.getElementById('newCat').addEventListener('click', () => this.edit());
        const card = document.getElementById('catCard');
        card.innerHTML = cats.length ? `
            <div class="table-wrap"><table class="table responsive">
                <thead><tr><th>Categoría</th><th>Productos</th><th>En el menú</th><th class="actions">Orden</th><th></th></tr></thead>
                <tbody>${cats.map((c, i) => {
                    const n = this.counts[c.id] || 0;
                    return `<tr class="is-clickable" data-cat="${U.esc(c.id)}">
                        <td class="cell-primary"><div class="cell-main">
                            ${c.image ? `<img class="thumb is-wide" src="${U.img(c.image)}" alt="" loading="lazy">` : `<span class="thumb is-wide" style="display:flex;align-items:center;justify-content:center;color:var(--muted)">${ICON.image}</span>`}
                            <div><strong>${U.esc(c.name)}</strong><small>/${U.esc(c.id)}${c.description ? ' · ' + U.esc(c.description) : ''}</small></div>
                        </div></td>
                        <td data-label="Productos">${n}</td>
                        <td data-label="En el menú">${n ? '<span class="pill ok">Visible</span>' : '<span class="pill off">Oculta (sin productos)</span>'}</td>
                        <td class="actions" data-label="Orden">
                            <button class="icon-btn" data-move="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${ICON.up}</button>
                            <button class="icon-btn" data-move="1" data-i="${i}" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Bajar">${ICON.down}</button>
                        </td>
                        <td class="actions"><button class="icon-btn is-danger" data-del="${U.esc(c.id)}" aria-label="Eliminar">${ICON.trash}</button></td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>` : U.empty('folder', 'Sin categorías', 'Crea al menos una para poder cargar productos.');

        card.addEventListener('click', async (e) => {
            const mv = e.target.closest('[data-move]');
            const del = e.target.closest('[data-del]');
            if (mv) { e.stopPropagation(); return this.move(+mv.dataset.i, +mv.dataset.move); }
            if (del) { e.stopPropagation(); return this.remove(del.dataset.del); }
            const row = e.target.closest('[data-cat]');
            if (row) this.edit(cats.find(c => c.id === row.dataset.cat));
        });
    },

    async move(i, dir) {
        const cats = [...Data.categories];
        const j = i + dir;
        [cats[i], cats[j]] = [cats[j], cats[i]];
        const updates = cats.map((c, n) => supabaseClient.from('categories').update({ sort_order: n + 1 }).eq('id', c.id));
        const res = await Promise.all(updates);
        const bad = res.find(r => r.error);
        if (bad) return UI.toast('No se pudo reordenar: ' + bad.error.message, 'error');
        UI.toast('Orden actualizado');
        Admin.route();
    },

    async remove(id) {
        const n = this.counts[id] || 0;
        if (n) return UI.toast(`No se puede eliminar: tiene ${n} producto${n === 1 ? '' : 's'}. Muévelos a otra categoría primero.`, 'error');
        const ok = await UI.confirm({ title: `¿Eliminar la categoría "${Data.catName(id)}"?`, text: 'También se borra su guía de tallas.', ok: 'Eliminar' });
        if (!ok) return;
        const { error } = await supabaseClient.from('categories').delete().eq('id', id);
        if (error) return UI.toast('No se pudo eliminar: ' + error.message, 'error');
        UI.toast('Categoría eliminada');
        Admin.route();
    },

    edit(c = null) {
        let imgFile = null;
        let imgUrl = c?.image || '';
        const body = `
            <div class="field"><label for="cName">Nombre</label><input id="cName" name="name" maxlength="40" value="${U.esc(c?.name || '')}" placeholder="Poleras"></div>
            <div class="field"><label for="cSlug">Dirección (URL)</label>
                <input id="cSlug" name="slug" value="${U.esc(c?.id || '')}" ${c ? 'disabled' : ''} placeholder="poleras">
                <span class="hint">${c ? 'No se puede cambiar porque los productos y links dependen de ella.' : 'Se genera sola a partir del nombre. Solo letras, números y guiones.'}</span>
            </div>
            <div class="field"><label for="cDesc">Descripción</label><input id="cDesc" name="desc" maxlength="120" value="${U.esc(c?.description || '')}" placeholder="Aparece bajo el título de la categoría"></div>
            <div class="field"><label>Foto de portada</label>
                <div class="media-preview" id="cPreview" style="aspect-ratio:4/3;max-width:320px"></div>
                <input type="file" id="cFile" accept="image/*" hidden>
                <div class="row mt-8"><button type="button" class="btn btn-ghost btn-sm" id="cPick">${ICON.upload}Subir foto</button><button type="button" class="btn btn-ghost btn-sm" id="cClear">Quitar</button></div>
                <span class="hint">Se usa en las tarjetas de categoría de la portada. Si no hay foto, se usa la del primer producto.</span>
            </div>`;
        const preview = () => {
            const box = document.getElementById('cPreview');
            const src = imgFile ? URL.createObjectURL(imgFile) : (imgUrl ? U.img(imgUrl) : '');
            box.innerHTML = src ? `<img src="${src}" alt="">` : '<div class="empty-media">Sin foto</div>';
        };
        let initial = '';
        UI.openSheet({
            title: c ? 'Editar categoría' : 'Nueva categoría',
            body,
            foot: `<div class="spacer"></div><button class="btn btn-ghost" data-sheet-close>Cancelar</button><button class="btn btn-dark" id="cSave">Guardar</button>`,
            isDirty: () => UI.snapshot(document.getElementById('sheetBody')) + imgUrl + (imgFile ? 1 : 0) !== initial,
            onOpen: () => {
                preview();
                const name = document.getElementById('cName');
                const slug = document.getElementById('cSlug');
                if (!c) name.addEventListener('input', () => { if (!slug.dataset.touched) slug.value = U.slug(name.value); });
                slug.addEventListener('input', () => { slug.dataset.touched = 1; slug.value = U.slug(slug.value); });
                document.getElementById('cPick').onclick = () => document.getElementById('cFile').click();
                document.getElementById('cFile').onchange = (e) => { imgFile = e.target.files[0] || null; preview(); };
                document.getElementById('cClear').onclick = () => { imgFile = null; imgUrl = ''; preview(); };
                document.getElementById('cSave').onclick = async (e) => {
                    const nm = name.value.trim();
                    const id = c ? c.id : U.slug(slug.value || nm);
                    if (nm.length < 2) return UI.toast('Escribe el nombre de la categoría', 'error');
                    if (!id) return UI.toast('La dirección no es válida', 'error');
                    UI.setLoading(e.currentTarget, true);
                    try {
                        const image = imgFile ? await Uploads.upload('site-assets', imgFile) : (imgUrl || null);
                        const payload = { name: nm, description: document.getElementById('cDesc').value.trim() || null, image };
                        const { error } = c
                            ? await supabaseClient.from('categories').update(payload).eq('id', c.id)
                            : await supabaseClient.from('categories').insert({ ...payload, id, sort_order: (Data.categories?.length || 0) + 1 });
                        if (error) throw error.code === '23505' ? new Error('Ya existe una categoría con esa dirección') : error;
                        await UI.closeSheet(true);
                        UI.toast('Categoría guardada');
                        Admin.route();
                    } catch (err) {
                        UI.toast('No se pudo guardar: ' + err.message, 'error');
                    } finally {
                        UI.setLoading(e.currentTarget, false);
                    }
                };
                initial = UI.snapshot(document.getElementById('sheetBody')) + imgUrl + 0;
            }
        });
    }
};

// ---------------- Banners ----------------
Views.banners = {
    async render(view) {
        Admin.header('Banners', 'Las imágenes grandes del inicio. Con 2 o más activos se muestran como carrusel.',
            `<button class="btn btn-dark keep-label" id="newBanner">${ICON.plus}<span>Nuevo banner</span></button>`);
        const [{ data, error }] = await Promise.all([
            supabaseClient.from('banners').select('*').order('sort_order'),
            Data.categoriesList()
        ]);
        if (error) throw error;
        this.banners = data || [];
        document.getElementById('newBanner').addEventListener('click', () => this.edit());

        if (!this.banners.length) {
            view.innerHTML = `<div class="card">${U.empty('image', 'Sin banners', 'Mientras no haya banners, el inicio muestra la imagen de Configuración.',
                `<button class="btn btn-dark" onclick="Views.banners.edit()">${ICON.plus}Crear banner</button>`)}</div>`;
            return;
        }
        view.innerHTML = `<div class="banner-grid" id="bannerGrid">${this.banners.map((b, i) => `
            <div class="card banner-card${b.active ? '' : ' is-off'}">
                ${this.preview(b.media_url, b.title, b.subtitle)}
                <div class="body">
                    <div class="grow"><strong>${U.esc(b.title || 'Sin título')}</strong><small>${U.esc(this.linkLabel(b.link_url))}</small></div>
                    <label class="switch" title="${b.active ? 'Visible' : 'Oculto'}"><input type="checkbox" data-toggle="${b.id}" ${b.active ? 'checked' : ''} aria-label="Mostrar en la tienda"><span class="track"></span></label>
                </div>
                <div class="card-foot" style="justify-content:space-between">
                    <div class="row">
                        <button class="icon-btn" data-move="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover antes">${ICON.left}</button>
                        <button class="icon-btn" data-move="1" data-i="${i}" ${i === this.banners.length - 1 ? 'disabled' : ''} aria-label="Mover después">${ICON.right}</button>
                    </div>
                    <div class="row">
                        <button class="btn btn-ghost btn-sm" data-edit="${b.id}">${ICON.edit}Editar</button>
                        <button class="icon-btn is-danger" data-del="${b.id}" aria-label="Eliminar">${ICON.trash}</button>
                    </div>
                </div>
            </div>`).join('')}</div>`;

        const grid = document.getElementById('bannerGrid');
        grid.addEventListener('click', (e) => {
            const t = e.target.closest('[data-edit],[data-del],[data-move]');
            if (!t) return;
            if (t.dataset.edit) this.edit(this.banners.find(b => b.id === +t.dataset.edit));
            if (t.dataset.del) this.remove(+t.dataset.del);
            if (t.dataset.move) this.move(+t.dataset.i, +t.dataset.move);
        });
        grid.addEventListener('change', async (e) => {
            if (!e.target.dataset.toggle) return;
            const { error } = await supabaseClient.from('banners').update({ active: e.target.checked }).eq('id', +e.target.dataset.toggle);
            if (error) { e.target.checked = !e.target.checked; return UI.toast('No se pudo cambiar: ' + error.message, 'error'); }
            e.target.closest('.banner-card').classList.toggle('is-off', !e.target.checked);
            UI.toast(e.target.checked ? 'Banner visible en la tienda' : 'Banner oculto');
        });
    },

    preview(url, title, subtitle) {
        if (!url) return `<div class="media-preview"><div class="empty-media">Sin imagen</div></div>`;
        const contain = /\.png(\?.*)?$/i.test(url) && !url.startsWith('blob:');
        const media = U.isVideo(url)
            ? `<video src="${U.esc(url)}" autoplay loop muted playsinline></video>`
            : `<img src="${U.esc(U.img(url))}" alt="" loading="lazy">`;
        return `<div class="media-preview${contain ? ' is-contain' : ''}">${media}
            ${title || subtitle ? `<div class="overlay-text">${title ? `<strong>${U.esc(title)}</strong>` : ''}${subtitle ? `<span>${U.esc(subtitle)}</span>` : ''}</div>` : ''}</div>`;
    },

    linkOptions() {
        return [
            ['pages/categoria.html', 'Todo el catálogo'],
            ...(Data.categories || []).map(c => [`pages/categoria.html?cat=${encodeURIComponent(c.id)}`, `Categoría: ${c.name}`]),
            ['#novedades', 'Sección "Lo nuevo" del inicio'],
            ['custom', 'Otro link (Instagram, WhatsApp, etc.)']
        ];
    },
    linkLabel(url) {
        if (!url) return 'Lleva a: Todo el catálogo';
        const opt = this.linkOptions().find(o => o[0] === url);
        return 'Lleva a: ' + (opt ? opt[1] : url);
    },

    edit(b = null) {
        let file = null;
        let mediaUrl = b?.media_url || '';
        const opts = this.linkOptions();
        const known = opts.some(o => o[0] === (b?.link_url || 'pages/categoria.html'));
        const body = `
            <div class="sheet-section">
                <h3>Vista previa</h3>
                <div id="bPreview"></div>
                <input type="file" id="bFile" accept="image/*,video/mp4,video/webm,video/quicktime" hidden>
                <div class="row mt-8 wrap">
                    <button type="button" class="btn btn-ghost btn-sm" id="bPick">${ICON.upload}Subir imagen o video</button>
                    <span class="muted">Recomendado: foto vertical u horizontal de al menos 1600 px. Videos MP4 de hasta 50 MB.</span>
                </div>
            </div>
            <div class="field"><label for="bTitle">Título</label><input id="bTitle" name="title" maxlength="40" value="${U.esc(b?.title || '')}" placeholder="Nueva colección"><span class="hint">Se muestra grande sobre la imagen. Revisa tildes y ortografía.</span></div>
            <div class="field"><label for="bSub">Texto secundario (opcional)</label><input id="bSub" name="sub" maxlength="90" value="${U.esc(b?.subtitle || '')}"></div>
            <div class="field"><label for="bLink">Al tocar "Comprar ahora" lleva a…</label>
                <select id="bLink" name="link">${opts.map(([v, l]) => `<option value="${U.esc(v)}" ${(known ? (b?.link_url || 'pages/categoria.html') === v : v === 'custom') ? 'selected' : ''}>${U.esc(l)}</option>`).join('')}</select>
                <input id="bCustom" name="custom" placeholder="https://…" value="${known ? '' : U.esc(b?.link_url || '')}" ${known ? 'hidden' : ''} style="margin-top:6px">
            </div>
            <label class="switch"><input type="checkbox" id="bActive" name="active" ${b ? (b.active ? 'checked' : '') : 'checked'}><span class="track"></span>Visible en la tienda</label>`;

        const render = () => {
            const src = file ? URL.createObjectURL(file) : mediaUrl;
            document.getElementById('bPreview').innerHTML = file && file.type.startsWith('video/')
                ? `<div class="media-preview"><video src="${src}" autoplay loop muted playsinline></video></div>`
                : this.preview(src, document.getElementById('bTitle').value.trim(), document.getElementById('bSub').value.trim());
        };
        let initial = '';
        UI.openSheet({
            title: b ? 'Editar banner' : 'Nuevo banner',
            body,
            foot: `${b ? `<button class="btn btn-danger" id="bDelete">${ICON.trash}<span>Eliminar</span></button>` : ''}<div class="spacer"></div><button class="btn btn-ghost" data-sheet-close>Cancelar</button><button class="btn btn-dark" id="bSave">Guardar</button>`,
            isDirty: () => UI.snapshot(document.getElementById('sheetBody')) + mediaUrl + (file ? 1 : 0) !== initial,
            onOpen: () => {
                render();
                ['bTitle', 'bSub'].forEach(id => document.getElementById(id).addEventListener('input', U.debounce(render, 200)));
                document.getElementById('bPick').onclick = () => document.getElementById('bFile').click();
                document.getElementById('bFile').onchange = (e) => { file = e.target.files[0] || null; render(); };
                document.getElementById('bLink').onchange = (e) => { document.getElementById('bCustom').hidden = e.target.value !== 'custom'; };
                document.getElementById('bDelete')?.addEventListener('click', () => this.remove(b.id, true));
                document.getElementById('bSave').onclick = async (e) => {
                    const linkSel = document.getElementById('bLink').value;
                    const link = linkSel === 'custom' ? document.getElementById('bCustom').value.trim() : linkSel;
                    if (!file && !mediaUrl) return UI.toast('Sube una imagen o video', 'error');
                    if (linkSel === 'custom' && !/^(https?:\/\/|#)/i.test(link)) return UI.toast('El link debe empezar con https://', 'error');
                    UI.setLoading(e.currentTarget, true);
                    try {
                        const media = file ? await Uploads.upload('site-assets', file) : mediaUrl;
                        const payload = {
                            media_url: media,
                            title: document.getElementById('bTitle').value.trim() || null,
                            subtitle: document.getElementById('bSub').value.trim() || null,
                            link_url: link,
                            active: document.getElementById('bActive').checked
                        };
                        const { error } = b
                            ? await supabaseClient.from('banners').update(payload).eq('id', b.id)
                            : await supabaseClient.from('banners').insert({ ...payload, sort_order: this.banners.length + 1 });
                        if (error) throw error;
                        await UI.closeSheet(true);
                        UI.toast('Banner guardado');
                        Admin.route();
                    } catch (err) {
                        UI.toast('No se pudo guardar: ' + err.message, 'error');
                    } finally {
                        UI.setLoading(e.currentTarget, false);
                    }
                };
                initial = UI.snapshot(document.getElementById('sheetBody')) + mediaUrl + 0;
            }
        });
    },

    async move(i, dir) {
        const list = [...this.banners];
        const j = i + dir;
        [list[i], list[j]] = [list[j], list[i]];
        const res = await Promise.all(list.map((b, n) => supabaseClient.from('banners').update({ sort_order: n + 1 }).eq('id', b.id)));
        const bad = res.find(r => r.error);
        if (bad) return UI.toast('No se pudo reordenar: ' + bad.error.message, 'error');
        Admin.route();
    },

    async remove(id, fromSheet) {
        const ok = await UI.confirm({ title: '¿Eliminar este banner?', text: 'Si solo quieres ocultarlo por un tiempo, desactívalo con el interruptor.', ok: 'Eliminar' });
        if (!ok) return;
        const { error } = await supabaseClient.from('banners').delete().eq('id', id);
        if (error) return UI.toast('No se pudo eliminar: ' + error.message, 'error');
        if (fromSheet) await UI.closeSheet(true);
        UI.toast('Banner eliminado');
        Admin.route();
    }
};

// ---------------- Guía de tallas ----------------
Views.tallas = {
    async render(view) {
        Admin.header('Guía de tallas', 'Las medidas se muestran en la ficha de producto y en la página "Guía de tallas".',
            `<button class="btn btn-dark keep-label" id="newSize">${ICON.plus}<span>Nueva talla</span></button>`);
        const [{ data, error }, cats] = await Promise.all([
            supabaseClient.from('size_guide').select('*').order('sort_order'),
            Data.categoriesList(true)
        ]);
        if (error) throw error;
        this.rows = data || [];
        document.getElementById('newSize').addEventListener('click', () => this.edit(null, cats[0]?.id));

        view.innerHTML = `
            <div class="callout">${ICON.info}<div><strong>Medida corta</strong>: aparece junto a la talla al elegirla (ej. "Talla M: 51 cm de ancho"). <strong>Detalle</strong>: columnas extra de la tabla (Largo, Ancho pecho, Manga…).</div></div>
            <div class="stack">${cats.map(c => {
                const rows = this.rows.filter(r => r.category_id === c.id);
                const labels = [...new Set(rows.flatMap(r => Object.keys(r.measurements || {})))];
                return `<div class="card">
                    <div class="card-head"><div><h2>${U.esc(c.name)}</h2><p>${rows.length ? `${rows.length} talla${rows.length === 1 ? '' : 's'}` : 'Sin medidas: la ficha no mostrará guía de tallas'}</p></div>
                        <button class="btn btn-ghost btn-sm" data-add="${U.esc(c.id)}">${ICON.plus}Agregar talla</button></div>
                    ${rows.length ? `<div class="table-wrap"><table class="table">
                        <thead><tr><th>Talla</th><th>Medida corta</th>${labels.map(l => `<th>${U.esc(l)}</th>`).join('')}<th></th></tr></thead>
                        <tbody>${rows.map(r => `<tr class="is-clickable" data-row="${r.id}">
                            <td class="strong">${U.esc(r.size)}</td><td>${U.esc(r.measurement)}</td>
                            ${labels.map(l => `<td>${U.esc((r.measurements || {})[l] ?? '—')}</td>`).join('')}
                            <td class="actions"><button class="icon-btn is-danger" data-del="${r.id}" aria-label="Eliminar">${ICON.trash}</button></td>
                        </tr>`).join('')}</tbody></table></div>` : ''}
                </div>`;
            }).join('') || `<div class="card">${U.empty('ruler', 'Sin categorías', 'Crea categorías primero.')}</div>`}</div>`;

        // onclick (no addEventListener): Admin.route lo limpia al cambiar de sección
        view.onclick = (e) => {
            const add = e.target.closest('[data-add]');
            const del = e.target.closest('[data-del]');
            const row = e.target.closest('[data-row]');
            if (add) return this.edit(null, add.dataset.add);
            if (del) { e.stopPropagation(); return this.remove(+del.dataset.del); }
            if (row) this.edit(this.rows.find(r => r.id === +row.dataset.row));
        };
    },

    edit(r = null, catId = null) {
        const cats = Data.categories || [];
        const cat = r?.category_id || catId;
        const sameCat = this.rows.filter(x => x.category_id === cat);
        const labels = [...new Set(sameCat.flatMap(x => Object.keys(x.measurements || {})))];
        let details = r ? Object.entries(r.measurements || {}).map(([label, value]) => ({ label, value }))
            : labels.map(label => ({ label, value: '' }));

        const body = `
            <div class="form-grid">
                <div class="field"><label for="sCat">Categoría</label><select id="sCat" name="cat">${cats.map(c => `<option value="${U.esc(c.id)}" ${c.id === cat ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select></div>
                <div class="field"><label for="sSize">Talla</label><input id="sSize" name="size" maxlength="10" value="${U.esc(r?.size || '')}" placeholder="M"></div>
                <div class="field"><label for="sMeasure">Medida corta</label><input id="sMeasure" name="measure" maxlength="20" value="${U.esc(r?.measurement || '')}" placeholder="51 cm"><span class="hint">Ancho de pecho, cintura, etc.</span></div>
                <div class="field"><label for="sOrder">Posición</label><input id="sOrder" name="order" type="number" min="1" value="${r?.sort_order ?? sameCat.length + 1}"><span class="hint">1 = primera de la lista (S antes que M…)</span></div>
            </div>
            <div class="sheet-section mt-16">
                <h3>Detalle de medidas (opcional)</h3>
                <div id="sDetails"></div>
                <button type="button" class="btn btn-ghost btn-sm mt-8" id="sAddDetail">${ICON.plus}Agregar medida</button>
            </div>`;

        const renderDetails = () => {
            document.getElementById('sDetails').innerHTML = details.map((d, i) => `
                <div class="row mb-16">
                    <input class="input" name="dl${i}" data-dl="${i}" value="${U.esc(d.label)}" placeholder="Largo" style="flex:1">
                    <input class="input" name="dv${i}" data-dv="${i}" value="${U.esc(d.value)}" placeholder="70 cm" style="flex:1">
                    <button type="button" class="icon-btn is-danger" data-rmd="${i}" aria-label="Quitar">${ICON.trash}</button>
                </div>`).join('') || '<p class="muted">Sin medidas de detalle.</p>';
        };
        let initial = '';
        UI.openSheet({
            title: r ? `Talla ${U.esc(r.size)}` : 'Nueva talla',
            body,
            foot: `<div class="spacer"></div><button class="btn btn-ghost" data-sheet-close>Cancelar</button><button class="btn btn-dark" id="sSave">Guardar</button>`,
            isDirty: () => UI.snapshot(document.getElementById('sheetBody')) !== initial,
            onOpen: () => {
                renderDetails();
                const box = document.getElementById('sDetails');
                box.addEventListener('input', (e) => {
                    if (e.target.dataset.dl) details[+e.target.dataset.dl].label = e.target.value;
                    if (e.target.dataset.dv) details[+e.target.dataset.dv].value = e.target.value;
                });
                box.addEventListener('click', (e) => {
                    const rm = e.target.closest('[data-rmd]');
                    if (rm) { details.splice(+rm.dataset.rmd, 1); renderDetails(); }
                });
                document.getElementById('sAddDetail').onclick = () => { details.push({ label: '', value: '' }); renderDetails(); };
                document.getElementById('sSave').onclick = async (e) => {
                    const size = document.getElementById('sSize').value.trim();
                    const measurement = document.getElementById('sMeasure').value.trim();
                    if (!size) return UI.toast('Escribe la talla', 'error');
                    if (!measurement) return UI.toast('Escribe la medida corta', 'error');
                    const measurements = {};
                    details.forEach(d => { if (d.label.trim() && d.value.trim()) measurements[d.label.trim()] = d.value.trim(); });
                    const payload = {
                        category_id: document.getElementById('sCat').value,
                        size, measurement, measurements,
                        sort_order: U.int(document.getElementById('sOrder').value) || 0
                    };
                    UI.setLoading(e.currentTarget, true);
                    const { error } = r
                        ? await supabaseClient.from('size_guide').update(payload).eq('id', r.id)
                        : await supabaseClient.from('size_guide').insert(payload);
                    UI.setLoading(e.currentTarget, false);
                    if (error) return UI.toast(error.code === '23505' ? 'Esa talla ya existe en esta categoría' : 'No se pudo guardar: ' + error.message, 'error');
                    await UI.closeSheet(true);
                    UI.toast('Talla guardada');
                    Admin.route();
                };
                initial = UI.snapshot(document.getElementById('sheetBody'));
            }
        });
    },

    async remove(id) {
        const r = this.rows.find(x => x.id === id);
        const ok = await UI.confirm({ title: `¿Eliminar la talla ${r?.size || ''}?`, text: 'Se quita de la guía de tallas de su categoría.', ok: 'Eliminar' });
        if (!ok) return;
        const { error } = await supabaseClient.from('size_guide').delete().eq('id', id);
        if (error) return UI.toast('No se pudo eliminar: ' + error.message, 'error');
        UI.toast('Talla eliminada');
        Admin.route();
    }
};
