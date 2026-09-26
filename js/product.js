// Ficha de producto (pages/producto.html?id=<id>).
const Product = {
    product: null,
    size: null,
    color: null,
    qty: 1,
    images: [],
    renderedSig: null,

    init() {
        this.id = parseInt(new URLSearchParams(location.search).get('id'), 10);
        this.bindStatic();
        Site.start({ render: () => this.render() });
    },

    render() {
        const p = ProductsManager.getProductById(this.id);
        if (!p) {
            if (ProductsManager.products.length) this.renderNotFound();
            return;
        }
        // No volver a pintar si los datos del producto no cambiaron (mantiene talla/color elegidos).
        const sig = JSON.stringify(p);
        if (sig === this.renderedSig) return;
        const sameProduct = this.product?.id === p.id;
        this.renderedSig = sig;
        this.product = p;
        if (!sameProduct) { this.size = null; this.color = null; this.qty = 1; }

        const cat = ProductsManager.getCategoryById(p.category);
        const catUrl = PF.url('pages/categoria.html?cat=' + encodeURIComponent(p.category));
        document.getElementById('crumbCat').textContent = cat?.name || 'Catálogo';
        document.getElementById('crumbCat').href = cat ? catUrl : PF.url('pages/categoria.html');
        document.getElementById('crumbName').textContent = p.name;
        document.getElementById('pdpTitle').textContent = p.name;
        document.getElementById('pdpPrice').textContent = ProductsManager.formatPrice(p.price);
        document.getElementById('stickyName').textContent = p.name;
        document.getElementById('stickyPrice').textContent = ProductsManager.formatPrice(p.price);

        const desc = p.description || 'Prenda PopFlame de edición limitada, diseñada y producida en Chile.';
        document.getElementById('pdpDescription').innerHTML = desc.split(/\n+/).map(t => `<p>${PF.escape(t)}</p>`).join('');
        const sizeGuideHtml = ProductsManager.renderSizeGuideHtml(p.category);
        document.getElementById('pdpSizeGuide').innerHTML = sizeGuideHtml;
        document.getElementById('sizeModalBody').innerHTML = sizeGuideHtml;

        this.renderStock();
        this.renderGallery();
        this.renderOptions();
        this.renderWhatsapp();
        this.renderRelated();
        this.updateBuyState();

        Site.setMeta(`${p.name} | PopFlame`, `${p.name} — ${ProductsManager.formatPrice(p.price)}. ${desc}`.slice(0, 160), ProductsManager.resolveImagePath(p.image));
        this.renderJsonLd(p, cat);
    },

    renderNotFound() {
        document.getElementById('pdpRoot').innerHTML = `
            <div class="empty-state">
                <h3>Producto no disponible</h3>
                <p>Es posible que este producto ya no esté a la venta o que el link esté incompleto.</p>
                <a class="btn btn-dark" href="${PF.url('pages/categoria.html')}">Ver catálogo</a>
            </div>`;
        document.getElementById('stickyBuy')?.remove();
        document.title = 'Producto no disponible | PopFlame';
    },

    renderStock() {
        const el = document.getElementById('pdpStock');
        const state = ProductsManager.stockState(this.product);
        const text = {
            in: 'En stock, listo para entrega',
            low: `¡Últimas ${this.product.stock} unidades!`,
            out: 'Agotado por ahora'
        }[state];
        el.innerHTML = `<span class="pdp-stock ${state === 'low' ? 'is-low' : state === 'out' ? 'is-out' : ''}">${text}</span>`;
    },

    // ===== Galería =====
    renderGallery() {
        const p = this.product;
        this.images = (p.images.length ? p.images : [p.image]).filter(Boolean).map(i => ProductsManager.resolveImagePath(i));
        if (!this.images.length) this.images = [ProductsManager.resolveImagePath('')];
        const alt = (i) => `${PF.escape(p.name)} — foto ${i + 1} de ${this.images.length}`;

        const grid = document.getElementById('pdpGrid');
        grid.classList.toggle('is-single', this.images.length === 1);
        grid.innerHTML = this.images.map((src, i) =>
            `<button type="button" data-zoom="${i}" aria-label="Ampliar foto ${i + 1}"><img src="${src}" alt="${alt(i)}" ${i < 2 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></button>`).join('');

        const track = document.getElementById('pdpTrack');
        track.innerHTML = this.images.map((src, i) =>
            `<button type="button" data-zoom="${i}" aria-label="Ampliar foto ${i + 1}"><img src="${src}" alt="${alt(i)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></button>`).join('');
        track.scrollLeft = 0;

        const dots = document.getElementById('pdpDots');
        dots.innerHTML = this.images.length > 1 ? this.images.map((_, i) => `<span class="${i === 0 ? 'is-active' : ''}"></span>`).join('') : '';

        document.getElementById('lightboxTrack').innerHTML = this.images.map((src, i) =>
            `<figure><img src="${src}" alt="${alt(i)}" decoding="async"></figure>`).join('');
    },

    // ===== Opciones =====
    renderOptions() {
        const p = this.product;
        const colors = p.colors || [];
        const sizes = p.sizes || [];

        if (colors.length === 1) this.color = colors[0];
        if (sizes.length === 1) this.size = sizes[0];
        if (this.color && !colors.includes(this.color)) this.color = null;
        if (this.size && !sizes.includes(this.size)) this.size = null;

        const colorBlock = document.getElementById('colorBlock');
        colorBlock.hidden = colors.length === 0;
        document.getElementById('colorOptions').innerHTML = colors.map(c => `
            <button type="button" class="swatch${c === this.color ? ' is-active' : ''}" role="radio" aria-checked="${c === this.color}"
                    data-color="${PF.escape(c)}" title="${PF.escape(c)}" aria-label="${PF.escape(c)}">
                <i style="background:${PF.escape(ProductsManager.resolveColorSwatch(c))}"></i>
            </button>`).join('');

        // Talla única (accesorios): no hay nada que elegir, se omite el bloque.
        const onlyOneSize = sizes.length === 1 && /^[úu]nica$/i.test(sizes[0].trim());
        const sizeBlock = document.getElementById('sizeBlock');
        sizeBlock.hidden = sizes.length === 0 || onlyOneSize;
        const soldOut = p.stock <= 0;
        document.getElementById('sizeOptions').innerHTML = sizes.map(s => `
            <button type="button" class="size${s === this.size ? ' is-active' : ''}" role="radio" aria-checked="${s === this.size}"
                    data-size="${PF.escape(s)}" ${soldOut ? 'disabled' : ''}>${PF.escape(s)}</button>`).join('');

        const hasGuide = ProductsManager.getSizeGuideTable(p.category).rows.length > 0;
        document.getElementById('sizeGuideOpen').hidden = !hasGuide;
        document.getElementById('sizeAccordion').hidden = !hasGuide;

        this.updateLabels();
    },

    updateLabels() {
        document.getElementById('colorValue').textContent = this.color || '';
        document.getElementById('sizeValue').textContent = this.size || '';
        const m = this.size ? ProductsManager.getSizeMeasurement(this.product.category, this.size) : '';
        document.getElementById('sizeMeasure').textContent = m ? `Talla ${this.size}: ${m} de ancho aprox.` : '';
    },

    renderWhatsapp() {
        const a = document.getElementById('pdpWhatsapp');
        const link = CartManager.whatsappLink(`Hola PopFlame! Tengo una consulta sobre ${this.product.name}: ${location.href}`);
        a.hidden = !link;
        if (link) {
            a.href = link;
            a.innerHTML = `${PF.icons.whatsapp}<span>Consultar por WhatsApp</span>`;
        }
    },

    renderRelated() {
        const p = this.product;
        const same = ProductsManager.getProductsByCategory(p.category).filter(x => x.id !== p.id);
        const others = ProductsManager.getAllProducts().filter(x => x.id !== p.id && x.category !== p.category);
        const list = [...same, ...others].filter(x => x.stock > 0).slice(0, 8);
        const section = document.getElementById('related');
        section.hidden = list.length === 0;
        if (list.length) ProductsManager.renderProducts('relatedRail', list);
    },

    renderJsonLd(p, cat) {
        let el = document.getElementById('productJsonLd');
        if (!el) {
            el = document.createElement('script');
            el.type = 'application/ld+json';
            el.id = 'productJsonLd';
            document.head.appendChild(el);
        }
        el.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: p.name,
            image: this.images,
            description: p.description,
            brand: { '@type': 'Brand', name: 'PopFlame' },
            category: cat?.name,
            offers: {
                '@type': 'Offer',
                priceCurrency: 'CLP',
                price: p.price,
                availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                url: location.href
            }
        });
    },

    // ===== Estado del botón y cantidad =====
    updateBuyState() {
        const p = this.product;
        const soldOut = p.stock <= 0;
        const available = Math.max(0, p.stock - CartManager.quantityOf(p.id));
        if (this.qty > Math.max(1, available)) this.qty = Math.max(1, available);

        document.getElementById('qtyValue').textContent = this.qty;
        document.getElementById('qtyMinus').disabled = this.qty <= 1;
        document.getElementById('qtyPlus').disabled = this.qty >= available;

        const add = document.getElementById('addToCart');
        const sticky = document.getElementById('stickyAdd');
        if (soldOut) {
            add.textContent = 'Agotado';
            add.disabled = true;
            sticky.textContent = 'Agotado';
            sticky.disabled = true;
        } else if (available <= 0) {
            add.textContent = 'Ya tienes todo el stock';
            add.disabled = true;
            sticky.disabled = true;
        } else {
            add.textContent = this.qty > 1
                ? `Agregar ${this.qty} · ${ProductsManager.formatPrice(p.price * this.qty)}`
                : 'Agregar al carrito';
            add.disabled = false;
            sticky.textContent = 'Agregar';
            sticky.disabled = false;
        }
    },

    showError(msg, target) {
        const el = document.getElementById('pdpError');
        el.textContent = msg;
        el.hidden = false;
        const block = document.getElementById(target);
        if (block) {
            block.classList.remove('shake');
            void block.offsetWidth;
            block.classList.add('shake');
            const top = block.getBoundingClientRect().top + window.scrollY - 160;
            if (block.getBoundingClientRect().top < 120 || block.getBoundingClientRect().bottom > innerHeight) {
                window.scrollTo({ top, behavior: 'smooth' });
            }
        }
    },

    add() {
        const p = this.product;
        if (!p) return;
        if (p.colors.length > 1 && !this.color) return this.showError('Elige un color para continuar.', 'colorBlock');
        if (p.sizes.length > 1 && !this.size) return this.showError('Elige tu talla para continuar.', 'sizeBlock');
        document.getElementById('pdpError').hidden = true;

        const ok = CartManager.addToCart(p, this.size || '', this.color || '', this.qty);
        if (ok) {
            this.qty = 1;
            this.updateBuyState();
            UI.open('cartDrawer');
        }
    },

    // ===== Eventos =====
    bindStatic() {
        document.getElementById('addToCart').addEventListener('click', () => this.add());
        document.getElementById('stickyAdd').addEventListener('click', () => this.add());

        document.getElementById('qtyMinus').addEventListener('click', () => { if (this.qty > 1) { this.qty--; this.updateBuyState(); } });
        document.getElementById('qtyPlus').addEventListener('click', () => { this.qty++; this.updateBuyState(); });

        document.getElementById('colorOptions').addEventListener('click', (e) => {
            const b = e.target.closest('[data-color]');
            if (!b) return;
            this.color = b.dataset.color;
            document.querySelectorAll('#colorOptions .swatch').forEach(s => {
                const on = s === b;
                s.classList.toggle('is-active', on);
                s.setAttribute('aria-checked', on);
            });
            document.getElementById('pdpError').hidden = true;
            this.updateLabels();
        });

        document.getElementById('sizeOptions').addEventListener('click', (e) => {
            const b = e.target.closest('[data-size]');
            if (!b || b.disabled) return;
            this.size = b.dataset.size;
            document.querySelectorAll('#sizeOptions .size').forEach(s => {
                const on = s === b;
                s.classList.toggle('is-active', on);
                s.setAttribute('aria-checked', on);
            });
            document.getElementById('pdpError').hidden = true;
            this.updateLabels();
        });

        document.getElementById('sizeGuideOpen').addEventListener('click', () => UI.open('sizeModal'));
        document.addEventListener('pf:cart', () => { if (this.product) this.updateBuyState(); });

        // Galería: zoom (lightbox) y contador del slider móvil
        document.addEventListener('click', (e) => {
            const z = e.target.closest('[data-zoom]');
            if (z) this.openLightbox(+z.dataset.zoom);
        });

        const track = document.getElementById('pdpTrack');
        track.addEventListener('scroll', () => {
            const i = Math.round(track.scrollLeft / track.clientWidth);
            document.querySelectorAll('#pdpDots span').forEach((d, n) => d.classList.toggle('is-active', n === i));
        }, { passive: true });

        const lbTrack = document.getElementById('lightboxTrack');
        const lbCount = () => {
            const i = Math.round(lbTrack.scrollLeft / lbTrack.clientWidth);
            document.getElementById('lightboxCount').textContent = `${i + 1} / ${this.images.length}`;
            return i;
        };
        lbTrack.addEventListener('scroll', lbCount, { passive: true });
        document.getElementById('lightboxPrev').addEventListener('click', () => lbTrack.scrollBy({ left: -lbTrack.clientWidth, behavior: 'smooth' }));
        document.getElementById('lightboxNext').addEventListener('click', () => lbTrack.scrollBy({ left: lbTrack.clientWidth, behavior: 'smooth' }));
        document.addEventListener('keydown', (e) => {
            if (UI.openLayer?.id !== 'lightbox') return;
            if (e.key === 'ArrowRight') lbTrack.scrollBy({ left: lbTrack.clientWidth, behavior: 'smooth' });
            if (e.key === 'ArrowLeft') lbTrack.scrollBy({ left: -lbTrack.clientWidth, behavior: 'smooth' });
        });

        const closeIcon = PF.icons.close;
        document.querySelectorAll('#sizeModal [data-close], #lightbox [data-close]').forEach(b => { b.innerHTML = closeIcon; });
        document.getElementById('lightboxPrev').innerHTML = PF.icons.arrowLeft;
        document.getElementById('lightboxNext').innerHTML = PF.icons.arrowRight;

        // Barra de compra fija en móvil: aparece cuando el botón principal sale de pantalla.
        const buy = document.getElementById('pdpBuy');
        const sticky = document.getElementById('stickyBuy');
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(([entry]) => {
                const show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
                sticky.classList.toggle('is-visible', show);
                sticky.setAttribute('aria-hidden', String(!show));
                document.body.classList.toggle('has-sticky-buy', show);
            }).observe(buy);
        }
    },

    openLightbox(i) {
        UI.open('lightbox');
        const track = document.getElementById('lightboxTrack');
        requestAnimationFrame(() => {
            track.scrollTo({ left: track.clientWidth * i, behavior: 'instant' });
            document.getElementById('lightboxCount').textContent = `${i + 1} / ${this.images.length}`;
        });
    }
};

Product.init();
