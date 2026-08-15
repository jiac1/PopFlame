// Main App
const App = {
    // Initialize app
    async init() {
        // Load products
        await ProductsManager.loadProducts();

        // Apply logo/banner/hero text configured from el panel de Super Admin
        this.applySiteConfig();

        // Categorías dinámicas: nav, footer y grid de la portada según lo que
        // exista realmente en Supabase (así una categoría nueva, ej. "chaquetas",
        // aparece sola sin tocar código)
        this.renderNav();
        this.renderFooterCategoryLinks();
        this.renderCategoriesGrid();

        // Initialize cart
        CartManager.init();

        // Setup mobile menu
        this.setupMobileMenu();

        // Render featured products on homepage
        this.renderFeaturedProducts();

        // Setup scroll animations
        this.setupScrollAnimations();

        // Setup newsletter form
        this.setupNewsletter();

        // Botón flotante al panel: solo aparece si hay una sesión de admin activa,
        // los clientes (sin sesión) nunca lo ven.
        this.setupAdminShortcut();

        // Carrusel del hero (solo en portada, y solo si hay banners cargados)
        HeroSlider.init();
    },

    // Muestra un botón flotante "Ir al panel" cuando hay sesión activa (útil mientras
    // subes imágenes/editas productos y quieres ver el resultado en la tienda al toque).
    async setupAdminShortcut() {
        if (typeof supabaseClient === 'undefined') return;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return;

            const adminBase = window.location.pathname.includes('/pages/') ? '../admin/' : 'admin/';
            const link = document.createElement('a');
            link.href = adminBase + 'panel.html';
            link.className = 'admin-shortcut-btn';
            link.textContent = '⚙ Ir al panel';
            document.body.appendChild(link);
        } catch (error) {
            // sin sesión o sin conexión: no se muestra nada
        }
    },

    // Reemplaza logo, banner y textos del hero con lo configurado en Supabase (si existe)
    applySiteConfig() {
        const config = ProductsManager.config;
        if (!config) return;

        this.applyMedia('.logo-img', config.logoUrl);
        this.applyMedia('.footer-logo', config.logoWhiteUrl);
        this.applyMedia('.hero-img', config.heroBannerUrl);

        const heroTitle = document.querySelector('.hero-title');
        if (heroTitle && config.heroTitle) heroTitle.textContent = config.heroTitle;

        const heroSubtitle = document.querySelector('.hero-subtitle');
        if (heroSubtitle && config.heroSubtitle) heroSubtitle.textContent = config.heroSubtitle;

        if (config.socialLinks) {
            const map = { instagram: 'Instagram', tiktok: 'TikTok', twitter: 'Twitter' };
            Object.entries(map).forEach(([key, label]) => {
                const url = config.socialLinks[key];
                if (!url) return;
                document.querySelectorAll('.footer-col a').forEach(a => {
                    if (a.textContent.trim() === label) a.href = url;
                });
            });
        }
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    },

    // Dónde está la carpeta pages/ visto desde la página actual
    pagesPrefix() {
        return window.location.pathname.includes('/pages/') ? '' : 'pages/';
    },

    // Reconstruye el menú de navegación con las categorías reales de Supabase
    // (en vez de los 4 links fijos que traía el sitio originalmente)
    renderNav() {
        if (!ProductsManager.categories || ProductsManager.categories.length === 0) return;
        const prefix = this.pagesPrefix();
        const linksHtml = ProductsManager.categories.map(c =>
            `<a href="${prefix}categoria.html?cat=${encodeURIComponent(c.id)}" class="nav-link">${this.escapeHtml(c.name)}</a>`
        ).join('');
        document.querySelectorAll('.nav').forEach(nav => { nav.innerHTML = linksHtml; });
    },

    // Igual que renderNav() pero para la columna "TIENDA" del footer
    renderFooterCategoryLinks() {
        if (!ProductsManager.categories || ProductsManager.categories.length === 0) return;
        const prefix = this.pagesPrefix();
        const linksHtml = ProductsManager.categories.map(c =>
            `<a href="${prefix}categoria.html?cat=${encodeURIComponent(c.id)}">${this.escapeHtml(c.name)}</a>`
        ).join('');
        document.querySelectorAll('.footer-col').forEach(col => {
            const h4 = col.querySelector('h4');
            if (h4 && h4.textContent.trim() === 'TIENDA') {
                col.innerHTML = '<h4>TIENDA</h4>' + linksHtml;
            }
        });
    },

    // Grid de categorías de la portada (solo existe en index.html)
    renderCategoriesGrid() {
        const grid = document.getElementById('categoriesGrid');
        if (!grid || !ProductsManager.categories || ProductsManager.categories.length === 0) return;

        const genericIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z"></path></svg>`;

        grid.innerHTML = ProductsManager.categories.map(c => `
            <a href="pages/categoria.html?cat=${encodeURIComponent(c.id)}" class="category-card">
                <div class="category-icon">${genericIcon}</div>
                <h3>${this.escapeHtml(c.name)}</h3>
            </a>
        `).join('');
    },

    // Reemplaza un <img> por un <video> en loop si la URL configurada es un video
    // (mismo <img>/<video> según lo que se haya subido en Configuración: logo, logo blanco o banner).
    applyMedia(selector, url) {
        if (!url) return;
        const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

        document.querySelectorAll(selector).forEach(el => {
            if (!isVideo) {
                if (el.tagName === 'VIDEO') return; // ya es video, no hay imagen que poner
                el.src = url;
                return;
            }
            if (el.tagName === 'VIDEO') { el.src = url; return; }

            const video = document.createElement('video');
            video.className = el.className;
            video.src = url;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.setAttribute('aria-label', el.alt || '');
            el.replaceWith(video);
        });
    },

    // Setup mobile menu
    setupMobileMenu() {
        const menuBtn = document.getElementById('menuBtn');
        const nav = document.querySelector('.nav');
        
        if (menuBtn && nav) {
            menuBtn.addEventListener('click', () => {
                nav.classList.toggle('active');
                menuBtn.classList.toggle('active');
            });
        }
    },

    // Render featured products
    renderFeaturedProducts() {
        const container = document.getElementById('featuredProducts');
        if (!container) return;

        const featured = ProductsManager.getFeaturedProducts();
        ProductsManager.renderProducts('featuredProducts', featured);
    },

    // Setup scroll animations
    setupScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animated');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('[data-animate]').forEach(el => {
            observer.observe(el);
        });
    },

    // Setup newsletter
    setupNewsletter() {
        const form = document.querySelector('.newsletter-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = form.querySelector('input').value;
                // Here you would typically send to your backend
                alert('¡Gracias por suscribirte! Te enviaremos las novedades a: ' + email);
                form.reset();
            });
        }
    },

    // Get URL parameters
    getUrlParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }
};

