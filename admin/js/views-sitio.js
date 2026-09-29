// ============================================================
// Panel · Sitio (Super Admin): Páginas, Configuración y Usuarios
// ============================================================

// ---------------- Páginas ----------------
Views.paginas = {
    pages: [],
    currentSlug: null,
    initial: '',

    async render(view) {
        Admin.header('Páginas', 'Textos de ayuda y legales enlazados en el footer de la tienda.');
        const { data, error } = await supabaseClient.from('pages').select('*').order('title');
        if (error) throw error;
        this.pages = data || [];
        if (!this.pages.length) {
            view.innerHTML = `<div class="card">${U.empty('page', 'Sin páginas', 'Corre el schema de la base de datos para crear las páginas de ayuda.')}</div>`;
            return;
        }
        if (!this.pages.some(p => p.slug === this.currentSlug)) this.currentSlug = this.pages[0].slug;

        view.innerHTML = `
            <div class="pages-layout">
                <div class="card pages-list" id="pagesList"></div>
                <div class="card" id="pageEditor"></div>
            </div>`;
        document.getElementById('pagesList').addEventListener('click', async (e) => {
            const a = e.target.closest('[data-slug]');
            if (!a) return;
            e.preventDefault();
            if (a.dataset.slug === this.currentSlug) return;
            if (this.isDirty() && !(await UI.confirm({ title: '¿Cambiar de página sin guardar?', text: 'Perderás los cambios de esta página.', ok: 'Cambiar sin guardar' }))) return;
            this.currentSlug = a.dataset.slug;
            this.renderEditor();
        });
        this.renderEditor();
    },

    isDirty() {
        const t = document.getElementById('pgTitle');
        const c = document.getElementById('pgContent');
        return t && c && (t.value + '\u0000' + c.value) !== this.initial;
    },

    renderEditor() {
        document.getElementById('pagesList').innerHTML = this.pages.map(p =>
            `<a href="#" data-slug="${U.esc(p.slug)}" class="${p.slug === this.currentSlug ? 'is-active' : ''}">${U.esc(p.title)}<small>Actualizada ${U.ago(p.updated_at)}</small></a>`).join('');
        const p = this.pages.find(x => x.slug === this.currentSlug);
        document.getElementById('pageEditor').innerHTML = `
            <div class="card-head">
                <div><h2>${U.esc(p.title)}</h2><p>/pages/info.html?slug=${U.esc(p.slug)}</p></div>
                <a class="btn btn-ghost btn-sm" href="../pages/info.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${ICON.external}Ver</a>
            </div>
            <div class="card-body">
                <div class="field"><label for="pgTitle">Título</label><input id="pgTitle" maxlength="60" value="${U.esc(p.title)}"></div>
                <div class="field">
                    <label for="pgContent">Contenido</label>
                    <div class="editor-toolbar" id="pgTools">
                        <button type="button" data-wrap="p" title="Párrafo">Párrafo</button>
                        <button type="button" data-wrap="h2" title="Subtítulo">Subtítulo</button>
                        <button type="button" data-wrap="strong" title="Negrita"><b>B</b></button>
                        <span class="sep"></span>
                        <button type="button" data-list="ul">• Lista</button>
                        <button type="button" data-list="ol">1. Lista</button>
                        <button type="button" data-link>Link</button>
                    </div>
                    <textarea class="editor-area" id="pgContent" spellcheck="true">${U.esc(p.content)}</textarea>
                    <span class="hint">Selecciona un texto y usa los botones para darle formato.</span>
                </div>
                <div class="field"><label>Vista previa</label><div class="card card-body prose-preview" id="pgPreview"></div></div>
            </div>
            <div class="card-foot"><button class="btn btn-ghost" id="pgRevert">Descartar cambios</button><button class="btn btn-dark" id="pgSave">Guardar página</button></div>`;

        const ta = document.getElementById('pgContent');
        const title = document.getElementById('pgTitle');
        const preview = () => {
            // Vista previa sin scripts ni atributos de eventos
            const clean = ta.value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
            document.getElementById('pgPreview').innerHTML = clean;
        };
        ta.addEventListener('input', U.debounce(preview, 150));
        preview();
        this.initial = title.value + '\u0000' + ta.value;

        document.getElementById('pgTools').addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            const s = ta.selectionStart, en = ta.selectionEnd;
            const sel = ta.value.slice(s, en) || 'Texto';
            let out = sel;
            if (b.dataset.wrap) out = `<${b.dataset.wrap}>${sel}</${b.dataset.wrap}>`;
            if (b.dataset.list) out = `<${b.dataset.list}>\n${sel.split(/\n+/).map(l => `<li>${l.trim()}</li>`).join('\n')}\n</${b.dataset.list}>`;
            if (b.dataset.link !== undefined) {
                const url = prompt('Link (https://… o info.html?slug=contacto):', 'https://');
                if (!url) return;
                out = `<a href="${url.replace(/"/g, '')}">${sel}</a>`;
            }
            ta.setRangeText(out, s, en, 'end');
            ta.focus();
            preview();
        });

        document.getElementById('pgRevert').onclick = () => { ta.value = p.content; title.value = p.title; preview(); };
        document.getElementById('pgSave').onclick = async (e) => {
            if (!title.value.trim()) return UI.toast('La página necesita un título', 'error');
            UI.setLoading(e.currentTarget, true);
            const { data, error } = await supabaseClient.from('pages').update({ title: title.value.trim(), content: ta.value }).eq('slug', p.slug).select().single();
            UI.setLoading(e.currentTarget, false);
            if (error) return UI.toast('No se pudo guardar: ' + error.message, 'error');
            Object.assign(p, data);
            this.initial = title.value + '\u0000' + ta.value;
            UI.toast('Página guardada — ya se ve en la tienda');
            this.renderEditor();
        };
    }
};

