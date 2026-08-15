// Main App
const App = {
    // Initialize app
    async init() {
        // Load products
        await ProductsManager.loadProducts();

        // Apply logo/banner/hero text configured from el panel de Super Admin
        this.applySiteConfig();

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

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}