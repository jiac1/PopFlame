// ============================================================
// PopFlame · Panel de administración — núcleo
// Sesión, menú, navegación, avisos, diálogos, editor lateral y utilidades.
// Las secciones (Views.*) viven en views-ventas.js, views-catalogo.js y views-sitio.js.
// Requiere ../js/supabaseClient.js cargado antes.
// ============================================================

const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></svg>',
    shirt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 01-8 0z"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z"/></svg>',
    page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14a6.5 6.5 0 013.5 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 01-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 012.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0012.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 005.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 00-3.48-8.41z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 12h6"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>'
};

const ORDER_STATUS = {
    pending: { label: 'Pendiente de pago', short: 'Pendiente' },
    confirmed: { label: 'Pagado', short: 'Pagado' },
    processing: { label: 'Pagado · en preparación', short: 'En preparación' },
    shipped: { label: 'Listo para entregar', short: 'Listo' },
    delivered: { label: 'Entregado', short: 'Entregado' },
    cancelled: { label: 'Cancelado', short: 'Cancelado' }
};
const PAID_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', pending: 'Pendiente' };

// ============================================================
// Sesión
// ============================================================
const AdminAuth = {
    async getActiveProfile() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return null;
            const { data: profile, error } = await supabaseClient
                .from('profiles').select('*').eq('id', session.user.id).maybeSingle();
            if (error || !profile || !['admin', 'super_admin'].includes(profile.role)) return null;
            return profile;
        } catch (e) {
            return null;
        }
    },

    async requireAuth() {
        const profile = await this.getActiveProfile();
        if (!profile) {
            location.replace('index.html');
            return null;
        }
        return profile;
    },

    async login(username, password) {
        if (!username || !password) throw new Error('Ingresa tu usuario y contraseña.');

        const { data: email, error: rpcErr } = await supabaseClient.rpc('email_for_username', { p_username: username });
        if (rpcErr) throw new Error('No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
        if (!email) throw new Error('Usuario o contraseña incorrectos.');

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Usuario o contraseña incorrectos.');

        const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
        if (!profile || profile.role === 'pending') {
            await supabaseClient.auth.signOut();
            throw new Error('Tu cuenta todavía no está aprobada. Pídele a un Super Admin que la active.');
        }
    },

    async logout() {
        await supabaseClient.auth.signOut();
        location.replace('index.html');
    }
};

// ============================================================
// Utilidades
// ============================================================
const U = {
    esc(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    money(n) { return '$' + Math.round(Number(n || 0)).toLocaleString('es-CL'); },
    date(d) { return new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }); },
    dateTime(d) {
        return new Date(d).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    },
    ago(d) {
        const s = (Date.now() - new Date(d).getTime()) / 1000;
        if (s < 60) return 'hace un momento';
        if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
        if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
        if (s < 86400 * 7) { const n = Math.floor(s / 86400); return `hace ${n} día${n === 1 ? '' : 's'}`; }
        return U.date(d);
    },
    img(path) {
        if (!path) return '../images/products/poleras/placeholder.svg';
        if (/^(https?:)?\/\//i.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return path;
        return '../' + path.replace(/^\/+/, '');
    },
    isVideo: (url) => /\.(mp4|webm|mov)(\?.*)?$/i.test(url || ''),
    int(v) { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return isNaN(n) ? null : n; },
    debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    slug(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    },
    initials(s) { return String(s || '?').replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '?'; },
    normalize(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); },

    // Teléfono chileno -> solo dígitos con 56 (formato que acepta wa.me)
    waNumber(phone) {
        let d = String(phone || '').replace(/\D/g, '');
        if (!d) return '';
        if (d.length === 9 && d.startsWith('9')) d = '56' + d;
        if (d.length === 8) d = '569' + d;
        return d;
    },
    waLink(phone, text) {
        const n = U.waNumber(phone);
        return n ? `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}` : '';
    },

    skeleton(rows = 6) {
        return `<div class="card"><div class="skeleton-rows">${'<div class="skeleton"></div>'.repeat(rows)}</div></div>`;
    },
    empty(icon, title, text, action = '') {
        return `<div class="empty">${ICON[icon] || ''}<h3>${title}</h3>${text ? `<p>${text}</p>` : ''}${action}</div>`;
    },
    errorBox(err) {
        return `<div class="card">${U.empty('alert', 'No pudimos cargar esta sección', U.esc(err?.message || 'Revisa tu conexión e intenta de nuevo.'),
            '<button class="btn btn-ghost" onclick="Admin.route()">Reintentar</button>')}</div>`;
    },

    colorMap: {
        'negro': '#0B0B0B', 'blanco': '#FFFFFF', 'gris': '#8C8C8C', 'rojo': '#E31837', 'azul': '#1E3A8A',
        'celeste': '#7DC3E8', 'verde': '#166534', 'verde militar': '#4B5320', 'amarillo': '#EAB308',
        'naranjo': '#EA580C', 'café': '#5C3A21', 'cafe': '#5C3A21', 'beige': '#D8C3A0', 'rosado': '#F472B6',
        'morado': '#7C3AED', 'dorado': '#D4AF37', 'plateado': '#C9CCD1', 'crema': '#F2EBD9', 'vino': '#722F37'
    },
    swatch(name) { return U.colorMap[String(name || '').trim().toLowerCase()] || '#CCCCCC'; }
};

