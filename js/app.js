// Main App
const App = {
    // Initialize app
    async init() {
        // Load products
        await ProductsManager.loadProducts();
        
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