// Datos de la tienda (productos, categorías, configuración y guía de tallas) desde Supabase.
// Usa "stale-while-revalidate": pinta al instante con lo guardado de la visita anterior
// (localStorage) y vuelve a pintar solo si Supabase trae algo distinto.
const ProductsManager = {
    products: [],
    categories: [],
    config: {},
    sizeGuide: [],
    loaded: false,
    cacheKey: 'pf_store_cache',
    cacheMaxAgeMs: 1000 * 60 * 60 * 24,

    // Llama a onData(data, { fresh }) una vez con el cache (si existe) y otra con los datos
    // frescos si cambiaron. Devuelve una promesa que se resuelve con los datos frescos.
    async load(onData) {
        const cached = this.readCache();
        let cachedSig = null;
        if (cached) {
            this.apply(cached);
            cachedSig = JSON.stringify(cached);
            onData && onData(this, { fresh: false });
        }

        const fresh = await this.fetchFresh();
        if (fresh) {
            const sig = JSON.stringify(fresh);
            this.apply(fresh);
            this.writeCache(fresh);
            if (sig !== cachedSig) onData && onData(this, { fresh: true });
        } else if (!cached) {
            onData && onData(this, { fresh: true, failed: true });
        }
        return this;
    },

    // Compatibilidad con código anterior
    async loadProducts() {
        await this.load();
        return { products: this.products, categories: this.categories, config: this.config };
    },

    async fetchFresh() {
        if (typeof supabaseClient === 'undefined') return null;
        try {
            const [p, c, cfg, sg] = await Promise.all([
                supabaseClient.from('products').select('*').order('id', { ascending: false }),
                supabaseClient.from('categories').select('*').order('sort_order'),
                supabaseClient.from('config').select('*').eq('id', 1).maybeSingle(),
                supabaseClient.from('size_guide').select('*')
            ]);
            if (p.error) throw p.error;
            if (c.error) throw c.error;
            if (sg.error) console.warn('No se pudo cargar size_guide:', sg.error.message);

            return {
                products: (p.data || []).map(row => this.mapProduct(row)),
                categories: c.data || [],
                config: this.mapConfig(cfg.data),
                sizeGuide: sg.data || []
            };
        } catch (error) {
            console.error('Error cargando la tienda desde Supabase:', error);
            return null;
        }
    },

    mapProduct(p) {
        const images = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
        return {
            id: p.id,
            name: p.name,
            category: p.category_id,
            price: Number(p.price),
            sizes: p.sizes || [],
            colors: p.colors || [],
            image: p.image || images[0] || '',
            images,
            description: p.description || '',
            featured: !!p.featured,
            stock: Number(p.stock ?? 0),
            badge: p.badge || '',
            createdAt: p.created_at
        };
    },

    mapConfig(cfg) {
        if (!cfg) return {};
        return {
            currency: cfg.currency,
            whatsappNumber: cfg.whatsapp_number || '',
            shippingCost: Number(cfg.shipping_cost || 0),
            freeShippingMin: Number(cfg.free_shipping_min || 0),
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
        };
    },

    apply(data) {
        this.products = data.products || [];
        this.categories = data.categories || [];
        this.config = data.config || {};
        this.sizeGuide = data.sizeGuide || [];
        this.loaded = true;
    },

    readCache() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.cacheKey) || 'null');
            if (!raw || !raw.savedAt || Date.now() - raw.savedAt > this.cacheMaxAgeMs) return null;
            return { products: raw.products, categories: raw.categories, config: raw.config, sizeGuide: raw.sizeGuide };
        } catch (e) {
            return null;
        }
    },

    writeCache(data) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify({ ...data, savedAt: Date.now() }));
        } catch (e) { /* almacenamiento lleno o bloqueado: se ignora */ }
    },

    // ===== Consultas =====
    getAllProducts() { return this.products; },
    getProductsByCategory(category) { return this.products.filter(p => p.category === category); },
    getProductById(id) { return this.products.find(p => p.id === parseInt(id, 10)); },
    getFeaturedProducts() { return this.products.filter(p => p.featured); },
    getCategoryById(id) { return this.categories.find(c => c.id === id); },

    // Categorías con al menos un producto: las vacías no se muestran en el menú ni en la portada.
    getVisibleCategories() {
        return this.categories.filter(c => this.products.some(p => p.category === c.id));
    },

    searchProducts(query) {
        const q = this.normalize(query);
        if (!q) return [];
        return this.products.filter(p => {
            const cat = this.getCategoryById(p.category);
            const hay = this.normalize(`${p.name} ${p.description} ${cat?.name || ''} ${p.colors.join(' ')}`);
            return q.split(/\s+/).every(term => hay.includes(term));
        });
    },

    normalize(str) {
        return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    },

    // ===== Formato =====
    formatPrice(price) {
        return '$' + Number(price || 0).toLocaleString('es-CL');
    },

    // Ruta de imagen: URL absoluta (Supabase Storage) se usa tal cual; ruta local se resuelve
    // desde la raíz del sitio, sin importar en qué carpeta esté la página.
    resolveImagePath(path) {
        if (!path) return PF.url('images/products/poleras/placeholder.svg');
        if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
        return PF.url(path);
    },

    colorMap: {
        'negro': '#0B0B0B', 'blanco': '#FFFFFF', 'gris': '#8C8C8C',
        'rojo': '#E31837', 'azul': '#1E3A8A', 'celeste': '#7DC3E8',
        'verde': '#166534', 'verde militar': '#4B5320', 'amarillo': '#EAB308',
        'naranjo': '#EA580C', 'naranja': '#EA580C', 'café': '#5C3A21', 'cafe': '#5C3A21',
        'marrón': '#5C3A21', 'marron': '#5C3A21', 'beige': '#D8C3A0',
        'rosado': '#F472B6', 'rosa': '#F472B6', 'morado': '#7C3AED', 'púrpura': '#7C3AED',
        'purpura': '#7C3AED', 'dorado': '#D4AF37', 'plateado': '#C9CCD1',
        'turquesa': '#14B8A6', 'crema': '#F2EBD9', 'vino': '#722F37', 'única': '#555555'
    },

    resolveColorSwatch(name) {
        const key = (name || '').trim().toLowerCase();
        return this.colorMap[key] || name || '#555555';
    },

    stockState(product) {
        if (product.stock <= 0) return 'out';
        if (product.stock <= 3) return 'low';
        return 'in';
    },

    // ===== Guía de tallas =====
    getSizeMeasurement(categoryId, size) {
        const entry = this.sizeGuide.find(s => s.category_id === categoryId && s.size === size);
        return entry ? entry.measurement : '';
    },

    escapeHtml(str) { return PF.escape(str); },

    getSizeGuideTable(categoryId) {
        const rows = this.sizeGuide
            .filter(s => s.category_id === categoryId)
            .sort((a, b) => a.sort_order - b.sort_order);
        const labels = [];
        rows.forEach(r => Object.keys(r.measurements || {}).forEach(k => { if (!labels.includes(k)) labels.push(k); }));
        return { rows, labels };
    },

    sizeGuideDiagramSvg() {
        return `
            <svg viewBox="0 0 200 220" width="120" height="132" aria-hidden="true">
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
            </svg>`;
    },

    sizeGuideDiagramSvgPants() {
        return `
            <svg viewBox="0 0 200 220" width="120" height="132" aria-hidden="true">
                <path d="M65 20 L135 20 L135 55 L120 190 L103 190 L100 95 L97 190 L80 190 L65 55 Z"
                      fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                <line x1="20" y1="20" x2="20" y2="190" stroke="#E31837" stroke-width="1.5"/>
                <text x="10" y="109" fill="#E31837" font-size="13" font-weight="700">A</text>
                <line x1="65" y1="12" x2="135" y2="12" stroke="#E31837" stroke-width="1.5"/>
                <text x="95" y="8" fill="#E31837" font-size="13" font-weight="700">B</text>
                <line x1="75" y1="95" x2="125" y2="95" stroke="#E31837" stroke-width="1.5"/>
                <text x="128" y="99" fill="#E31837" font-size="13" font-weight="700">C</text>
            </svg>`;
    },

    isBottomWearCategory(categoryId) {
        const cat = this.categories.find(c => c.id === categoryId);
        const text = `${categoryId} ${cat?.name || ''}`.toLowerCase();
        return /pantal|short|falda|jean/.test(text);
    },

    renderSizeGuideHtml(categoryId) {
        const { rows, labels } = this.getSizeGuideTable(categoryId);
        if (rows.length === 0) {
            return '<p>Todavía no hay medidas cargadas para esta categoría. Escríbenos por WhatsApp y te ayudamos a elegir tu talla.</p>';
        }
        const detailed = labels.length > 0;
        const head = detailed ? labels.map(l => `<th>${PF.escape(l)}</th>`).join('') : '<th>Medida</th>';
        const body = rows.map(r => {
            const cells = detailed
                ? labels.map(l => `<td>${PF.escape((r.measurements || {})[l] ?? '—')}</td>`).join('')
                : `<td>${PF.escape(r.measurement)}</td>`;
            return `<tr><td><strong>${PF.escape(r.size)}</strong></td>${cells}</tr>`;
        }).join('');
        const diagram = this.isBottomWearCategory(categoryId) ? this.sizeGuideDiagramSvgPants() : this.sizeGuideDiagramSvg();

        return `
            <div class="size-guide-wrap">
                <div class="size-guide-diagram">${diagram}</div>
                <div class="size-guide-table-wrap">
                    <table class="size-guide-table">
                        <thead><tr><th>Talla</th>${head}</tr></thead>
                        <tbody>${body}</tbody>
                    </table>
                    <p class="size-guide-note">* Medidas aproximadas, en centímetros.</p>
                </div>
            </div>`;
    },

    // ===== Tarjeta de producto =====
    productUrl(product) {
        return PF.url(`pages/producto.html?id=${product.id}`);
    },

    createProductCard(product, { eager = false } = {}) {
        const name = PF.escape(product.name);
        const cat = this.getCategoryById(product.category);
        const main = this.resolveImagePath(product.images[0] || product.image);
        const alt = product.images[1] ? this.resolveImagePath(product.images[1]) : '';
        const stock = this.stockState(product);

        const tags = [];
        if (stock === 'out') tags.push('<span class="tag tag-dark">Agotado</span>');
        else if (product.badge) tags.push(`<span class="tag ${/oferta|sale|limitad/i.test(product.badge) ? 'tag-red' : ''}">${PF.escape(product.badge)}</span>`);
        if (stock === 'low') tags.push('<span class="tag tag-red">Últimas unidades</span>');

        const sizes = (product.sizes || []).filter(s => s && s.toLowerCase() !== 'única');
        const quick = stock !== 'out' && sizes.length
            ? `<div class="product-quick" aria-hidden="true">${sizes.map(s => `<span>${PF.escape(s)}</span>`).join('')}</div>`
            : '';

        const swatches = (product.colors || []).length > 1
            ? `<div class="product-swatches" aria-label="Colores disponibles">${product.colors.map(c =>
                `<span class="swatch-dot" title="${PF.escape(c)}" style="background:${PF.escape(this.resolveColorSwatch(c))}"></span>`).join('')}</div>`
            : '';

        const loading = eager ? 'eager' : 'lazy';

        return `
            <a href="${this.productUrl(product)}" class="product-card${stock === 'out' ? ' product-soldout' : ''}">
                <div class="product-media${alt ? ' has-alt' : ''}">
                    <img class="img-main" src="${main}" alt="${name}" loading="${loading}" decoding="async"
                         onerror="this.onerror=null;this.src='${PF.url('images/products/poleras/placeholder.svg')}'">
                    ${alt ? `<img class="img-alt" src="${alt}" alt="" loading="lazy" decoding="async" aria-hidden="true">` : ''}
                    ${tags.length ? `<div class="product-tags">${tags.join('')}</div>` : ''}
                    ${quick}
                </div>
                <div class="product-meta">
                    <div>
                        <h3 class="product-name">${name}</h3>
                        <span class="product-sub">${PF.escape(cat?.name || '')}</span>
                        ${swatches}
                    </div>
                    <span class="product-price">${this.formatPrice(product.price)}</span>
                </div>
            </a>`;
    },

    skeletonCards(n = 4) {
        return Array.from({ length: n }, () => `
            <div class="skeleton-card" aria-hidden="true">
                <div class="product-media"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
            </div>`).join('');
    },

    renderProducts(containerId, products, opts = {}) {
        const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!container) return;
        container.innerHTML = products.map((p, i) => this.createProductCard(p, { eager: opts.eagerCount ? i < opts.eagerCount : false })).join('');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProductsManager;
}
