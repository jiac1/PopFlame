// Products Manager
const ProductsManager = {
    products: [],
    categories: [],
    config: {},
    sizeGuide: [],

    // Load products, categories, config and size guide from Supabase
    async loadProducts() {
        try {
            const [{ data: products, error: pErr }, { data: categories, error: cErr }, { data: cfg, error: cfgErr }, { data: sizeGuide, error: sgErr }] =
                await Promise.all([
                    supabaseClient.from('products').select('*').order('id'),
                    supabaseClient.from('categories').select('*').order('sort_order'),
                    supabaseClient.from('config').select('*').eq('id', 1).maybeSingle(),
                    supabaseClient.from('size_guide').select('*')
                ]);

            if (pErr) throw pErr;
            if (cErr) throw cErr;
            if (cfgErr) throw cfgErr;
            // size_guide es opcional: si la tabla todavía no existe (falta correr el schema.sql
            // nuevo), no rompe el resto del sitio, solo no muestra medidas junto a la talla.
            if (sgErr) console.warn('No se pudo cargar size_guide:', sgErr.message);
            this.sizeGuide = sizeGuide || [];

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

    // Medida real de una talla para una categoría (ej. "48cm"), editable desde
    // el panel (Super Admin > Tallas). Devuelve '' si no hay medida cargada.
    getSizeMeasurement(categoryId, size) {
        const entry = this.sizeGuide.find(s => s.category_id === categoryId && s.size === size);
        return entry ? entry.measurement : '';
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    },

    // Filas + nombres de columna (las que haya cargado el super_admin) de la tabla de
    // medidas detallada de una categoría.
    getSizeGuideTable(categoryId) {
        const rows = this.sizeGuide
            .filter(s => s.category_id === categoryId)
            .sort((a, b) => a.sort_order - b.sort_order);

        const labels = [];
        rows.forEach(r => {
            Object.keys(r.measurements || {}).forEach(k => {
                if (!labels.includes(k)) labels.push(k);
            });
        });

        return { rows, labels };
    },

    // Diagrama genérico de referencia (ilustración propia, no depende de ninguna imagen externa)
    // con los puntos de medida A/B/C/D marcados, para acompañar la tabla de talles.
    sizeGuideDiagramSvg() {
        return `
            <svg viewBox="0 0 200 220" width="120" height="132" style="flex-shrink:0;">
                <path d="M85 20 Q100 8 115 20 L130 30 L165 50 L140 78 L130 88 L130 190 L70 190 L70 88 L60 78 L35 50 L70 30 Z"
                      fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                <line x1="15" y1="20" x2="15" y2="190" stroke="#E31837" stroke-width="1.5"/>
                <text x="5" y="109" fill="#E31837" font-size="13" font-weight="700">A</text>
                <line x1="70" y1="140" x2="130" y2="140" stroke="#E31837" stroke-width="1.5"/>
                <text x="94" y="134" fill="#E31837" font-size="13" font-weight="700">B</text>
                <line x1="130" y1="30" x2="165" y2="50" stroke="#E31837" stroke-width="1.5"/>
                <text x="170" y="48" fill="#E31837" font-size="13" font-weight="700">C</text>
                <line x1="85" y1="12" x2="115" y2="12" stroke="#E31837" stroke-width="1.5"/>
                <text x="95" y="8" fill="#E31837" font-size="13" font-weight="700">D</text>
            </svg>
        `;
    },

    // Diagrama de pantalón (prenda inferior): forma distinta a la de arriba, con sus
    // propios puntos de medida (Largo, Cintura, Tiro/entrepierna).
    sizeGuideDiagramSvgPants() {
        return `
            <svg viewBox="0 0 200 220" width="120" height="132" style="flex-shrink:0;">
                <path d="M65 20 L135 20 L135 55 L120 190 L103 190 L100 95 L97 190 L80 190 L65 55 Z"
                      fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                <line x1="20" y1="20" x2="20" y2="190" stroke="#E31837" stroke-width="1.5"/>
                <text x="10" y="109" fill="#E31837" font-size="13" font-weight="700">A</text>
                <line x1="65" y1="12" x2="135" y2="12" stroke="#E31837" stroke-width="1.5"/>
                <text x="95" y="8" fill="#E31837" font-size="13" font-weight="700">B</text>
                <line x1="75" y1="95" x2="125" y2="95" stroke="#E31837" stroke-width="1.5"/>
                <text x="128" y="99" fill="#E31837" font-size="13" font-weight="700">C</text>
            </svg>
        `;
    },

    // Categorías de prenda inferior (pantalón), que usan un diagrama distinto al de arriba.
    // Se detecta por id o por nombre, para que también funcione con categorías nuevas
    // parecidas (ej. "shorts", "faldas") sin tener que tocar código de nuevo.
    isBottomWearCategory(categoryId) {
        const cat = this.categories.find(c => c.id === categoryId);
        const text = `${categoryId} ${cat?.name || ''}`.toLowerCase();
        return /pantal|short|falda|jean/.test(text);
    },

    // Diagrama + tabla de talles de una categoría. Si no hay medidas cargadas todavía,
    // avisa en vez de mostrar una tabla vacía.
    renderSizeGuideHtml(categoryId) {
        const { rows, labels } = this.getSizeGuideTable(categoryId);

        if (rows.length === 0) {
            return '<p>Guía de talles no disponible todavía para esta categoría.</p>';
        }

        const hasDetailedLabels = labels.length > 0;

        const headerCells = hasDetailedLabels
            ? labels.map(l => `<th>${this.escapeHtml(l)}</th>`).join('')
            : '<th>Medida</th>';

        const bodyRows = rows.map(r => {
            const cells = hasDetailedLabels
                ? labels.map(l => `<td>${this.escapeHtml((r.measurements || {})[l] ?? '—')}</td>`).join('')
                : `<td>${this.escapeHtml(r.measurement)}</td>`;
            return `<tr><td><strong>${this.escapeHtml(r.size)}</strong></td>${cells}</tr>`;
        }).join('');

        const diagram = this.isBottomWearCategory(categoryId)
            ? this.sizeGuideDiagramSvgPants()
            : this.sizeGuideDiagramSvg();

        return `
            <div class="size-guide-wrap">
                <div class="size-guide-diagram">${diagram}</div>
                <div class="size-guide-table-wrap">
                    <table class="size-guide-table">
                        <thead><tr><th>Talla</th>${headerCells}</tr></thead>
                        <tbody>${bodyRows}</tbody>
                    </table>
                    <p class="size-guide-note">* Medidas aproximadas, en centímetros.</p>
                </div>
            </div>
        `;
    },

    // Generate product card HTML (para index.html, en la raíz del sitio)
    createProductCard(product) {
        const badgeHTML = product.badge
            ? `<span class="product-badge">${product.badge}</span>`
            : '';
        const safeName = this.escapeHtml(product.name);
        const safeCategory = this.escapeHtml(product.category);

        return `
            <a href="pages/producto.html?id=${product.id}" class="product-card">
                <div class="product-image">
                    ${badgeHTML}
                    <img src="${this.resolveImagePath(product.image)}" alt="${safeName}" loading="lazy" onerror="this.onerror=null;this.src='images/products/poleras/placeholder.svg';">
                </div>
                <div class="product-info">
                    <span class="product-category">${safeCategory}</span>
                    <h3 class="product-name">${safeName}</h3>
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
        const safeName = this.escapeHtml(product.name);
        const safeCategory = this.escapeHtml(product.category);

        return `
            <a href="producto.html?id=${product.id}" class="product-card">
                <div class="product-image">
                    ${badgeHTML}
                    <img src="${this.resolveImagePath(product.image, '../')}" alt="${safeName}" loading="lazy" onerror="this.onerror=null;this.src='../images/products/poleras/placeholder.svg';">
                </div>
                <div class="product-info">
                    <span class="product-category">${safeCategory}</span>
                    <h3 class="product-name">${safeName}</h3>
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