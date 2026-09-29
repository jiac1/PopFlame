// Checkout: valida los datos, guarda el pedido en Supabase y lo envía por WhatsApp.
const Checkout = {
    submitting: false,
    profileKey: 'pf_customer',

    stations: [
        'San Pablo', 'Neptuno', 'Pajaritos', 'Las Rejas', 'Ecuador', 'San Alberto Hurtado', 'Universidad de Santiago', 'Estación Central',
        'Unión Latinoamericana', 'República', 'Los Héroes', 'La Moneda', 'Universidad de Chile', 'Santa Lucía', 'Universidad Católica',
        'Baquedano', 'Salvador', 'Manuel Montt', 'Pedro de Valdivia', 'Los Leones', 'Tobalaba', 'El Golf', 'Alcántara', 'Escuela Militar',
        'Manquehue', 'Hernando de Magallanes', 'Los Dominicos', 'Vespucio Norte', 'Zapadores', 'Dorsal', 'Einstein', 'Cementerios',
        'Cerro Blanco', 'Patronato', 'Puente Cal y Canto', 'Parque O\'Higgins', 'Rondizzoni', 'Franklin', 'El Llano', 'San Miguel',
        'Lo Vial', 'Departamental', 'Ciudad del Niño', 'Lo Ovalle', 'El Parrón', 'La Cisterna', 'Los Libertadores', 'Plaza Egaña',
        'Los Orientales', 'Grecia', 'Los Presidentes', 'Quilín', 'Las Torres', 'Macul', 'Vicuña Mackenna', 'Vicente Valdés',
        'Rojas Magallanes', 'Trinidad', 'San José de la Estrella', 'Los Quillayes', 'Elisa Correa', 'Hospital Sótero del Río',
        'Protectora de la Infancia', 'Las Mercedes', 'Plaza de Puente Alto', 'Plaza de Maipú', 'Santiago Bueras', 'Del Sol', 'Monte Tabor',
        'Las Parcelas', 'Laguna Sur', 'Barrancas', 'Pudahuel', 'Lo Prado', 'Blanqueado', 'Gruta de Lourdes', 'Quinta Normal',
        'Cumming', 'Plaza de Armas', 'Bellas Artes', 'Parque Bustamante', 'Santa Isabel', 'Irarrázaval', 'Ñuble', 'Rodrigo de Araya',
        'Carlos Valdovinos', 'Camino Agrícola', 'San Joaquín', 'Pedrero', 'Mirador', 'Bellavista de La Florida', 'Cerrillos',
        'Lo Valledor', 'Pedro Aguirre Cerda', 'Biobío', 'Estadio Nacional', 'Ñuñoa', 'Inés de Suárez', 'Los Libertadores',
        'Cardenal Caro', 'Vivaceta', 'Conchalí', 'Plaza Chacabuco', 'Hospitales', 'Puente Cal y Canto', 'Matta', 'Chile España',
        'Villa Frei', 'Plaza Egaña', 'Fernando Castillo Velasco', 'Cristóbal Colón', 'Francisco Bilbao', 'Príncipe de Gales',
        'Simón Bolívar', 'Monseñor Eyzaguirre', 'Plaza Maipú'
    ],

    init() {
        this.fillStations();
        this.restoreProfile();
        this.setButtons();

        document.getElementById('checkoutForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit();
        });
        document.getElementById('summaryToggle').addEventListener('click', () => {
            const s = document.getElementById('summary');
            const open = s.classList.toggle('is-open');
            document.getElementById('summaryToggle').setAttribute('aria-expanded', open);
            document.querySelector('#summaryToggle span').textContent = open ? 'Ocultar resumen del pedido' : 'Ver resumen del pedido';
        });
        document.querySelectorAll('#checkoutForm input').forEach(input => {
            input.addEventListener('blur', () => { if (input.value) this.validateField(input); });
            input.addEventListener('input', () => { if (input.closest('.field')?.classList.contains('has-error')) this.validateField(input); });
        });
        document.addEventListener('pf:cart', () => this.renderSummary());

        Site.start({ render: () => this.renderSummary() });
    },

    fillStations() {
        const list = [...new Set(this.stations)].sort((a, b) => a.localeCompare(b, 'es'));
        document.getElementById('metroStations').innerHTML = list.map(s => `<option value="${PF.escape(s)}">`).join('');
    },

    setButtons() {
        const label = `${PF.icons.whatsapp}<span>Enviar pedido por WhatsApp</span>`;
        document.getElementById('submitDesktop').innerHTML = label;
        document.getElementById('submitMobile').innerHTML = label;
    },

    renderSummary() {
        if (this.done) return;
        const items = CartManager.getItems();
        if (!items.length) {
            document.getElementById('checkoutRoot').innerHTML = `
                <div class="empty-state">
                    <h3>Tu carrito está vacío</h3>
                    <p>Agrega productos para finalizar tu compra.</p>
                    <a class="btn btn-dark" href="${PF.url('pages/categoria.html')}">Ver productos</a>
                </div>`;
            return;
        }

        document.getElementById('summaryLines').innerHTML = items.map(i => `
            <div class="summary-line">
                <div class="summary-thumb">
                    <img src="${ProductsManager.resolveImagePath(i.image)}" alt="" loading="lazy">
                    <b>${i.quantity}</b>
                </div>
                <div>
                    <h5>${PF.escape(i.name)}</h5>
                    <p>${PF.escape(CartManager.variantLabel(i))}</p>
                </div>
                <span class="price">${ProductsManager.formatPrice(i.price * i.quantity)}</span>
            </div>`).join('');

        const total = ProductsManager.formatPrice(CartManager.getTotal());
        document.getElementById('sumSubtotal').textContent = ProductsManager.formatPrice(CartManager.getSubtotal());
        document.getElementById('sumShipping').textContent = CartManager.shippingLabel();
        document.getElementById('sumTotal').textContent = total;
        document.getElementById('summaryToggleTotal').textContent = total;
    },

    // ===== Validación =====
    normalizePhone(value) {
        let d = String(value).replace(/\D/g, '');
        if (d.startsWith('56')) d = d.slice(2);
        if (d.length === 8) d = '9' + d;
        if (d.length !== 9) return null;
        return `+56 ${d[0]} ${d.slice(1, 5)} ${d.slice(5)}`;
    },

    validateField(input) {
        const field = input.closest('.field');
        const msg = field?.querySelector('.field-msg');
        const v = input.value.trim();
        let error = '';

        if (input.required && !v) error = 'Este campo es obligatorio.';
        else if (input.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) error = 'Revisa tu correo, parece incompleto.';
        else if (input.name === 'phone' && v) {
            const phone = this.normalizePhone(v);
            if (!phone) error = 'Ingresa un celular chileno válido (ej: +56 9 1234 5678).';
            else input.value = phone;
        } else if ((input.name === 'name' || input.name === 'lastName') && v.length < 2) error = 'Ingresa al menos 2 letras.';

        field?.classList.toggle('has-error', !!error);
        if (msg) msg.textContent = error;
        input.setAttribute('aria-invalid', error ? 'true' : 'false');
        return !error;
    },

    validate() {
        const inputs = [...document.querySelectorAll('#checkoutForm input[required]')];
        const results = inputs.map(i => this.validateField(i));
        const firstBad = inputs[results.indexOf(false)];
        if (firstBad) {
            firstBad.focus();
            firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return false;
        }
        return true;
    },

    restoreProfile() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.profileKey) || 'null');
            if (!saved) return;
            ['name', 'lastName', 'email', 'phone', 'meetingPoint'].forEach(k => {
                const el = document.getElementById(k);
                if (el && saved[k] && !el.value) el.value = saved[k];
            });
        } catch (e) { /* sin datos guardados */ }
    },

    saveProfile(data) {
        try { localStorage.setItem(this.profileKey, JSON.stringify(data)); } catch (e) { /* ignorado */ }
    },

    setLoading(on) {
        ['submitDesktop', 'submitMobile'].forEach(id => {
            const b = document.getElementById(id);
            b.classList.toggle('is-loading', on);
            b.disabled = on;
        });
    },

    // ===== Envío =====
    async submit() {
        if (this.submitting) return;
        if (!CartManager.getItems().length) return;
        if (!this.validate()) {
            UI.toast('Revisa los campos marcados', 'error');
            return;
        }

        const f = new FormData(document.getElementById('checkoutForm'));
        const get = (k) => String(f.get(k) || '').trim();
        const profile = {
            name: get('name'), lastName: get('lastName'), email: get('email').toLowerCase(),
            phone: get('phone'), meetingPoint: get('meetingPoint')
        };
        const customer = {
            name: `${profile.name} ${profile.lastName}`.trim(),
            email: profile.email,
            phone: profile.phone,
            meetingPoint: profile.meetingPoint,
            note: get('note')
        };

        // En computador se abre la pestaña de WhatsApp dentro del clic (si se abre después de
        // esperar a Supabase, el navegador la bloquea como pop-up). En el celular se usa el botón
        // de la pantalla de confirmación, que abre la app directamente.
        const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const hasWhatsapp = !!CartManager.whatsappNumber();
        let win = null;
        if (isDesktop && hasWhatsapp) {
            win = window.open('', '_blank');
            if (win) win.document.write('<title>PopFlame</title><p style="font-family:sans-serif;padding:24px">Abriendo WhatsApp…</p>');
        }

        this.submitting = true;
        this.setLoading(true);

        const items = CartManager.getItems().map(i => ({ ...i }));
        try {
            const order = await this.createOrder(customer, items);

            const text = CartManager.generateWhatsAppText(customer, order.order_number, items);
            const link = CartManager.whatsappLink(text);

            this.saveProfile(profile);
            CartManager.clearCart();
            this.done = true;
            this.renderConfirmation(order, customer, link);

            if (win && link) win.location.href = link;
            else if (win) win.close();
        } catch (err) {
            console.error('Error creando el pedido:', err);
            if (win) win.close();
            UI.toast(err.userMessage || 'No pudimos registrar tu pedido. Revisa tu conexión e intenta de nuevo.', 'error');
            if (err.userMessage) ProductsManager.load(() => CartManager.sync());
            this.setLoading(false);
            this.submitting = false;
        }
    },

    // Crea el pedido con la función segura del servidor (recalcula precios y valida stock).
    // Si esa función todavía no está instalada en Supabase, guarda el pedido con un insert simple.
    async createOrder(customer, items) {
        const { data, error } = await supabaseClient.rpc('create_order', {
            p_customer: customer,
            p_items: items.map(i => ({ productId: i.productId, quantity: i.quantity, size: i.size, color: i.color }))
        });
        if (!error) return Array.isArray(data) ? data[0] : data;

        const missingFn = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
        if (!missingFn) {
            const e = new Error(error.message);
            e.userMessage = /stock|existe|vacío/i.test(error.message) ? error.message : null;
            throw e;
        }

        const { error: insertError } = await supabaseClient.from('orders').insert({
            customer_name: customer.name,
            customer_email: customer.email,
            customer_phone: customer.phone,
            customer_address: customer.meetingPoint || null,
            note: customer.note || null,
            items,
            subtotal: CartManager.getSubtotal(),
            shipping: CartManager.getShipping(),
            total: CartManager.getTotal(),
            status: 'pending',
            payment_method: 'transfer'
        });
        if (insertError) throw insertError;
        return { order_number: '', total: CartManager.getTotal() };
    },

    renderConfirmation(order, customer, link) {
        window.scrollTo({ top: 0 });
        document.querySelector('.page-head')?.remove();
        document.getElementById('checkoutRoot').innerHTML = `
            <div class="confirm">
                <div class="confirm-icon">${PF.icons.check}</div>
                <h1>¡Pedido recibido!</h1>
                ${order.order_number ? `<div class="confirm-number">${PF.escape(order.order_number)}</div>` : ''}
                <p>Gracias, ${PF.escape(customer.name.split(' ')[0])}. ${link
                    ? 'Para completar tu compra, envíanos el pedido por WhatsApp y te compartimos los datos de transferencia.'
                    : 'Te contactaremos por WhatsApp o correo para coordinar el pago y la entrega.'}</p>
                <ol class="confirm-steps">
                    <li><b>1</b><span>Envía tu pedido por WhatsApp${link ? '' : ' (te escribiremos nosotros)'}.</span></li>
                    <li><b>2</b><span>Te enviamos los datos de transferencia. Tu pedido queda reservado por 24 horas.</span></li>
                    <li><b>3</b><span>Coordinamos la entrega en la estación de Metro${customer.meetingPoint ? ` <strong>${PF.escape(customer.meetingPoint)}</strong>` : ''} o el envío a tu región.</span></li>
                </ol>
                <div class="confirm-actions">
                    ${link ? `<a class="btn btn-whatsapp btn-block" href="${PF.escape(link)}" target="_blank" rel="noopener">${PF.icons.whatsapp}<span>Enviar pedido por WhatsApp</span></a>` : ''}
                    <a class="btn btn-outline btn-block" href="${PF.url('index.html')}">Volver a la tienda</a>
                </div>
            </div>`;
        document.title = `Pedido ${order.order_number || 'recibido'} | PopFlame`;
    }
};

Checkout.init();