// ---------------- Configuración ----------------
Views.configuracion = {
    async render(view) {
        Admin.header('Configuración', 'Datos de la tienda, pagos, entregas, redes y marca.');
        const cfg = await Data.configRow(true);
        const hasTransfer = 'transfer_info' in cfg;

        view.innerHTML = `
            <form id="cfgForm" novalidate class="stack">
                <div class="card">
                    <div class="card-head"><div><h2>Tienda y contacto</h2><p>El WhatsApp recibe los pedidos y las consultas de la tienda.</p></div></div>
                    <div class="card-body form-grid">
                        <div class="field"><label for="fStore">Nombre de la tienda</label><input id="fStore" name="store_name" value="${U.esc(cfg.store_name || 'PopFlame')}"></div>
                        <div class="field"><label for="fWa">WhatsApp de ventas</label>
                            <input id="fWa" name="whatsapp_number" type="tel" inputmode="tel" value="${U.esc(cfg.whatsapp_number || '')}" placeholder="+56 9 1234 5678">
                            <span class="hint" id="waHint"></span>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-head"><div><h2>Pagos por transferencia</h2><p>Se envían al cliente desde el pedido con un clic, y se muestran al confirmar la compra.</p></div></div>
                    <div class="card-body">
                        ${hasTransfer ? `
                        <div class="field"><label for="fTransfer">Datos de la cuenta</label>
                            <textarea id="fTransfer" name="transfer_info" rows="6" placeholder="Nombre: ...&#10;RUT: ...&#10;Banco: ...&#10;Tipo de cuenta: ...&#10;N° de cuenta: ...&#10;Correo: ...">${U.esc(cfg.transfer_info || '')}</textarea>
                            <span class="hint">Escribe cada dato en una línea. Revisa bien el número de cuenta.</span>
                        </div>` : `<div class="callout is-warn">${ICON.alert}<div>Para guardar los datos de transferencia primero corre el SQL <strong>db/2026-09-29_panel.sql</strong> en Supabase.</div></div>`}
                    </div>
                </div>

                <div class="card">
                    <div class="card-head"><div><h2>Entregas</h2><p>Con costo 0 la tienda muestra "Entrega gratis en Metro".</p></div></div>
                    <div class="card-body form-grid">
                        <div class="field"><label for="fShip">Costo de despacho</label><div class="input-group"><span class="prefix">$</span><input id="fShip" name="shipping_cost" inputmode="numeric" value="${Number(cfg.shipping_cost || 0).toLocaleString('es-CL')}"></div></div>
                        <div class="field"><label for="fFree">Despacho gratis desde</label><div class="input-group"><span class="prefix">$</span><input id="fFree" name="free_shipping_min" inputmode="numeric" value="${Number(cfg.free_shipping_min || 0).toLocaleString('es-CL')}"></div><span class="hint">0 = no aplica.</span></div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-head"><div><h2>Redes sociales</h2><p>Aparecen en el footer, el menú y la página de contacto. Deja vacío lo que no uses.</p></div></div>
                    <div class="card-body form-grid">
                        <div class="field"><label for="fIg">Instagram</label><input id="fIg" name="social_instagram" type="url" value="${U.esc(cfg.social_instagram || '')}" placeholder="https://instagram.com/popflame_"></div>
                        <div class="field"><label for="fTt">TikTok</label><input id="fTt" name="social_tiktok" type="url" value="${U.esc(cfg.social_tiktok || '')}" placeholder="https://tiktok.com/@..."></div>
                        <div class="field"><label for="fTw">X / Twitter</label><input id="fTw" name="social_twitter" type="url" value="${U.esc(cfg.social_twitter || '')}" placeholder="https://x.com/..."></div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-head"><div><h2>Portada sin banners</h2><p>Solo se usa si no hay ningún banner activo.</p></div></div>
                    <div class="card-body form-grid">
                        <div class="field"><label for="fHt">Título</label><input id="fHt" name="hero_title" maxlength="40" value="${U.esc(cfg.hero_title || '')}"></div>
                        <div class="field"><label for="fHs">Subtítulo</label><input id="fHs" name="hero_subtitle" maxlength="90" value="${U.esc(cfg.hero_subtitle || '')}"></div>
                    </div>
                </div>

                <div class="row" style="justify-content:flex-end;position:sticky;bottom:16px;z-index:5">
                    <button type="submit" class="btn btn-dark btn-lg" id="cfgSave" style="box-shadow:0 10px 30px rgba(0,0,0,.2)">Guardar configuración</button>
                </div>
            </form>

            <div class="card mt-16">
                <div class="card-head"><div><h2>Marca</h2><p>Se guardan al subirlos. Aceptan imagen o video (logo animado).</p></div></div>
                <div class="card-body grid-2" id="assets">
                    ${this.asset('logo_url', 'Logo del header', cfg.logo_url, true)}
                    ${this.asset('hero_banner_url', 'Imagen de portada (sin banners)', cfg.hero_banner_url)}
                </div>
            </div>`;

        const wa = document.getElementById('fWa');
        const waHint = () => {
            const n = U.waNumber(wa.value);
            document.getElementById('waHint').innerHTML = n
                ? `Los clientes escribirán a <strong>+${n}</strong>. <a href="https://wa.me/${n}" target="_blank" rel="noopener" style="text-decoration:underline">Probar</a>`
                : 'Formato: +56 9 1234 5678';
        };
        wa.addEventListener('input', waHint); waHint();

        ['fShip', 'fFree'].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => { const n = U.int(el.value); el.value = n ? n.toLocaleString('es-CL') : (el.value === '' ? '' : '0'); });
        });

        const form = document.getElementById('cfgForm');
        let initial = UI.snapshot(form);
        this.isDirty = () => document.body.contains(form) && UI.snapshot(form) !== initial;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('cfgSave');
            const urls = ['social_instagram', 'social_tiktok', 'social_twitter'];
            for (const k of urls) {
                const v = form.elements[k].value.trim();
                if (v && !/^https?:\/\//i.test(v)) return UI.toast('Los links de redes deben empezar con https://', 'error');
            }
            const waNum = U.waNumber(wa.value);
            if (wa.value.trim() && waNum.length < 11) return UI.toast('Revisa el número de WhatsApp', 'error');
            const payload = {
                store_name: form.elements.store_name.value.trim() || 'PopFlame',
                whatsapp_number: waNum ? '+' + waNum : null,
                shipping_cost: U.int(form.elements.shipping_cost.value) || 0,
                free_shipping_min: U.int(form.elements.free_shipping_min.value) || 0,
                hero_title: form.elements.hero_title.value.trim(),
                hero_subtitle: form.elements.hero_subtitle.value.trim(),
                social_instagram: form.elements.social_instagram.value.trim() || null,
                social_tiktok: form.elements.social_tiktok.value.trim() || null,
                social_twitter: form.elements.social_twitter.value.trim() || null
            };
            if (hasTransfer) payload.transfer_info = form.elements.transfer_info.value.trim() || null;
            UI.setLoading(btn, true);
            const { error } = await supabaseClient.from('config').update(payload).eq('id', 1);
            UI.setLoading(btn, false);
            if (error) return UI.toast('No se pudo guardar: ' + error.message, 'error');
            Data.config = null;
            initial = UI.snapshot(form);
            wa.value = payload.whatsapp_number || '';
            waHint();
            UI.toast('Configuración guardada — la tienda ya la usa');
        });

        document.getElementById('assets').addEventListener('change', async (e) => {
            const input = e.target.closest('[data-asset]');
            if (!input || !input.files[0]) return;
            const col = input.dataset.asset;
            const box = input.closest('.field');
            const btn = box.querySelector('label.btn');
            btn.classList.add('is-loading');
            try {
                const url = await Uploads.upload('site-assets', input.files[0]);
                const { error } = await supabaseClient.from('config').update({ [col]: url }).eq('id', 1);
                if (error) throw error;
                box.querySelector('.media-preview').outerHTML = this.previewHtml(url, col === 'logo_url');
                Data.config = null;
                if (col === 'logo_url') Admin.loadBrand();
                UI.toast('Actualizado — recarga la tienda para verlo');
            } catch (err) {
                UI.toast('No se pudo subir: ' + err.message, 'error');
            } finally {
                btn.classList.remove('is-loading');
                input.value = '';
            }
        });
    },

    previewHtml(url, isLogo) {
        const media = !url ? '<div class="empty-media">Sin archivo</div>'
            : U.isVideo(url) ? `<video src="${U.esc(url)}" autoplay loop muted playsinline></video>`
            : `<img src="${U.esc(U.img(url))}" alt="">`;
        return `<div class="media-preview${isLogo ? ' is-contain' : ''}" style="aspect-ratio:${isLogo ? '3/1' : '16/9'}">${media}</div>`;
    },

    asset(col, label, url, isLogo = false) {
        return `<div class="field">
            <label>${label}</label>
            ${this.previewHtml(url, isLogo)}
            <label class="btn btn-ghost btn-sm mt-8" style="align-self:flex-start">${ICON.upload}Cambiar
                <input type="file" data-asset="${col}" accept="image/*,video/mp4,video/webm,video/quicktime" hidden>
            </label>
        </div>`;
    }
};