// ============================================================
// Datos compartidos entre secciones (se cargan una vez y se refrescan al guardar)
// ============================================================
const Data = {
    categories: null,
    config: null,

    async categoriesList(force) {
        if (!this.categories || force) {
            const { data, error } = await supabaseClient.from('categories').select('*').order('sort_order');
            if (error) throw error;
            this.categories = data || [];
        }
        return this.categories;
    },
    catName(id) { return (this.categories || []).find(c => c.id === id)?.name || id; },

    async configRow(force) {
        if (!this.config || force) {
            const { data, error } = await supabaseClient.from('config').select('*').eq('id', 1).maybeSingle();
            if (error) throw error;
            this.config = data || {};
        }
        return this.config;
    }
};

// ============================================================
// Interfaz: avisos, diálogos y editor lateral
// ============================================================
const UI = {
    toast(message, type = 'ok') {
        const box = document.getElementById('toasts');
        if (!box) return;
        const el = document.createElement('div');
        el.className = 'toast' + (type === 'error' ? ' is-error' : '');
        el.innerHTML = `${type === 'error' ? ICON.alert : ICON.check}<span>${U.esc(message)}</span>`;
        box.appendChild(el);
        setTimeout(() => {
            el.classList.add('is-leaving');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }, type === 'error' ? 4500 : 2600);
    },

    // Reemplazo de confirm(): devuelve una promesa true/false
    confirm({ title, text = '', ok = 'Confirmar', danger = true } = {}) {
        return new Promise(resolve => {
            const d = document.getElementById('dialog');
            document.getElementById('dialogTitle').textContent = title;
            document.getElementById('dialogText').textContent = text;
            document.getElementById('dialogIcon').innerHTML = danger ? ICON.trash : ICON.info;
            document.getElementById('dialogIcon').style.cssText = danger ? '' : 'background:var(--blue-soft);color:var(--blue)';
            const okBtn = document.getElementById('dialogOk');
            const cancel = document.getElementById('dialogCancel');
            okBtn.textContent = ok;
            okBtn.className = 'btn ' + (danger ? 'btn-red' : 'btn-dark');
            d.classList.add('is-open');
            d.setAttribute('aria-hidden', 'false');
            setTimeout(() => cancel.focus(), 50);

            // Escape cierra solo el diálogo (captura + stopImmediatePropagation para que no cierre también el editor)
            const onKey = (e) => {
                if (e.key !== 'Escape') return;
                e.stopImmediatePropagation();
                done(false);
            };
            const done = (val) => {
                d.classList.remove('is-open');
                d.setAttribute('aria-hidden', 'true');
                okBtn.onclick = cancel.onclick = d.onclick = null;
                document.removeEventListener('keydown', onKey, true);
                resolve(val);
            };
            okBtn.onclick = () => done(true);
            cancel.onclick = () => done(false);
            d.onclick = (e) => { if (e.target === d) done(false); };
            document.addEventListener('keydown', onKey, true);
        });
    },

    sheetState: null,

    // Abre el editor lateral. isDirty() evita cerrar con cambios sin guardar.
    openSheet({ title, body, foot = '', wide = false, isDirty = null, onOpen = null }) {
        const sheet = document.getElementById('sheet');
        document.getElementById('sheetTitle').innerHTML = title;
        document.getElementById('sheetBody').innerHTML = body;
        document.getElementById('sheetFoot').innerHTML = foot;
        document.getElementById('sheetFoot').hidden = !foot;
        document.getElementById('sheetBody').scrollTop = 0;
        sheet.classList.toggle('is-wide', wide);
        sheet.classList.add('is-open');
        sheet.setAttribute('aria-hidden', 'false');
        document.getElementById('sheetOverlay').classList.add('is-open');
        document.body.classList.add('no-scroll');
        this.sheetState = { isDirty, lastFocus: document.activeElement };
        onOpen && onOpen(sheet);
        setTimeout(() => sheet.querySelector('input:not([type=hidden]):not([type=file]):not([type=checkbox]), textarea, select')?.focus({ preventScroll: true }), 80);
    },

    async closeSheet(force = false) {
        const sheet = document.getElementById('sheet');
        if (!sheet.classList.contains('is-open')) return true;
        if (!force && this.sheetState?.isDirty?.()) {
            const ok = await this.confirm({ title: '¿Salir sin guardar?', text: 'Tienes cambios que no se han guardado.', ok: 'Salir sin guardar' });
            if (!ok) return false;
        }
        sheet.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        document.getElementById('sheetOverlay').classList.remove('is-open');
        document.body.classList.remove('no-scroll');
        this.sheetState?.lastFocus?.focus?.({ preventScroll: true });
        this.sheetState = null;
        return true;
    },

    setLoading(btn, on) {
        if (!btn) return;
        btn.classList.toggle('is-loading', on);
        btn.disabled = on;
    },

    // Serializa los campos con [name] de un contenedor (para detectar cambios sin guardar)
    snapshot(root) {
        return JSON.stringify([...root.querySelectorAll('[name]')].map(el =>
            el.type === 'checkbox' ? el.checked : el.value));
    }
};

