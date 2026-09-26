// Núcleo de la tienda: se encarga de todo lo común a las páginas (menús, buscador, carrito,
// newsletter, redes, animaciones) y le entrega los datos a la página actual.
//
// Cada página llama a Site.start({ render(data, { fresh }) { ... } }).
// render() se ejecuta al instante con el cache y otra vez si Supabase trae datos nuevos.

const UI = {
    openLayer: null,
    lastFocus: null,

    toast(message, type = 'ok') {
        const stack = document.getElementById('toastStack');
        if (!stack) return;
        const el = document.createElement('div');
        el.className = 'toast' + (type === 'error' ? ' is-error' : '');
        el.innerHTML = `${type === 'error' ? PF.icons.alert : PF.icons.check}<span>${PF.escape(message)}</span>`;
        stack.appendChild(el);
        setTimeout(() => {
            el.classList.add('is-leaving');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }, 2800);
    },

    // Abre un panel (menú, carrito, buscador, modal) con overlay, bloqueo de scroll y foco accesible.
    open(id) {
        const el = document.getElementById(id);
        if (!el) return;
        if (this.openLayer && this.openLayer !== el) this.close(true);
        this.lastFocus = document.activeElement;
        this.openLayer = el;
        el.classList.add('is-open');
        el.setAttribute('aria-hidden', 'false');
        if (!el.classList.contains('modal') && !el.classList.contains('lightbox')) {
            document.getElementById('overlay')?.classList.add('is-open');
        }
        document.body.classList.add('no-scroll');
        const trigger = document.querySelector(`[aria-controls="${id}"]`);
        trigger?.setAttribute('aria-expanded', 'true');
        const focusTarget = el.querySelector('input:not([type=hidden]), [data-autofocus], button, a');
        setTimeout(() => focusTarget?.focus({ preventScroll: true }), 60);
    },

    close(silent) {
        const el = this.openLayer;
        if (!el) return;
        el.classList.remove('is-open');
        el.setAttribute('aria-hidden', 'true');
        document.getElementById('overlay')?.classList.remove('is-open');
        document.body.classList.remove('no-scroll');
        document.querySelector(`[aria-controls="${el.id}"]`)?.setAttribute('aria-expanded', 'false');
        this.openLayer = null;
        if (!silent) this.lastFocus?.focus?.({ preventScroll: true });
    }
};

