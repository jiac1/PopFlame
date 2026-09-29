// Estructura común de todas las páginas de la tienda: barra de anuncios, header, menú móvil,
// buscador, carrito y footer. Se carga SIN defer justo después de <body>, así el header se
// pinta en el primer frame (sin parpadeo) y el resto de la página no tiene que repetir este HTML.
(function () {
    const script = document.currentScript;
    // Raíz del sitio (funciona igual en localhost, en un subdirectorio de GitHub Pages o en un dominio propio)
    const ROOT = new URL('../', script.src).href;

    const ICONS = {
        menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 7h18M3 12h18M3 17h12"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
        bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 8h14l-1 13H6L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/></svg>',
        arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
        arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
        instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/></svg>',
        tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82A4.28 4.28 0 0115.54 3h-3.09v12.4a2.59 2.59 0 01-2.59 2.5 2.6 2.6 0 01-2.6-2.6 2.6 2.6 0 013.37-2.48V9.66a5.7 5.7 0 00-.77-.05A5.73 5.73 0 004.14 15.3 5.73 5.73 0 009.87 21a5.73 5.73 0 005.73-5.73V9.01a7.35 7.35 0 004.3 1.38V7.3a4.3 4.3 0 01-3.3-1.48z"/></svg>',
        twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.75 3h3.07l-6.72 7.68L22 21h-6.19l-4.85-6.34L5.4 21H2.33l7.19-8.21L2 3h6.35l4.38 5.79L17.75 3zm-1.08 16.2h1.7L7.43 4.72H5.6l11.07 14.48z"/></svg>',
        whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 01-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 012.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0012.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 005.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 00-3.48-8.41z"/></svg>',
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
        truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 6h12v10H2zM14 10h4l4 4v2h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
        transfer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
        chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
        lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
        alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
        settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>'
    };

    // Config guardada de la visita anterior: permite pintar logo/redes al instante
    // mientras llega la versión fresca desde Supabase.
    let cached = {};
    try { cached = JSON.parse(localStorage.getItem('pf_store_cache') || '{}').config || {}; } catch (e) { /* sin cache */ }

    const PF = window.PF = {
        root: ROOT,
        icons: ICONS,
        url: (path = '') => ROOT + path.replace(/^\/+/, ''),
        page: document.body.dataset.page || '',
        escape(str) {
            return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        },
        isVideo: (url) => /\.(mp4|webm|mov)(\?.*)?$/i.test(url || ''),
        // Logo del header: video (logo animado subido en el panel) o imagen.
        logoHtml(url, cls) {
            if (url && PF.isVideo(url)) {
                return `<video class="${cls}" src="${PF.escape(url)}" autoplay loop muted playsinline aria-label="PopFlame"></video>`;
            }
            return `<img class="${cls}" src="${PF.escape(url || PF.url('images/logo-sm.png'))}" alt="PopFlame" width="44" height="44">`;
        },
        announcements(cfg = {}) {
            const handle = PF.instagramHandle(cfg.socialLinks?.instagram);
            return [
                'Entregas gratis en estaciones de Metro de Santiago',
                'Envíos a regiones a coordinar por WhatsApp',
                'Pago seguro por transferencia bancaria',
                handle ? `Síguenos en Instagram @${handle}` : 'Streetwear hecho en Chile'
            ];
        },
        instagramHandle(url) {
            if (!url) return '';
            const m = String(url).match(/instagram\.com\/([^/?#]+)/i);
            return m ? m[1] : String(url).replace(/^@/, '');
        }
    };

    const u = PF.url;
    const cfg = cached;

    function announceHtml(items) {
        const row = items.map(t => `<span class="announce-item">${PF.escape(t)}</span>`).join('');
        // Se duplica la fila para que el marquee sea continuo.
        return `<div class="announce-track">${row}${row}</div>`;
    }

    const headerHtml = `
        <a class="skip-link" href="#main">Saltar al contenido</a>
        <div class="announce" id="announce" role="region" aria-label="Anuncios">${announceHtml(PF.announcements(cfg))}</div>
        <header class="site-header" id="siteHeader">
            <div class="container header-inner">
                <div class="header-left">
                    <button class="icon-btn menu-toggle" id="menuOpen" aria-label="Abrir menú" aria-controls="mobileMenu" aria-expanded="false">${ICONS.menu}</button>
                    <nav class="main-nav" id="mainNav" aria-label="Categorías"></nav>
                </div>
                <a href="${u('index.html')}" class="brand" aria-label="PopFlame, ir al inicio">
                    ${PF.logoHtml(cfg.logoUrl, 'brand-logo')}
                </a>
                <div class="header-right">
                    <button class="icon-btn" id="searchOpen" aria-label="Buscar productos">${ICONS.search}</button>
                    <button class="icon-btn" id="cartOpen" aria-label="Abrir carrito" aria-controls="cartDrawer">
                        ${ICONS.bag}
                        <span class="cart-count" id="cartCount" aria-live="polite">0</span>
                    </button>
                </div>
            </div>
        </header>`;

    script.insertAdjacentHTML('beforebegin', headerHtml);

    // Partes que no se ven al cargar (menú, buscador, carrito, footer): se agregan al final del body.
    function renderShell() {
        const helpLinks = [
            ['envios', 'Envíos y entregas'],
            ['devoluciones', 'Cambios y devoluciones'],
            ['guia-de-talles', 'Guía de tallas'],
            ['contacto', 'Contacto']
        ];

        const shell = `
            <div class="overlay" id="overlay"></div>

            <aside class="drawer drawer-left mobile-menu" id="mobileMenu" aria-label="Menú" aria-hidden="true">
                <div class="drawer-head">
                    <span class="drawer-title">Menú</span>
                    <button class="icon-btn" data-close aria-label="Cerrar menú">${ICONS.close}</button>
                </div>
                <div class="drawer-body">
                    <nav class="mobile-menu-links" id="mobileNav" aria-label="Categorías">
                        <a href="${u('pages/categoria.html')}">Ver todo ${ICONS.arrowRight}</a>
                    </nav>
                    <div class="mobile-menu-secondary">
                        <h4>AYUDA</h4>
                        ${helpLinks.map(([s, t]) => `<a href="${u('pages/info.html?slug=' + s)}">${t}</a>`).join('')}
                        <a href="${u('pages/info.html?slug=terminos')}">Términos y condiciones</a>
                        <a href="${u('pages/info.html?slug=privacidad')}">Política de privacidad</a>
                        <h4>SÍGUENOS</h4>
                        <div data-social-list></div>
                    </div>
                </div>
            </aside>

            <div class="search-panel" id="searchPanel" role="dialog" aria-modal="true" aria-label="Buscar" aria-hidden="true">
                <div class="container">
                    <form class="search-bar" id="searchForm" role="search">
                        ${ICONS.search}
                        <label for="searchInput" class="sr-only">Buscar productos</label>
                        <input class="search-input" id="searchInput" type="search" placeholder="Buscar productos" autocomplete="off" enterkeyhint="search">
                        <button type="button" class="icon-btn" data-close aria-label="Cerrar buscador">${ICONS.close}</button>
                    </form>
                    <div class="search-results" id="searchResults"></div>
                </div>
            </div>

            <aside class="drawer drawer-right cart-drawer" id="cartDrawer" aria-label="Carrito" aria-hidden="true">
                <div class="drawer-head">
                    <span class="drawer-title">Tu carrito <small id="cartDrawerCount"></small></span>
                    <button class="icon-btn" data-close aria-label="Cerrar carrito">${ICONS.close}</button>
                </div>
                <div class="drawer-body" id="cartItems"></div>
                <div class="cart-foot" id="cartFoot" hidden>
                    <div class="cart-row"><span>Subtotal</span><span id="cartSubtotal">$0</span></div>
                    <div class="cart-row"><span>Entrega</span><span id="cartShipping">Gratis en Metro</span></div>
                    <div class="cart-row is-total"><span>Total</span><span id="cartTotal">$0</span></div>
                    <p class="cart-note">Pagas por transferencia al confirmar tu pedido por WhatsApp.</p>
                    <a href="${u('pages/checkout.html')}" class="btn btn-dark btn-block">Finalizar compra</a>
                    <button class="btn btn-outline btn-block" data-close>Seguir comprando</button>
                </div>
            </aside>

            <div class="toast-stack" id="toastStack" aria-live="polite"></div>

            <footer class="site-footer" id="siteFooter">
                <div class="container">
                    <div class="footer-top">
                        <div class="footer-news">
                            <h2>Únete al club PopFlame</h2>
                            <p>Drops exclusivos, reposiciones y lanzamientos antes que nadie. Sin spam.</p>
                            <form class="news-form" id="newsForm" novalidate>
                                <label for="newsEmail" class="sr-only">Tu correo electrónico</label>
                                <input type="email" id="newsEmail" placeholder="Tu correo electrónico" autocomplete="email" required>
                                <button type="submit" aria-label="Suscribirme">${ICONS.arrowRight}</button>
                            </form>
                            <p class="news-msg" id="newsMsg" role="status"></p>
                            <p class="news-note">Al suscribirte aceptas nuestra <a href="${u('pages/info.html?slug=privacidad')}">Política de privacidad</a>. Puedes darte de baja cuando quieras.</p>
                        </div>
                        <div class="footer-cols">
                            <div class="footer-col">
                                <h4>Tienda</h4>
                                <div id="footerCats"><a href="${u('pages/categoria.html')}">Ver todo</a></div>
                            </div>
                            <div class="footer-col">
                                <h4>Ayuda</h4>
                                ${helpLinks.map(([s, t]) => `<a href="${u('pages/info.html?slug=' + s)}">${t}</a>`).join('')}
                            </div>
                            <div class="footer-col">
                                <h4>Síguenos</h4>
                                <div data-social-list></div>
                            </div>
                        </div>
                    </div>
                    <div class="footer-brand">
                        <div class="footer-wordmark" aria-hidden="true">Pop<span>Flame</span></div>
                        <div class="footer-social" id="footerSocial"></div>
                    </div>
                    <div class="footer-bottom">
                        <span>&copy; ${new Date().getFullYear()} PopFlame. Streetwear hecho en Chile.</span>
                        <span class="footer-legal">
                            <a href="${u('pages/info.html?slug=terminos')}">Términos y condiciones</a>
                            <a href="${u('pages/info.html?slug=privacidad')}">Política de privacidad</a>
                        </span>
                    </div>
                </div>
            </footer>`;

        document.body.insertAdjacentHTML('beforeend', shell);
        PF.shellReady = true;
        document.dispatchEvent(new Event('pf:shell'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderShell, { once: true });
    } else {
        renderShell();
    }
})();
