// Baja del newsletter (link "Darme de baja" de los correos): pages/baja.html?email=...
const Baja = {
    init() {
        const input = document.getElementById('bajaEmail');
        input.value = new URLSearchParams(location.search).get('email') || '';
        document.getElementById('bajaForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit(input.value.trim());
        });
        Site.start({});
    },

    async submit(email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            UI.toast('Revisa tu correo, parece incompleto', 'error');
            return;
        }
        const btn = document.getElementById('bajaBtn');
        btn.classList.add('is-loading');
        try {
            const { error } = await supabaseClient.rpc('unsubscribe_newsletter', { p_email: email });
            if (error) throw error;
            document.getElementById('bajaTitle').textContent = 'Listo';
            document.getElementById('bajaText').innerHTML =
                `<strong>${PF.escape(email)}</strong> ya no recibirá nuestros correos. Si fue un error, puedes volver a suscribirte desde el pie de la tienda cuando quieras.`;
            document.getElementById('bajaForm').innerHTML =
                `<a class="btn btn-dark btn-block" href="${PF.url('index.html')}">Volver a la tienda</a>`;
        } catch (err) {
            btn.classList.remove('is-loading');
            UI.toast('No pudimos procesar la baja. Escríbenos por WhatsApp o Instagram y lo hacemos por ti.', 'error');
        }
    }
};

Baja.init();
