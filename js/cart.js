// Carrito (localStorage) + mensaje de WhatsApp del pedido.
const CartManager = {
    cart: [],
    storageKey: 'popflame_cart',

    init() {
        try {
            this.cart = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
            if (!Array.isArray(this.cart)) this.cart = [];
        } catch (e) {
            this.cart = [];
        }
        this.updateUI();
    },

    // Con los productos ya cargados, actualiza precio/nombre/foto de lo que hay en el carrito
    // y quita lo que ya no existe o se agotó (así el total nunca queda desactualizado).
    // El límite se revisa contra la SUMA de todas las líneas del producto (S + M + L…) y contra el
    // stock de cada talla. Antes se comparaba cada línea por separado: con stock 5, un carrito con
    // 3 S y 3 M quedaba con 6 y recién el servidor lo rechazaba al pagar.
    sync() {
        if (!ProductsManager.loaded || !ProductsManager.products.length) return;
        let changed = false;
        const usedTotal = {};
        const usedSize = {};
        const kept = [];
        for (const item of this.cart) {
            const p = ProductsManager.getProductById(item.productId);
            if (!p || (p.stock <= 0 && p.status !== 'a_pedido')) { changed = true; continue; }
            if (item.price !== p.price || item.name !== p.name || item.image !== p.image) {
                item.price = p.price; item.name = p.name; item.image = p.image;
                changed = true;
            }
            const sizeKey = `${p.id}|${item.size}`;
            const leftTotal = this.maxFor(p.id) - (usedTotal[p.id] || 0);
            const leftSize = ProductsManager.availableFor(p, item.size) - (usedSize[sizeKey] || 0);
            const allowed = Math.max(0, Math.min(leftTotal, leftSize));
            if (item.quantity > allowed) { item.quantity = allowed; changed = true; }
            if (item.quantity <= 0) { changed = true; continue; }
            usedTotal[p.id] = (usedTotal[p.id] || 0) + item.quantity;
            usedSize[sizeKey] = (usedSize[sizeKey] || 0) + item.quantity;
            kept.push(item);
        }
        this.cart = kept;
        if (changed) this.save();
        this.updateUI();
    },

    maxFor(productId) {
        const p = ProductsManager.getProductById(productId);
        if (!p) return 99;
        if (p.status === 'a_pedido') return 99;
        return Math.max(0, p.stock);
    },

    quantityOf(productId) {
        return this.cart.filter(i => i.productId === productId).reduce((t, i) => t + i.quantity, 0);
    },

    quantityOfSize(productId, size) {
        return this.cart.filter(i => i.productId === productId && i.size === size).reduce((t, i) => t + i.quantity, 0);
    },

    // Unidades que todavía se pueden agregar de esa talla: respeta el total del producto (entre todas
    // sus tallas) y el stock propio de la talla, si lo tiene.
    remainingFor(product, size) {
        const isOrder = product.status === 'a_pedido';
        const leftTotal = (isOrder ? this.maxFor(product.id) : product.stock) - this.quantityOf(product.id);
        const leftSize = ProductsManager.availableFor(product, size) - this.quantityOfSize(product.id, size);
        return Math.max(0, Math.min(leftTotal, leftSize));
    },

    // Devuelve true si se agregó.
    addToCart(product, size, color, quantity = 1) {
        // Solo los productos "A Pedido" se hacen por encargo y no tienen límite de stock.
        // "Pocas Unidades" sí tiene stock real y lo respeta como cualquier otro producto.
        // Igual "A Pedido" tiene un tope: el servidor acepta hasta 99 unidades por producto.
        const isOrder = product.status === 'a_pedido';
        const available = this.remainingFor(product, size);

        if (available <= 0) {
            const sizeFull = !isOrder && ProductsManager.tracksSize(product, size)
                && product.stock - this.quantityOf(product.id) > 0;
            UI.toast(isOrder ? 'Puedes encargar hasta 99 unidades de este producto'
                : sizeFull ? `Ya tienes en el carrito todo el stock de la talla ${size}`
                : 'Ya tienes en el carrito todo el stock disponible', 'error');
            return false;
        }

        const qty = Math.min(quantity, available);

        const existing = this.cart.find(i => i.productId === product.id && i.size === size && i.color === color);
        if (existing) {
            existing.quantity += qty;
        } else {
            this.cart.push({
                productId: product.id,
                name: product.name,
                price: product.price,
                size,
                color,
                quantity: qty,
                image: product.image
            });
        }

        this.save();
        this.updateUI();
        this.bumpCount();
        if (qty < quantity) UI.toast(`Solo quedaban ${qty} unidades disponibles`, 'error');
        return true;
    },

    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.save();
        this.updateUI();
    },

    updateQuantity(index, change) {
        const item = this.cart[index];
        if (!item) return;
        const next = item.quantity + change;
        if (next <= 0) return this.removeFromCart(index);
        if (change > 0 && this.quantityOf(item.productId) + change > this.maxFor(item.productId)) {
            UI.toast('No hay más stock disponible de este producto', 'error');
            return;
        }
        const p = ProductsManager.getProductById(item.productId);
        if (change > 0 && p && this.quantityOfSize(item.productId, item.size) + change > ProductsManager.availableFor(p, item.size)) {
            UI.toast(`No hay más stock de la talla ${item.size}`, 'error');
            return;
        }
        item.quantity = next;
        this.save();
        this.updateUI();
    },

    // "Talla M · Negro". La talla "Única" no aporta información y se omite.
    variantLabel(item) {
        const size = item.size && !/^[úu]nica$/i.test(item.size.trim()) ? `Talla ${item.size}` : '';
        return [size, item.color].filter(Boolean).join(' · ');
    },

    getItems() { return this.cart; },
    getCount() { return this.cart.reduce((t, i) => t + i.quantity, 0); },
    getSubtotal() { return this.cart.reduce((t, i) => t + i.price * i.quantity, 0); },

    getShipping() {
        const cfg = ProductsManager.config || {};
        const cost = Number(cfg.shippingCost || 0);
        const freeMin = Number(cfg.freeShippingMin || 0);
        if (!cost) return 0;
        return this.getSubtotal() >= freeMin && freeMin > 0 ? 0 : cost;
    },

    shippingLabel() {
        const s = this.getShipping();
        return s === 0 ? 'Gratis en Metro' : this.formatPrice(s);
    },

    getTotal() { return this.getSubtotal() + this.getShipping(); },
    formatPrice(price) { return ProductsManager.formatPrice(price); },

    save() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.cart)); } catch (e) { /* ignorado */ }
    },

    clearCart() {
        this.cart = [];
        this.save();
        this.updateUI();
    },

    bumpCount() {
        const el = document.getElementById('cartCount');
        if (!el) return;
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
    },

    updateUI() {
        document.dispatchEvent(new Event('pf:cart'));
        const count = this.getCount();
        const countEl = document.getElementById('cartCount');
        if (countEl) {
            countEl.textContent = count;
            countEl.classList.toggle('is-visible', count > 0);
        }
        const drawerCount = document.getElementById('cartDrawerCount');
        if (drawerCount) drawerCount.textContent = count ? `(${count})` : '';

        const container = document.getElementById('cartItems');
        const foot = document.getElementById('cartFoot');
        if (!container) return;

        if (this.cart.length === 0) {
            container.innerHTML = `
                <div class="cart-empty">
                    ${PF.icons.bag}
                    <h4>Tu carrito está vacío</h4>
                    <p>Explora la colección y encuentra tu próxima prenda favorita.</p>
                    <a href="${PF.url('pages/categoria.html')}" class="btn btn-dark">Ver productos</a>
                </div>`;
            if (foot) foot.hidden = true;
            return;
        }

        if (foot) foot.hidden = false;
        container.innerHTML = this.cart.map((item, index) => {
            const max = this.maxFor(item.productId);
            const atMax = this.quantityOf(item.productId) >= max;
            const variant = PF.escape(this.variantLabel(item));
            const url = PF.url(`pages/producto.html?id=${item.productId}`);
            return `
                <div class="cart-line">
                    <a href="${url}"><img class="cart-line-img" src="${PF.escape(ProductsManager.resolveImagePath(item.image))}" alt="${PF.escape(item.name)}" loading="lazy"></a>
                    <div>
                        <div class="cart-line-top">
                            <a href="${url}" class="cart-line-name">${PF.escape(item.name)}</a>
                            <span class="cart-line-price">${this.formatPrice(item.price * item.quantity)}</span>
                        </div>
                        <p class="cart-line-variant">${variant}</p>
                        <div class="cart-line-bottom">
                            <div class="stepper" role="group" aria-label="Cantidad">
                                <button type="button" data-cart-qty="${index}" data-delta="-1" aria-label="Quitar uno">−</button>
                                <span>${item.quantity}</span>
                                <button type="button" data-cart-qty="${index}" data-delta="1" aria-label="Agregar uno" ${atMax ? 'disabled' : ''}>+</button>
                            </div>
                            <button type="button" class="cart-line-remove" data-cart-remove="${index}">Eliminar</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('cartSubtotal', this.formatPrice(this.getSubtotal()));
        set('cartShipping', this.shippingLabel());
        set('cartTotal', this.formatPrice(this.getTotal()));
    },

    // Número de WhatsApp en formato internacional sin "+" ni espacios (wa.me no acepta otro formato).
    whatsappNumber() {
        const raw = String(ProductsManager.config?.whatsappNumber || '').replace(/\D/g, '');
        if (!raw) return '';
        if (raw.length === 9 && raw.startsWith('9')) return '56' + raw;
        return raw;
    },

    whatsappLink(text) {
        const n = this.whatsappNumber();
        if (!n) return '';
        return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
    },

    // total: el que calculó el servidor (create_order); si no viene, se calcula con el carrito.
    generateWhatsAppText(customer, orderNumber, items = this.cart, total = null) {
        const subtotal = items.reduce((t, i) => t + i.price * i.quantity, 0);
        const orderTotal = Number.isFinite(Number(total)) && total !== null ? Number(total) : subtotal + this.getShipping();
        const orderItems = [];
        const normalItems = [];
        items.forEach(i => {
            const p = ProductsManager.getProductById(i.productId);
            if (p?.status === 'a_pedido') orderItems.push(i);
            else normalItems.push(i);
        });

        const normalLines = normalItems.map((i, n) =>
            `${n + 1}. ${i.name}${this.variantLabel(i) ? ` (${this.variantLabel(i).replace(' · ', ', ')})` : ''} x${i.quantity} — ${this.formatPrice(i.price * i.quantity)}`
        ).join('\n');

        const orderLines = orderItems.map((i, n) =>
            `${n + 1}. ${i.name}${this.variantLabel(i) ? ` (${this.variantLabel(i).replace(' · ', ', ')})` : ''} x${i.quantity} — ${this.formatPrice(i.price * i.quantity)} (A PEDIDO - se hace por encargo)`
        ).join('\n');

        const parts = [
            `Hola PopFlame! Quiero confirmar mi pedido${orderNumber ? ` *${orderNumber}*` : ''}`,
            '',
            ...(normalLines ? ['*Productos:*', normalLines, ''] : []),
            `*Total:* ${this.formatPrice(orderTotal)}`,
            `*Entrega:* ${customer.meetingPoint ? `Metro ${customer.meetingPoint}` : 'Metro de Santiago (a coordinar)'}`,
            '',
            '*Mis datos:*',
            `${customer.name}`,
            `${customer.phone}`,
            `${customer.email}`,
            customer.note ? `Nota: ${customer.note}` : ''
        ];

        if (orderLines) {
            parts.push(
                '',
                '*Productos A Pedido (se hacen por encargo):*',
                orderLines,
                '',
                'Los productos marcados como "A Pedido" no tienen stock inmediato. Te contactaremos para coordinar los tiempos de entrega.'
            );
        }

        parts.push(
            '',
            ProductsManager.config?.transferInfo
                ? 'Te adjunto el comprobante de la transferencia.'
                : 'Quedo atento/a a los datos para la transferencia.'
        );

        return parts.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CartManager;
}
