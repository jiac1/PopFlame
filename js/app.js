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
    },

    // Reemplaza logo, banner y textos del hero con lo configurado en Supabase (si existe)
    applySiteConfig() {
        const config = ProductsManager.config;
        if (!config) return;

        if (config.logoUrl) {
            document.querySelectorAll('.logo-img').forEach(img => { img.src = config.logoUrl; });
        }
        if (config.logoWhiteUrl) {
            document.querySelectorAll('.footer-logo').forEach(img => { img.src = config.logoWhiteUrl; });
        }
        if (config.heroBannerUrl) {
            document.querySelectorAll('.hero-img').forEach(img => { img.src = config.heroBannerUrl; });
        }

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