// ---------------- Usuarios ----------------
Views.usuarios = {
    async render(view) {
        Admin.header('Usuarios', 'Quién puede entrar al panel y con qué permisos.');
        const { data, error } = await supabaseClient.from('profiles').select('*').order('created_at');
        if (error) throw error;
        const users = data || [];
        const pending = users.filter(u => u.role === 'pending');

        view.innerHTML = `
            ${pending.length ? `<div class="callout is-warn">${ICON.alert}<div><strong>${pending.length} cuenta${pending.length === 1 ? '' : 's'} esperando aprobación.</strong> Asígnale un rol para que pueda entrar, o déjala pendiente si no la reconoces.</div></div>` : ''}
            <div class="card">
                <div class="table-wrap"><table class="table responsive">
                    <thead><tr><th>Usuario</th><th>Nombre visible</th><th>Permisos</th><th>Desde</th><th></th></tr></thead>
                    <tbody>${users.map(u => {
                        const me = u.id === Admin.profile.id;
                        return `<tr data-user="${u.id}">
                            <td class="cell-primary"><div class="cell-main"><span class="avatar is-light">${U.esc(U.initials(u.name || u.username))}</span>
                                <div><strong>${U.esc(u.username)} ${me ? '<span class="pill dark no-dot" style="height:18px;font-size:10px;padding:0 6px">Tú</span>' : ''}</strong><small>Inicia sesión como "${U.esc(u.username)}"</small></div></div></td>
                            <td data-label="Nombre"><input class="input" data-name value="${U.esc(u.name || '')}" maxlength="40" style="height:36px;min-width:140px"></td>
                            <td data-label="Permisos">
                                <select class="input" data-role style="height:36px;width:auto" ${me ? 'disabled title="No puedes cambiar tu propio rol"' : ''}>
                                    ${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}
                                </select>
                            </td>
                            <td data-label="Desde" class="muted nowrap">${U.date(u.created_at)}</td>
                            <td class="actions"><button class="btn btn-ghost btn-sm" data-save>Guardar</button></td>
                        </tr>`;
                    }).join('')}</tbody>
                </table></div>
            </div>

            <div class="grid-2 mt-16">
                <div class="card card-body">
                    <h3 class="strong mb-16">Qué puede hacer cada rol</h3>
                    <dl class="kv">
                        <dt>Super Admin</dt><dd>Todo: además de lo del Admin, categorías, páginas, configuración y usuarios.</dd>
                        <dt>Admin</dt><dd>Pedidos, inventario, productos, banners y guía de tallas.</dd>
                        <dt>Pendiente</dt><dd>Sin acceso. Así queda toda cuenta nueva hasta que la apruebes.</dd>
                    </dl>
                </div>
                <div class="card card-body">
                    <h3 class="strong mb-16">Agregar una cuenta nueva</h3>
                    <ol class="muted" style="margin-left:18px;line-height:1.8">
                        <li>En Supabase: <strong>Authentication → Users → Add user → Create new user</strong>.</li>
                        <li>Correo: <strong>usuario@popflame.cl</strong> (lo que va antes de la @ será su usuario). Marca <em>Auto Confirm User</em>.</li>
                        <li>Vuelve aquí: aparecerá como <strong>Pendiente</strong>. Elige su rol y guarda.</li>
                    </ol>
                    <p class="muted mt-8">Para quitarle el acceso a alguien, déjalo como Pendiente. Borrar la cuenta se hace desde Supabase.</p>
                </div>
            </div>`;

        view.querySelector('tbody').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-save]');
            if (!btn) return;
            const row = btn.closest('[data-user]');
            const id = row.dataset.user;
            const u = users.find(x => x.id === id);
            const name = row.querySelector('[data-name]').value.trim();
            const role = row.querySelector('[data-role]').value;
            if (role !== u.role && role === 'super_admin' &&
                !(await UI.confirm({ title: `¿Dar permisos de Super Admin a ${u.username}?`, text: 'Podrá cambiar la configuración, las páginas y los permisos de todos.', ok: 'Dar permisos', danger: false }))) return;
            UI.setLoading(btn, true);
            const payload = { name: name || u.username };
            if (id !== Admin.profile.id) payload.role = role;
            const { error } = await supabaseClient.from('profiles').update(payload).eq('id', id);
            UI.setLoading(btn, false);
            if (error) return UI.toast('No se pudo guardar: ' + error.message, 'error');
            Object.assign(u, payload);
            if (id === Admin.profile.id) {
                Admin.profile.name = payload.name;
                document.getElementById('meName').textContent = payload.name;
                document.getElementById('meAvatar').textContent = U.initials(payload.name);
            }
            UI.toast(`${u.username}: ${ROLE_LABEL[u.role]}`);
            if (role !== 'pending' && pending.some(p => p.id === id)) Admin.route();
        });
    }
};

