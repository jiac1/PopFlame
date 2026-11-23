// Baja del newsletter: link "Darme de baja" de los correos, pages/baja.html?t=<código>.
// El código es secreto y distinto para cada suscriptor (subscribers.unsubscribe_token), así nadie
// puede dar de baja a otra persona escribiendo su correo. La baja se confirma con un botón (y no al
// abrir el link) porque algunos programas de correo abren los links solos para revisarlos.
const Baja = {
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,

    init() {
        const token = (new URLSearchParams(location.search).get('t') || '').trim();
        Site.start({});
        if (!this.UUID.test(token)) {
            this.show('Usa el link de tu correo',
                'Para darte de baja, abre el link <strong>Darme de baja</strong> que viene al final de cualquiera de nuestros correos. ' +
                'Si no lo encuentras, escríbenos por WhatsApp o Instagram y lo hacemos por ti.');
            return;
        }
        document.getElementById('bajaBtn').addEventListener('click', () => this.submit(token));
    },

    show(title, html) {
        document.getElementById('bajaTitle').textContent = title;
        document.getElementById('bajaText').innerHTML = html;
        document.getElementById('bajaForm').innerHTML =
            `<a class="btn btn-dark btn-block" href="${PF.url('index.html')}">Volver a la tienda</a>`;
    },

    async submit(token) {
        const btn = document.getElementById('bajaBtn');
        btn.classList.add('is-loading');
        btn.disabled = true;
        try {
            const { data, error } = await supabaseClient.rpc('unsubscribe_with_token', { p_token: token });
            if (error) throw error;
            if (!data) {
                this.show('Link no válido',
                    'Este link de baja no es válido. Revisa que lo hayas copiado completo, o escríbenos por WhatsApp o Instagram y lo hacemos por ti.');
                return;
            }
            this.show('Listo', `<strong>${PF.escape(data)}</strong> ya no recibirá nuestros correos.`);
        } catch (err) {
            btn.classList.remove('is-loading');
            btn.disabled = false;
            UI.toast('No pudimos procesar la baja. Escríbenos por WhatsApp o Instagram y lo hacemos por ti.', 'error');
        }
    }
};

Baja.init();