// Carrusel de banners del hero (portada). Si no hay banners cargados en el panel
// (Banners), no hace nada y queda el hero único de config tal como lo dejó applySiteConfig().
const HeroSlider = {
    slides: [],
    current: 0,
    timer: null,
    intervalMs: 6000,

    async init() {
        const container = document.getElementById('heroSlides');
        if (!container || typeof supabaseClient === 'undefined') return;

        try {
            const { data, error } = await supabaseClient
                .from('banners').select('*').eq('active', true).order('sort_order');
            if (error || !data || data.length === 0) return;

            this.slides = data;
            this.render(container);
            if (this.slides.length > 1) this.start();
        } catch (error) {
            // sin conexión: se queda con el hero por defecto
        }
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    },

    render(container) {
        container.innerHTML = this.slides.map((s, i) => {
            const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(s.media_url || '');
            const media = isVideo
                ? `<video class="hero-img" src="${s.media_url}" autoplay loop muted playsinline></video>`
                : `<img class="hero-img" src="${s.media_url}" alt="${this.escapeHtml(s.title || 'PopFlame')}">`;

            return `
                <div class="hero-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
                    <div class="hero-bg">
                        ${media}
                        <div class="hero-overlay"></div>
                    </div>
                    <div class="hero-content">
                        ${s.title ? `<h1 class="hero-title">${this.escapeHtml(s.title)}</h1>` : ''}
                        ${s.subtitle ? `<p class="hero-subtitle">${this.escapeHtml(s.subtitle)}</p>` : ''}
                        <a href="${s.link_url || '#products'}" class="btn btn-primary">VER PRODUCTOS</a>
                    </div>
                </div>
            `;
        }).join('');

        const dots = document.getElementById('heroDots');
        const prevBtn = document.getElementById('heroPrev');
        const nextBtn = document.getElementById('heroNext');

        if (this.slides.length > 1) {
            dots.innerHTML = this.slides.map((_, i) => `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="Ir al banner ${i + 1}"></button>`).join('');
            dots.style.display = 'flex';
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'flex';

            prevBtn.addEventListener('click', () => this.goTo(this.current - 1));
            nextBtn.addEventListener('click', () => this.goTo(this.current + 1));
            dots.addEventListener('click', (e) => {
                const btn = e.target.closest('.hero-dot');
                if (btn) this.goTo(parseInt(btn.dataset.index, 10));
            });
        }
    },

    goTo(index) {
        this.current = (index + this.slides.length) % this.slides.length;
        document.querySelectorAll('.hero-slide').forEach((el, i) => el.classList.toggle('active', i === this.current));
        document.querySelectorAll('.hero-dot').forEach((el, i) => el.classList.toggle('active', i === this.current));
        this.restart();
    },

    start() {
        this.timer = setInterval(() => this.goTo(this.current + 1), this.intervalMs);
    },

    restart() {
        if (this.timer) clearInterval(this.timer);
        this.start();
    }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}