// ============================================================
// Subida de imágenes (con compresión automática)
// ============================================================
const Uploads = {
    async compress(file, maxSide = 2000) {
        if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || typeof createImageBitmap !== 'function') return file;
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
            const w = Math.round(bitmap.width * scale);
            const h = Math.round(bitmap.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, w, h);

            // Si tiene transparencia se mantiene PNG para no perder el fondo transparente
            let transparent = false;
            if (file.type !== 'image/jpeg') {
                const px = ctx.getImageData(0, 0, w, h).data;
                const step = Math.max(4, Math.floor(px.length / 4 / 20000) * 4);
                for (let i = 3; i < px.length; i += step) { if (px[i] < 250) { transparent = true; break; } }
            }
            const type = transparent ? 'image/png' : 'image/jpeg';
            const blob = await new Promise(r => canvas.toBlob(r, type, 0.85));
            if (!blob || (blob.size >= file.size && scale === 1)) return file;
            return new File([blob], file.name.replace(/\.[^.]+$/, '') + (transparent ? '.png' : '.jpg'), { type });
        } catch (e) {
            console.warn('No se pudo comprimir la imagen, se sube la original:', e);
            return file;
        }
    },

    async upload(bucket, file) {
        if (!file) return null;
        const maxMb = bucket === 'site-assets' ? 50 : 10;
        file = await this.compress(file);
        if (file.size > maxMb * 1024 * 1024) throw new Error(`El archivo pesa más de ${maxMb} MB.`);
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabaseClient.storage.from(bucket).upload(path, file, { upsert: false, cacheControl: '31536000' });
        if (error) throw error;
        return supabaseClient.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    }
};

// ============================================================
// Panel: menú, navegación y secciones
// ============================================================
const Views = {};

