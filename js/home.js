// Portada: carrusel del hero (tabla banners), "Lo nuevo", categorías, destacados y bloque de Instagram.
const Home = {
    bannersKey: 'pf_banners_cache',
    banners: null,

    init() {
        // Skeleton mientras llegan los productos (solo si no hay cache)
        const rail = document.getElementById('newRail');
        if (rail && !rail.children.length) rail.innerHTML = ProductsManager.skeletonCards(4);

        this.loadBanners();
        Site.start({ render: (store) => this.render(store) });
    },

    render(store) {
        if (!this.banners) this.renderHero(this.readBannerCache());
        this.renderNew(store);
        this.renderCategories(store);
        this.renderFeatured(store);
        this.renderSocial(store.config);
        this.fixEditorialLinks();
    },

    // ===== Hero =====
    readBannerCache() {
        try { return JSON.parse(localStorage.getItem(this.bannersKey) || 'null'); } catch (e) { return null; }
    },

    async loadBanners() {
        const cached = this.readBannerCache();
        if (cached) this.renderHero(cached);
        const wait = () => new Promise(r => (typeof supabaseClient !== 'undefined' ? r() : document.addEventListener('DOMContentLoaded', r, { once: true })));
        await wait();
        try {
            const { data, error } = await supabaseClient.from('banners').select('*').eq('active', true).order('sort_order');
            if (error) throw error;
            const sig = JSON.stringify(data);
            if (sig !== JSON.stringify(cached)) {
                try { localStorage.setItem(this.bannersKey, sig); } catch (e) { /* ignorado */ }
                this.renderHero(data);
            }
            this.banners = data;
        } catch (e) {
            if (!cached) this.renderHero([]);
        }
    },

    heroSlides(banners) {
        if (banners && banners.length) {
            return banners.map(b => ({
                media: b.media_url,
                title: b.title,
                subtitle: b.subtitle,
                link: b.link_url
            }));
        }
        // Sin banners cargados: usa el hero único de la configuración o una foto de la marca.
        const cfg = ProductsManager.config || {};
        return [{
            media: cfg.heroBannerUrl || PF.url('images/hero-banner.jpg'),
            title: cfg.heroTitle || 'Nueva colección',
            subtitle: cfg.heroSubtitle || 'Streetwear que quema'
        }];
    },

    resolveLink(link) {
        if (!link) return PF.url('pages/categoria.html');
        if (/^(https?:)?\/\//i.test(link) || link.startsWith('#')) return link;
        return PF.url(link);
    },

    renderHero(banners) {
        const wrap = document.getElementById('heroSlides');
        if (!wrap) return;
        const slides = this.heroSlides(banners);
        const sig = JSON.stringify(slides);
        if (wrap.dataset.sig === sig) return;
        wrap.dataset.sig = sig;

        wrap.innerHTML = slides.map((s, i) => {
            const isVideo = PF.isVideo(s.media);
            // PNG = normalmente recorte con fondo transparente (ej. el colgante): se muestra completo.
            const contain = /\.png(\?.*)?$/i.test(s.media || '');
            const media = isVideo
                ? `<video src="${PF.escape(s.media)}" autoplay loop muted playsinline preload="metadata"></video>`
                : `<img src="${PF.escape(s.media)}" alt="${PF.escape(s.title || 'PopFlame')}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
            const Tag = i === 0 ? 'h1' : 'h2';
            return `
                <div class="hero-slide${i === 0 ? ' is-active' : ''}" aria-roledescription="slide" aria-label="${i + 1} de ${slides.length}">
                    <div class="hero-media${contain ? ' is-contain' : ''}">${media}</div>
                    <div class="hero-shade"></div>
                    <div class="hero-content container">
                        <span class="eyebrow">PopFlame · Streetwear chileno</span>
                        <${Tag} class="hero-title display">${PF.escape(s.title || 'PopFlame')}</${Tag}>
                        ${s.subtitle ? `<p class="hero-sub">${PF.escape(s.subtitle)}</p>` : ''}
                        <div class="hero-actions">
                            <a href="${PF.escape(this.resolveLink(s.link))}" class="btn btn-light">Comprar ahora</a>
                            <a href="#novedades" class="btn btn-outline-light">Lo nuevo</a>
                        </div>
                    </div>
                </div>`;
        }).join('');

        HeroSlider.setup(slides.length);
    },

    // ===== Secciones =====
    renderNew(store) {
        const rail = document.getElementById('newRail');
        if (!rail) return;
        const products = [...store.products]
            .sort((a, b) => (b.stock > 0) - (a.stock > 0) || b.id - a.id)
            .slice(0, 8);
        if (!products.length) {
            rail.innerHTML = '';
            document.getElementById('novedades').hidden = true;
            return;
        }
        document.getElementById('novedades').hidden = false;
        ProductsManager.renderProducts(rail, products, { eagerCount: 2 });
    },

    renderCategories(store) {
        const section = document.getElementById('categorias');
        const grid = document.getElementById('catGrid');
        const cats = ProductsManager.getVisibleCategories();
        if (!grid || !cats.length) { if (section) section.hidden = true; return; }
        section.hidden = false;
        grid.style.setProperty('--cat-cols', Math.min(cats.length, 4));

        grid.innerHTML = cats.map((c, i) => {
            const products = ProductsManager.getProductsByCategory(c.id);
            const img = c.image || products[0]?.image;
            const media = img
                ? `<img src="${ProductsManager.resolveImagePath(img)}" alt="" loading="lazy" decoding="async">`
                : `<div class="cat-tile-empty"><span>${PF.escape(c.name.charAt(0))}</span></div>`;
            return `
                <a class="cat-tile reveal" style="transition-delay:${i * 60}ms" href="${PF.url('pages/categoria.html?cat=' + encodeURIComponent(c.id))}">
                    ${media}
                    <div class="cat-tile-body">
                        <div>
                            <h3>${PF.escape(c.name)}</h3>
                            <span class="cat-tile-count">${products.length} producto${products.length === 1 ? '' : 's'}</span>
                        </div>
                        <span class="cat-tile-arrow" aria-hidden="true">${PF.icons.arrowRight}</span>
                    </div>
                </a>`;
        }).join('');
    },

    renderFeatured(store) {
        const section = document.getElementById('destacados');
        const featured = store.products.filter(p => p.featured && p.stock > 0);
        // Con pocos productos esta sección solo repetiría "Lo nuevo": se muestra cuando aporta.
        if (!section || store.products.length <= 8 || featured.length < 4) { if (section) section.hidden = true; return; }
        section.hidden = false;
        ProductsManager.renderProducts('featuredGrid', featured.slice(0, 8));
    },

    renderSocial(cfg = {}) {
        const block = document.getElementById('socialBlock');
        const url = cfg.socialLinks?.instagram;
        if (!block) return;
        if (!url) { block.hidden = true; return; }
        const a = document.getElementById('socialHandle');
        a.href = url;
        a.textContent = '@' + PF.instagramHandle(url);
        block.hidden = false;
    },

    // Los bloques editoriales apuntan a una categoría: si esa categoría no tiene productos, van al catálogo completo.
    fixEditorialLinks() {
        document.querySelectorAll('[data-cat-link]').forEach(a => {
            const id = a.dataset.catLink;
            const visible = ProductsManager.getVisibleCategories().some(c => c.id === id);
            a.href = PF.url(visible ? `pages/categoria.html?cat=${id}` : 'pages/categoria.html');
            if (!visible) a.textContent = 'Ver colección';
        });
    }
};

const HeroSlider = {
    current: 0,
    count: 0,
    timer: null,
    intervalMs: 6500,

    setup(count) {
        this.count = count;
        this.current = 0;
        clearTimeout(this.timer);
        const controls = document.getElementById('heroControls');
        if (!controls) return;
        controls.hidden = count < 2;
        if (count < 2) return;

        document.getElementById('hero').style.setProperty('--hero-interval', this.intervalMs + 'ms');
        document.getElementById('heroProgress').innerHTML = Array.from({ length: count }, (_, i) =>
            `<button class="hero-bar${i === 0 ? ' is-active' : ''}" data-i="${i}" aria-label="Ir al banner ${i + 1}"><span></span></button>`).join('');
        const prev = document.getElementById('heroPrev');
        const next = document.getElementById('heroNext');
        prev.innerHTML = PF.icons.arrowLeft;
        next.innerHTML = PF.icons.arrowRight;

        if (!controls.dataset.bound) {
            controls.dataset.bound = '1';
            prev.addEventListener('click', () => this.go(this.current - 1));
            next.addEventListener('click', () => this.go(this.current + 1));
            controls.addEventListener('click', (e) => {
                const bar = e.target.closest('.hero-bar');
                if (bar) this.go(+bar.dataset.i);
            });
            this.bindSwipe();
            document.addEventListener('visibilitychange', () => document.hidden ? clearTimeout(this.timer) : this.schedule());
        }
        this.schedule();
    },

    bindSwipe() {
        const hero = document.getElementById('hero');
        let x0 = null;
        hero.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
        hero.addEventListener('touchend', e => {
            if (x0 === null) return;
            const dx = e.changedTouches[0].clientX - x0;
            if (Math.abs(dx) > 50) this.go(this.current + (dx < 0 ? 1 : -1));
            x0 = null;
        });
    },

    go(i) {
        if (this.count < 2) return;
        this.current = (i + this.count) % this.count;
        document.querySelectorAll('.hero-slide').forEach((s, n) => s.classList.toggle('is-active', n === this.current));
        document.querySelectorAll('.hero-bar').forEach((b, n) => {
            b.classList.remove('is-active', 'is-done');
            if (n < this.current) b.classList.add('is-done');
        });
        const active = document.querySelectorAll('.hero-bar')[this.current];
        if (active) { void active.offsetWidth; active.classList.add('is-active'); }
        this.schedule();
    },

    schedule() {
        clearTimeout(this.timer);
        if (this.count < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        this.timer = setTimeout(() => this.go(this.current + 1), this.intervalMs);
    }
};

Home.init();