// ---------------- Suscriptores del newsletter ----------------
Views.suscriptores = {
    query: '',

    async render(view) {
        Admin.header('Suscriptores', 'Personas inscritas en el club PopFlame (footer de la tienda).',
            `<button class="btn btn-ghost" id="subsCsv">${ICON.download}<span>Exportar CSV</span></button>`);
        const { data, error } = await supabaseClient.from('subscribers').select('*').order('subscribed_at', { ascending: false });
        if (error) throw error;
        this.subs = data || [];
        const active = this.subs.filter(s => s.active).length;
        const monthAgo = Date.now() - 30 * 86400000;
        const recent = this.subs.filter(s => s.active && new Date(s.subscribed_at).getTime() > monthAgo).length;

        view.innerHTML = `
            <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
                <div class="card kpi"><div class="label">${ICON.users}Activos</div><div class="value">${active}</div><div class="sub">Reciben los avisos de productos nuevos</div></div>
                <div class="card kpi"><div class="label">${ICON.plus}Últimos 30 días</div><div class="value">${recent}</div><div class="sub">Nuevas suscripciones</div></div>
                <div class="card kpi"><div class="label">${ICON.close}Dados de baja</div><div class="value">${this.subs.length - active}</div><div class="sub">Desde el link de los correos</div></div>
            </div>
            <div class="toolbar"><label class="search">${ICON.search}<input type="search" id="subsSearch" placeholder="Buscar correo" value="${U.esc(this.query)}"></label></div>
            <div class="card" id="subsCard"></div>`;

        document.getElementById('subsSearch').addEventListener('input', U.debounce(e => { this.query = e.target.value; this.renderList(); }, 150));
        document.getElementById('subsCsv').addEventListener('click', () => this.exportCsv());
        document.getElementById('subsCard').addEventListener('click', async (e) => {
            const b = e.target.closest('[data-toggle]');
            if (!b) return;
            const s = this.subs.find(x => x.id === +b.dataset.toggle);
            const { error } = await supabaseClient.from('subscribers').update({ active: !s.active }).eq('id', s.id);
            if (error) return UI.toast('No se pudo cambiar: ' + error.message, 'error');
            s.active = !s.active;
            UI.toast(s.active ? 'Suscripción reactivada' : 'Suscripción desactivada');
            this.renderList();
        });
        this.renderList();
    },

    renderList() {
        const q = U.normalize(this.query);
        const list = this.subs.filter(s => !q || U.normalize(s.email).includes(q));
        const card = document.getElementById('subsCard');
        if (!list.length) {
            card.innerHTML = U.empty('mail', this.subs.length ? 'Sin resultados' : 'Aún no hay suscriptores',
                this.subs.length ? 'Ningún correo coincide con la búsqueda.' : 'Cuando alguien se una al club desde la tienda, aparecerá aquí.');
            return;
        }
        card.innerHTML = `<div class="table-wrap"><table class="table responsive">
            <thead><tr><th>Correo</th><th>Estado</th><th>Desde</th><th></th></tr></thead>
            <tbody>${list.map(s => `<tr>
                <td class="cell-primary"><strong>${U.esc(s.email)}</strong></td>
                <td data-label="Estado">${s.active ? '<span class="pill ok">Activo</span>' : '<span class="pill off">De baja</span>'}</td>
                <td data-label="Desde" class="muted nowrap">${U.date(s.subscribed_at)}</td>
                <td class="actions"><button class="btn btn-ghost btn-sm" data-toggle="${s.id}">${s.active ? 'Desactivar' : 'Reactivar'}</button></td>
            </tr>`).join('')}</tbody></table></div>`;
    },

    exportCsv() {
        const rows = [['Correo', 'Estado', 'Fecha']].concat(this.subs.map(s => [s.email, s.active ? 'Activo' : 'De baja', new Date(s.subscribed_at).toLocaleDateString('es-CL')]));
        const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `suscriptores-popflame-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }
};
