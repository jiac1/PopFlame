// Páginas de ayuda editables desde el panel (tabla pages): envíos, devoluciones, guía de tallas, contacto.
const Info = {
    pages: [
        ['envios', 'Envíos y entregas'],
        ['devoluciones', 'Cambios y devoluciones'],
        ['guia-de-talles', 'Guía de tallas'],
        ['contacto', 'Contacto']
    ],
    page: null,

    init() {
        this.slug = new URLSearchParams(location.search).get('slug') || 'envios';
        document.getElementById('helpNav').innerHTML = this.pages.map(([s, t]) =>
            `<a href="${PF.url('pages/info.html?slug=' + s)}" class="${s === this.slug ? 'is-active' : ''}"${s === this.slug ? ' aria-current="page"' : ''}>${t}</a>`).join('');
        const nav = document.getElementById('helpNav');
        const active = nav.querySelector('.is-active');
        if (active) nav.scrollLeft = active.offsetLeft - 16;
        const label = this.pages.find(([s]) => s === this.slug)?.[1] || 'Ayuda';
        document.getElementById('infoTitle').textContent = label;
        document.getElementById('crumbPage').textContent = label;

        this.loadPage();
        Site.start({ render: () => this.renderExtra() });
    },

    async loadPage() {
        const content = document.getElementById('infoContent');
        try {
            const { data, error } = await supabaseClient.from('pages').select('*').eq('slug', this.slug).maybeSingle();
            if (error) throw error;
            if (!data) {
                document.getElementById('infoTitle').textContent = 'Página no encontrada';
                content.innerHTML = `<p>Esta página no existe o todavía no tiene contenido. <a href="${PF.url('index.html')}">Volver al inicio</a>.</p>`;
                return;
            }
            this.page = data;
            document.getElementById('infoTitle').textContent = data.title;
            document.getElementById('crumbPage').textContent = data.title;
            // Contenido escrito por el super_admin desde el panel (HTML simple).
            content.innerHTML = data.content || '';
            Site.setMeta(`${data.title} | PopFlame`, content.textContent.trim().slice(0, 155));
        } catch (e) {
            content.innerHTML = '<p>No pudimos cargar esta página. Revisa tu conexión e intenta de nuevo.</p>';
        }
    },

    renderExtra() {
        const extra = document.getElementById('infoExtra');
        if (this.slug === 'guia-de-talles') {
            const cats = ProductsManager.getVisibleCategories().filter(c => ProductsManager.getSizeGuideTable(c.id).rows.length);
            extra.innerHTML = cats.map(c => `
                <h2 class="size-guide-category-heading">${PF.escape(c.name)}</h2>
                ${ProductsManager.renderSizeGuideHtml(c.id)}`).join('');
            return;
        }

        if (this.slug === 'contacto' || this.slug === 'envios' || this.slug === 'devoluciones') {
            const cards = [];
            const wa = CartManager.whatsappLink('Hola PopFlame! Tengo una consulta.');
            if (wa) cards.push(`<a class="contact-card" href="${PF.escape(wa)}" target="_blank" rel="noopener">${PF.icons.whatsapp}<div><strong>WhatsApp</strong><span>Respuesta rápida, todos los días</span></div></a>`);
            const ig = ProductsManager.config.socialLinks?.instagram;
            if (ig) cards.push(`<a class="contact-card" href="${PF.escape(ig)}" target="_blank" rel="noopener">${PF.icons.instagram}<div><strong>Instagram</strong><span>@${PF.escape(PF.instagramHandle(ig))}</span></div></a>`);
            extra.innerHTML = cards.length ? `<div class="contact-cards">${cards.join('')}</div>` : '';
        }
    }
};

Info.init();
