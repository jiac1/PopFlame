// Products Manager
const ProductsManager = {
    products: [],
    categories: [],
    config: {},

    // Load products, categories and config from Supabase
    async loadProducts() {
        try {
            const [{ data: products, error: pErr }, { data: categories, error: cErr }, { data: cfg, error: cfgErr }] =
                await Promise.all([
                    supabaseClient.from('products').select('*').order('id'),
                    supabaseClient.from('categories').select('*').order('sort_order'),
                    supabaseClient.from('config').select('*').eq('id', 1).maybeSingle()
                ]);

            if (pErr) throw pErr;
            if (cErr) throw cErr;
            if (cfgErr) throw cfgErr;

            this.products = (products || []).map(p => ({
                id: p.id,
                name: p.name,
                category: p.category_id,
                price: Number(p.price),
                sizes: p.sizes || [],
                colors: p.colors || [],
                image: p.image,
                images: (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []),
                description: p.description || '',
                featured: p.featured,
                stock: p.stock,
                badge: p.badge || undefined
            }));

            this.categories = categories || [];

            this.config = cfg ? {
                currency: cfg.currency,
                currencySymbol: '$',
                whatsappNumber: cfg.whatsapp_number || '',
                shippingCost: Number(cfg.shipping_cost),
                freeShippingMin: Number(cfg.free_shipping_min),
                storeName: cfg.store_name,
                heroTitle: cfg.hero_title,
                heroSubtitle: cfg.hero_subtitle,
                logoUrl: cfg.logo_url || '',
                logoWhiteUrl: cfg.logo_white_url || '',
                heroBannerUrl: cfg.hero_banner_url || '',
                socialLinks: {
                    instagram: cfg.social_instagram || '',
                    tiktok: cfg.social_tiktok || '',
                    twitter: cfg.social_twitter || ''
                }
            } : {};

            return { products: this.products, categories: this.categories, config: this.config };
        } catch (error) {
            console.error('Error loading products from Supabase:', error);
            return null;
        }
    },

    // Get all products
    getAllProducts() {
        return this.products;
    },

    // Get products by category
    getProductsByCategory(category) {
        return this.products.filter(p => p.category === category);
    },

    // Get product by ID
    getProductById(id) {
        return this.products.find(p => p.id === parseInt(id));
    },

    // Get featured products
    getFeaturedProducts() {
        return this.products.filter(p => p.featured);
    },

    // Get category by ID
    getCategoryById(id) {
        return this.categories.find(c => c.id === id);
    },

    // Format price in CLP
    formatPrice(price) {
        return '$' + price.toLocaleString('es-CL');
    },

    // Resuelve la ruta de una imagen: si ya es una URL absoluta (ej. Supabase Storage),
    // se usa tal cual; si es una ruta relativa local, se le antepone el prefijo del nivel de carpeta.
    resolveImagePath(path, prefix = '') {
        if (!path) return prefix + 'images/products/poleras/placeholder.svg';
        if (/^https?:\/\//i.test(path)) return path;
        return prefix + path;
    },

    // Mapa de nombres de color (tal como se escriben en el panel) a un color real para
    // pintar la bolita de selección. Si el color no está en la lista, se intenta usar el
    // texto tal cual como color CSS (funciona para nombres en inglés, ej. "blue").
    colorMap: {
        'negro': '#000000', 'blanco': '#ffffff', 'gris': '#808080',
        'rojo': '#E31837', 'azul': '#1E3A8A', 'celeste': '#38BDF8',
        'verde': '#166534', 'verde militar': '#4B5320', 'amarillo': '#EAB308',
        'naranjo': '#EA580C', 'naranja': '#EA580C', 'café': '#5C3A21', 'cafe': '#5C3A21',
        'marrón': '#5C3A21', 'marron': '#5C3A21', 'beige': '#D2B48C',
        'rosado': '#F472B6', 'rosa': '#F472B6', 'morado': '#7C3AED', 'púrpura': '#7C3AED',
        'purpura': '#7C3AED', 'dorado': '#D4AF37', 'plateado': '#C0C0C0',
        'turquesa': '#14B8A6', 'crema': '#F5F0DC', 'vino': '#722F37', 'única': '#555555'
    },

    resolveColorSwatch(name) {
        const key = (name || '').trim().toLowerCase();
        return this.colorMap[key] || name || '#555555';
    },

    // Generate product card HTML (para index.html, en la raíz del sitio)
    createProductCard(product) {
        const badgeHTML = product.badge
            ? `<span class="product-badge">${product.badge}</span>`
            : '';

        return `
            <a href="pages/producto.html?id=${product.id}" class="product-card">
                <div class="product-image">
                    ${badgeHTML}
                    <img src="${this.resolveImagePath(product.image)}" alt="${product.name}" loading="lazy">
                </div>
                <div class="product-info">
                    <span class="product-category">${product.category}</span>
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-price">${this.formatPrice(product.price)}</p>
                </div>
            </a>
        `;
    },

    // Generate product card HTML for category pages (dentro de /pages/)
    createProductCardCategory(product) {
        const badgeHTML = product.badge
            ? `<span class="product-badge">${product.badge}</span>`
            : '';

        return `
            <a href="producto.html?id=${product.id}" class="product-card">
                <div class="product-image">
                    ${badgeHTML}
                    <img src="${this.resolveImagePath(product.image, '../')}" alt="${product.name}" loading="lazy">
                </div>
                <div class="product-info">
                    <span class="product-category">${product.category}</span>
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-price">${this.formatPrice(product.price)}</p>
                </div>
            </a>
        `;
    },

    // Render products to container
    renderProducts(containerId, products, isCategoryPage = false) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const createCard = isCategoryPage 
            ? this.createProductCardCategory.bind(this)
            : this.createProductCard.bind(this);

        container.innerHTML = products.map(createCard).join('');
    },

    // Search products
    searchProducts(query) {
        const lowerQuery = query.toLowerCase();
        return this.products.filter(p => 
            p.name.toLowerCase().includes(lowerQuery) ||
            p.description.toLowerCase().includes(lowerQuery)
        );
    },

    // Filter products by price range
    filterByPrice(min, max) {
        return this.products.filter(p => p.price >= min && p.price <= max);
    },

    // Filter products by size
    filterBySize(size) {
        return this.products.filter(p => p.sizes.includes(size));
    },

    // Filter products by color
    filterByColor(color) {
        return this.products.filter(p => p.colors.includes(color));
    },

    // Get all available sizes
    getAllSizes() {
        const sizes = new Set();
        this.products.forEach(p => p.sizes.forEach(s => sizes.add(s)));
        return Array.from(sizes);
    },

    // Get all available colors
    getAllColors() {
        const colors = new Set();
        this.products.forEach(p => p.colors.forEach(c => colors.add(c)));
        return Array.from(colors);
    },

    // Get price range
    getPriceRange() {
        const prices = this.products.map(p => p.price);
        return {
            min: Math.min(...prices),
            max: Math.max(...prices)
        };
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductsManager;
}