const Site = {
    pageHandlers: null,
    revealObserver: null,

    start(handlers = {}) {
        this.pageHandlers = handlers;
        // Espera a que layout.js haya agregado el menú, carrito y footer (se agregan al terminar de leer el HTML).
        const run = () => this.boot();
        if (PF.shellReady) run();
        else document.addEventListener('pf:shell', run, { once: true });
    },

    async boot() {
        CartManager.init();
        this.bindShell();
        this.setupHeaderScroll();
        this.setupAdminShortcut();

        await ProductsManager.load((store, meta) => {
            this.applyConfig(store.config);
            this.renderCategoryLinks();
            CartManager.sync();
            try {
                this.pageHandlers?.render?.(store, meta);
            } catch (e) {
                console.error('Error al pintar la página:', e);
            }
            this.observeReveals();
            if (UI.openLayer?.id === 'searchPanel') this.runSearch(document.getElementById('searchInput').value);
        });
    },

    // ===== Header / menús =====
    bindShell() {
        document.addEventListener('click', (e) => {
            const t = e.target;
            if (t.closest('#menuOpen')) return UI.open('mobileMenu');
            if (t.closest('#cartOpen')) return UI.open('cartDrawer');
            if (t.closest('#searchOpen')) { UI.open('searchPanel'); this.runSearch(''); return; }
            if (t.closest('[data-close]') || t.id === 'overlay' || t.classList.contains('modal-backdrop')) return UI.close();

            const qty = t.closest('[data-cart-qty]');
            if (qty) return CartManager.updateQuantity(+qty.dataset.cartQty, +qty.dataset.delta);
            const rm = t.closest('[data-cart-remove]');
            if (rm) return CartManager.removeFromCart(+rm.dataset.cartRemove);

            // Links dentro de menús cierran el panel
            if (t.closest('.drawer a, .search-panel a') && UI.openLayer) UI.close(true);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && UI.openLayer) UI.close();
            if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !/input|textarea|select/i.test(document.activeElement.tagName)) {
                e.preventDefault();
                UI.open('searchPanel');
                this.runSearch('');
            }
        });

        const input = document.getElementById('searchInput');
        let timer;
        input?.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => this.runSearch(input.value), 120);
        });
        document.getElementById('searchForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const first = document.querySelector('#searchResults .product-card');
            if (first) window.location.href = first.href;
        });

        this.setupNewsletter();
    },

    setupHeaderScroll() {
        const header = document.getElementById('siteHeader');
        if (!header) return;
        const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    },

    runSearch(query) {
        const box = document.getElementById('searchResults');
        if (!box) return;
        const q = query.trim();
        const cats = ProductsManager.getVisibleCategories();

        if (!q) {
            const popular = ProductsManager.getFeaturedProducts().slice(0, 4);
            box.innerHTML = `
                <span class="eyebrow">Categorías</span>
                <div class="search-suggestions">
                    ${cats.map(c => `<a class="chip" href="${PF.url('pages/categoria.html?cat=' + encodeURIComponent(c.id))}">${PF.escape(c.name)}</a>`).join('')}
                    <a class="chip" href="${PF.url('pages/categoria.html')}">Ver todo</a>
                </div>
                ${popular.length ? `<div style="margin-top:36px"><span class="eyebrow">Destacados</span><div class="product-grid" style="margin-top:16px">${popular.map(p => ProductsManager.createProductCard(p)).join('')}</div></div>` : ''}`;
            return;
        }

        const results = ProductsManager.searchProducts(q);
        box.innerHTML = results.length
            ? `<span class="eyebrow">${results.length} resultado${results.length === 1 ? '' : 's'}</span>
               <div class="product-grid" style="margin-top:16px">${results.slice(0, 12).map(p => ProductsManager.createProductCard(p)).join('')}</div>`
            : `<p class="search-hint">No encontramos productos para "<strong>${PF.escape(q)}</strong>". Prueba con otra palabra o <a href="${PF.url('pages/categoria.html')}">mira todo el catálogo</a>.</p>`;
    },

    // ===== Datos de configuración =====
    applyConfig(cfg = {}) {
        if (cfg.logoUrl) {
            document.querySelectorAll('.brand').forEach(brand => {
                const current = brand.querySelector('.brand-logo');
                if (current && current.getAttribute('src') === cfg.logoUrl) return;
                brand.innerHTML = PF.logoHtml(cfg.logoUrl, 'brand-logo');
            });
        }

        const announce = document.getElementById('announce');
        if (announce) {
            const items = PF.announcements(cfg);
            const row = items.map(t => `<span class="announce-item">${PF.escape(t)}</span>`).join('');
            const html = `<div class="announce-track">${row}${row}</div>`;
            if (announce.innerHTML !== html) announce.innerHTML = html;
        }

        const socials = this.socialLinks(cfg);
        document.querySelectorAll('[data-social-list]').forEach(el => {
            el.innerHTML = socials.map(s => `<a href="${PF.escape(s.url)}" target="_blank" rel="noopener">${s.label}</a>`).join('')
                || '<a href="#" aria-disabled="true">Pronto</a>';
        });
        const icons = document.getElementById('footerSocial');
        if (icons) {
            icons.innerHTML = socials.map(s =>
                `<a href="${PF.escape(s.url)}" target="_blank" rel="noopener" aria-label="${s.label}">${PF.icons[s.icon]}</a>`).join('');
        }
    },

    socialLinks(cfg = {}) {
        const out = [];
        const s = cfg.socialLinks || {};
        if (s.instagram) out.push({ label: 'Instagram', url: s.instagram, icon: 'instagram' });
        if (s.tiktok) out.push({ label: 'TikTok', url: s.tiktok, icon: 'tiktok' });
        if (s.twitter) out.push({ label: 'X / Twitter', url: s.twitter, icon: 'twitter' });
        const wa = CartManager.whatsappLink();
        if (wa) out.push({ label: 'WhatsApp', url: wa, icon: 'whatsapp' });
        return out;
    },

    renderCategoryLinks() {
        const cats = ProductsManager.getVisibleCategories();
        const active = new URLSearchParams(location.search).get('cat');
        const catUrl = (c) => PF.url('pages/categoria.html?cat=' + encodeURIComponent(c.id));

        const nav = document.getElementById('mainNav');
        if (nav) {
            nav.innerHTML = cats.map(c =>
                `<a href="${catUrl(c)}" class="${PF.page === 'category' && active === c.id ? 'is-active' : ''}">${PF.escape(c.name)}</a>`).join('');
        }

        const mobile = document.getElementById('mobileNav');
        if (mobile) {
            mobile.innerHTML = cats.map(c => `<a href="${catUrl(c)}">${PF.escape(c.name)} ${PF.icons.arrowRight}</a>`).join('')
                + `<a href="${PF.url('pages/categoria.html')}">Ver todo ${PF.icons.arrowRight}</a>`;
        }

        const footer = document.getElementById('footerCats');
        if (footer) {
            footer.innerHTML = cats.map(c => `<a href="${catUrl(c)}">${PF.escape(c.name)}</a>`).join('')
                + `<a href="${PF.url('pages/categoria.html')}">Ver todo</a>`;
        }
    },

    // ===== Newsletter =====
    setupNewsletter() {
        const form = document.getElementById('newsForm');
        if (!form) return;
        const msg = document.getElementById('newsMsg');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = form.querySelector('input');
            const email = input.value.trim().toLowerCase();
            msg.className = 'news-msg';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
                msg.textContent = 'Ingresa un correo válido.';
                msg.classList.add('is-error');
                input.focus();
                return;
            }
            const btn = form.querySelector('button');
            btn.disabled = true;
            try {
                const { error } = await supabaseClient.from('subscribers').insert({ email });
                if (error && error.code !== '23505') throw error;
                if (!error) supabaseClient.functions.invoke('welcome-email', { body: { email } }).catch(() => {});
                msg.textContent = error ? 'Ya estabas suscrito. ¡Gracias por seguirnos!' : '¡Listo! Ya eres parte del club PopFlame.';
                msg.classList.add('is-ok');
                form.reset();
            } catch (err) {
                msg.textContent = 'No pudimos guardar tu correo. Intenta de nuevo en unos segundos.';
                msg.classList.add('is-error');
            } finally {
                btn.disabled = false;
            }
        });
    },

    // ===== Animaciones de entrada =====
    observeReveals() {
        const els = document.querySelectorAll('.reveal:not(.is-in)');
        if (!els.length) return;
        if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
        if (!this.revealObserver) {
            this.revealObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-in');
                        this.revealObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        }
        els.forEach(el => this.revealObserver.observe(el));
    },

    // Botón flotante al panel: solo con sesión de admin activa (los clientes nunca lo ven).
    async setupAdminShortcut() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return;
            const a = document.createElement('a');
            a.href = PF.url('admin/panel.html');
            a.className = 'admin-shortcut';
            a.innerHTML = `${PF.icons.settings}<span>Panel</span>`;
            document.body.appendChild(a);
        } catch (e) { /* sin sesión */ }
    },

    getUrlParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    },

    setMeta(title, description, image) {
        if (title) document.title = title;
        const set = (sel, attr, val) => { const el = document.querySelector(sel); if (el && val) el.setAttribute(attr, val); };
        set('meta[name="description"]', 'content', description);
        set('meta[property="og:title"]', 'content', title);
        set('meta[property="og:description"]', 'content', description);
        set('meta[property="og:image"]', 'content', image);
    }
};

// Compatibilidad con código anterior que usaba App.*
const App = {
    escapeHtml: (s) => PF.escape(s),
    getUrlParam: (n) => Site.getUrlParam(n)
};
