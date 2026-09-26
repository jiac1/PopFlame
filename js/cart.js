// Cart Manager
const CartManager = {
    cart: [],
    storageKey: 'popflame_cart',

    // Initialize cart from localStorage
    init() {
        const savedCart = localStorage.getItem(this.storageKey);
        if (savedCart) {
            this.cart = JSON.parse(savedCart);
        }
        this.updateUI();
        this.setupEventListeners();
    },

    // Setup event listeners
    setupEventListeners() {
        const cartBtn = document.getElementById('cartBtn');
        const cartClose = document.getElementById('cartClose');
        const cartOverlay = document.getElementById('cartOverlay');

        if (cartBtn) {
            cartBtn.addEventListener('click', () => this.openDrawer());
        }

        if (cartClose) {
            cartClose.addEventListener('click', () => this.closeDrawer());
        }

        if (cartOverlay) {
            cartOverlay.addEventListener('click', () => this.closeDrawer());
        }
    },

    // Add product to cart
    addToCart(product, size, color, quantity = 1) {
        const existingItem = this.cart.find(
            item => item.productId === product.id && item.size === size && item.color === color
        );

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.cart.push({
                productId: product.id,
                name: product.name,
                price: product.price,
                size: size,
                color: color,
                quantity: quantity,
                image: product.image
            });
        }

        this.saveCart();
        this.updateUI();
        this.showNotification('Producto agregado al carrito');
    },

    // Remove item from cart
    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.saveCart();
        this.updateUI();
    },

    // Update item quantity
    updateQuantity(index, change) {
        const item = this.cart[index];
        item.quantity += change;

        if (item.quantity <= 0) {
            this.removeFromCart(index);
        } else {
            this.saveCart();
            this.updateUI();
        }
    },

    // Get cart items
    getItems() {
        return this.cart;
    },

    // Get cart count
    getCount() {
        return this.cart.reduce((total, item) => total + item.quantity, 0);
    },

    // Get cart subtotal
    getSubtotal() {
        return this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    },

    // Get shipping cost (usa la configuración cargada desde Supabase, con fallback)
    getShipping() {
        const subtotal = this.getSubtotal();
        const freeMin = ProductsManager.config?.freeShippingMin ?? 50000;
        const cost = ProductsManager.config?.shippingCost ?? 5990;
        return subtotal >= freeMin ? 0 : cost;
    },

    // Get total
    getTotal() {
        return this.getSubtotal() + this.getShipping();
    },

    // Format price
    formatPrice(price) {
        return '$' + price.toLocaleString('es-CL');
    },

    // El carrito se renderiza tanto en index.html (raíz) como en pages/*.html
    getImagePrefix() {
        return window.location.pathname.includes('/pages/') ? '../' : '';
    },

    // Save cart to localStorage
    saveCart() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.cart));
    },

    // Clear cart
    clearCart() {
        this.cart = [];
        this.saveCart();
        this.updateUI();
    },

    // Update UI elements
    updateUI() {
        this.updateCount();
        this.updateDrawer();
        this.updateTotals();
    },

    // Update cart count badge
    updateCount() {
        const countEl = document.getElementById('cartCount');
        if (countEl) {
            countEl.textContent = this.getCount();
            countEl.style.display = this.getCount() > 0 ? 'flex' : 'none';
        }
    },

    // Update cart drawer content
    updateDrawer() {
        const container = document.getElementById('cartItems');
        const footer = document.getElementById('cartFooter');
        
        if (!container) return;

        if (this.cart.length === 0) {
            const homePrefix = this.getImagePrefix();
            container.innerHTML = `
                <div class="cart-empty">
                    <p>Tu carrito está vacío</p>
                    <a href="${homePrefix}index.html" class="btn btn-secondary mt-24">IR A LA TIENDA</a>
                </div>
            `;
            if (footer) footer.style.display = 'none';
            return;
        }

        if (footer) footer.style.display = 'block';

        const imgPrefix = this.getImagePrefix();
        container.innerHTML = this.cart.map((item, index) => `
            <div class="cart-item">
                <img src="${ProductsManager.resolveImagePath(item.image, imgPrefix)}" alt="${item.name}" class="cart-item-image">
                <div class="cart-item-details">
                    <h4 class="cart-item-name">${item.name}</h4>
                    <p class="cart-item-variant">Talla: ${item.size} | Color: ${item.color}</p>
                    <div class="cart-item-controls">
                        <button class="cart-qty-btn" onclick="CartManager.updateQuantity(${index}, -1)">-</button>
                        <span class="cart-item-qty">${item.quantity}</span>
                        <button class="cart-qty-btn" onclick="CartManager.updateQuantity(${index}, 1)">+</button>
                        <button class="cart-item-remove" onclick="CartManager.removeFromCart(${index})">Eliminar</button>
                    </div>
                </div>
                <span class="cart-item-price">${this.formatPrice(item.price * item.quantity)}</span>
            </div>
        `).join('');
    },

    // Update totals
    updateTotals() {
        const totalEl = document.getElementById('cartTotal');
        if (totalEl) {
            totalEl.textContent = this.formatPrice(this.getTotal());
        }
    },

    // Open cart drawer
    openDrawer() {
        document.getElementById('cartDrawer')?.classList.add('active');
        document.getElementById('cartOverlay')?.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    // Close cart drawer
    closeDrawer() {
        document.getElementById('cartDrawer')?.classList.remove('active');
        document.getElementById('cartOverlay')?.classList.remove('active');
        document.body.style.overflow = '';
    },

    // Show notification
    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: var(--primary);
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            z-index: 3000;
            animation: fadeIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    },

    // Generate WhatsApp message
    generateWhatsAppMessage(customerData, orderNumber) {
        const items = this.cart.map((item, index) =>
            `${index + 1}. ${item.name} x${item.quantity} - ${this.formatPrice(item.price * item.quantity)}`
        ).join('\n');

        const message = `🔥 *Nuevo Pedido PopFlame* 🔥
${orderNumber ? `\n🧾 *Pedido:* ${orderNumber}\n` : ''}
📦 *Productos:*
${items}

💰 *Subtotal:* ${this.formatPrice(this.getSubtotal())}
🚚 *Envío:* ${this.getShipping() === 0 ? 'GRATIS' : this.formatPrice(this.getShipping())}
💵 *TOTAL:* ${this.formatPrice(this.getTotal())}

👤 *Datos del Cliente:*
- Nombre: ${customerData.name}
- Email: ${customerData.email}
- Teléfono: ${customerData.phone}
${customerData.meetingPoint ? `- Estación de Metro preferida: ${customerData.meetingPoint}\n` : ''}${customerData.note ? `- Nota: ${customerData.note}\n` : ''}
📍 *Entrega:* presencial en Metro de Santiago (a coordinar). Si es fuera de Santiago o zona alejada, lo coordinamos por acá.
📝 *Nota:* Pago por transferencia bancaria`;

        return encodeURIComponent(message);
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CartManager;
}