const Admin = {
    profile: null,
    current: null,

    nav: [
        { id: 'resumen', label: 'Resumen', icon: 'home' },
        { id: 'pedidos', label: 'Pedidos', icon: 'orders', badge: true },
        { id: 'inventario', label: 'Inventario', icon: 'stock' },
        { id: 'productos', label: 'Productos', icon: 'shirt' },
        { id: 'banners', label: 'Banners', icon: 'image' },
        { id: 'tallas', label: 'Guía de tallas', icon: 'ruler' },
        { title: 'Super Admin', superOnly: true },
        { id: 'categorias', label: 'Categorías', icon: 'folder', superOnly: true },
        { id: 'suscriptores', label: 'Suscriptores', icon: 'mail', superOnly: true },
        { id: 'paginas', label: 'Páginas', icon: 'page', superOnly: true },
        { id: 'configuracion', label: 'Configuración', icon: 'settings', superOnly: true },
        { id: 'usuarios', label: 'Usuarios', icon: 'users', superOnly: true }
    ],

    isSuper() { return this.profile?.role === 'super_admin'; },

    async init(profile) {
        this.profile = profile;
        const name = profile.name || profile.username;
        document.getElementById('meName').textContent = name;
        document.getElementById('meRole').textContent = ROLE_LABEL[profile.role] || profile.role;
        document.getElementById('meAvatar').textContent = U.initials(name);

        document.getElementById('nav').innerHTML = this.nav
            .filter(i => !i.superOnly || this.isSuper())
            .map(i => i.title
                ? `<div class="nav-title">${i.title}</div>`
                : `<a href="#${i.id}" data-view="${i.id}">${ICON[i.icon]}<span>${i.label}</span>${i.badge ? '<span class="badge-count" id="pendingBadge" hidden></span>' : ''}</a>`)
            .join('');

        this.bind();
        this.loadBrand();
        this.refreshBadge();
        setInterval(() => this.refreshBadge(), 60000);
        this.route();
    },

    bind() {
        window.addEventListener('hashchange', () => this.route());
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            if (await UI.confirm({ title: '¿Cerrar sesión?', ok: 'Cerrar sesión', danger: false })) AdminAuth.logout();
        });
        const sidebar = document.getElementById('sidebar');
        const scrim = document.getElementById('scrim');
        const toggle = (open) => { sidebar.classList.toggle('is-open', open); scrim.classList.toggle('is-open', open); };
        document.getElementById('menuBtn').addEventListener('click', () => toggle(true));
        scrim.addEventListener('click', () => toggle(false));
        document.getElementById('nav').addEventListener('click', () => toggle(false));

        document.getElementById('sheetOverlay').addEventListener('click', () => UI.closeSheet());
        document.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) UI.closeSheet(); });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('dialog').classList.contains('is-open')) return;
            if (document.getElementById('sheet').classList.contains('is-open')) UI.closeSheet();
            else toggle(false);
        });

        // Si la sesión expira en otra pestaña, volver al login
        supabaseClient.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') location.replace('index.html');
        });

        window.addEventListener('beforeunload', (e) => {
            if (UI.sheetState?.isDirty?.() || Views[this.current]?.isDirty?.()) { e.preventDefault(); e.returnValue = ''; }
        });
    },

    async loadBrand() {
        try {
            const cfg = await Data.configRow();
            if (cfg.logo_url) {
                const el = document.getElementById('brandLogo');
                if (U.isVideo(cfg.logo_url)) {
                    const v = document.createElement('video');
                    Object.assign(v, { src: cfg.logo_url, autoplay: true, loop: true, muted: true, playsInline: true });
                    v.className = 'logo';
                    el.replaceWith(v);
                } else {
                    el.src = cfg.logo_url;
                }
            }
        } catch (e) { /* se queda con el logo por defecto */ }
    },

    lastPending: null,

    // Contador de pedidos por pagar (se revisa cada minuto). Si llega uno nuevo con el panel
    // abierto, avisa con un mensaje y con el número en la pestaña del navegador.
    async refreshBadge() {
        const { count, error } = await supabaseClient.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending');
        if (error) return;
        const b = document.getElementById('pendingBadge');
        if (b) {
            b.hidden = !count;
            b.textContent = count > 99 ? '99+' : count;
        }
        if (this.lastPending !== null && count > this.lastPending) {
            const n = count - this.lastPending;
            UI.toast(n === 1 ? '¡Nuevo pedido recibido!' : `¡${n} pedidos nuevos!`);
            if ((this.current === 'pedidos' || this.current === 'resumen') && !UI.sheetState) this.route();
        }
        this.lastPending = count;
        document.title = document.title.replace(/^\(\d+\+?\)\s*/, '');
        if (count) document.title = `(${count}) ${document.title}`;
    },

    async route() {
        let id = (location.hash || '#resumen').slice(1).split('?')[0];
        const item = this.nav.find(n => n.id === id);
        if (!item || (item.superOnly && !this.isSuper()) || !Views[id]) id = 'resumen';

        if (UI.sheetState && !(await UI.closeSheet())) {
            history.replaceState(null, '', '#' + this.current);
            return;
        }
        // Secciones con formularios propios (Páginas, Configuración) avisan antes de salir con cambios
        const leaving = Views[this.current];
        if (this.current && this.current !== id && leaving?.isDirty?.() &&
            !(await UI.confirm({ title: '¿Salir sin guardar?', text: 'Tienes cambios que no se han guardado en esta sección.', ok: 'Salir sin guardar' }))) {
            history.replaceState(null, '', '#' + this.current);
            return;
        }

        this.current = id;
        document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('is-active', a.dataset.view === id));
        const view = document.getElementById('view');
        view.onclick = null;
        view.innerHTML = U.skeleton();
        window.scrollTo(0, 0);
        try {
            await Views[id].render(view);
        } catch (e) {
            console.error(e);
            view.innerHTML = U.errorBox(e);
        }
        document.title = `${this.lastPending ? `(${this.lastPending}) ` : ''}${document.getElementById('pageTitle').textContent} | Panel PopFlame`;
    },

    header(title, sub = '', actions = '') {
        document.getElementById('pageTitle').textContent = title;
        document.getElementById('pageSub').textContent = sub;
        document.getElementById('pageActions').innerHTML = actions;
    },

    go(hash) {
        if (location.hash === '#' + hash) this.route();
        else location.hash = hash;
    }
};

// Compatibilidad con la página de login anterior
const AdminPanel = { init: (p) => Admin.init(p) };
