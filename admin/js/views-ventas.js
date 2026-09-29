// ============================================================
// Panel · Ventas: Resumen, Pedidos e Inventario
// ============================================================

const LOW_STOCK = 3;

// ---------------- Resumen ----------------
Views.resumen = {
    async render(view) {
        const hour = new Date().getHours();
        const hello = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
        const first = (Admin.profile.name || Admin.profile.username).split(' ')[0];
        Admin.header('Resumen', `${hello}, ${first}. Esto es lo que está pasando en la tienda.`,
            `<a class="btn btn-ghost" href="../index.html" target="_blank" rel="noopener">${ICON.external}<span>Ver tienda</span></a>`);

        const since = new Date();
        since.setDate(since.getDate() - 60);
        const [o, p, cfg] = await Promise.all([
            supabaseClient.from('orders').select('id, order_number, customer_name, total, status, created_at, items').gte('created_at', since.toISOString()).order('created_at', { ascending: false }),
            supabaseClient.from('products').select('id, name, stock, image, category_id').order('stock'),
            Data.configRow(true).catch(() => ({}))
        ]);
        if (o.error) throw o.error;
        if (p.error) throw p.error;
        const orders = o.data || [];
        const products = p.data || [];

        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const prevStart = new Date(monthStart); prevStart.setMonth(prevStart.getMonth() - 1);
        const paid = orders.filter(x => PAID_STATUSES.includes(x.status));
        const sum = (arr) => arr.reduce((t, x) => t + Number(x.total), 0);
        const thisMonth = paid.filter(x => new Date(x.created_at) >= monthStart);
        const lastMonth = paid.filter(x => new Date(x.created_at) >= prevStart && new Date(x.created_at) < monthStart);
        const pending = orders.filter(x => x.status === 'pending');
        const toDeliver = orders.filter(x => ['confirmed', 'processing', 'shipped'].includes(x.status));
        const out = products.filter(x => x.stock <= 0);
        const low = products.filter(x => x.stock > 0 && x.stock <= LOW_STOCK);
        const avg = thisMonth.length ? sum(thisMonth) / thisMonth.length : 0;

        const salesNow = sum(thisMonth), salesPrev = sum(lastMonth);
        const diff = salesPrev ? Math.round((salesNow - salesPrev) / salesPrev * 100) : null;

        // Tareas de configuración pendientes
        const todo = [];
        if (!cfg.whatsapp_number) todo.push(['configuracion', 'Agrega el WhatsApp de ventas para recibir los pedidos']);
        if (Admin.isSuper() && 'transfer_info' in cfg && !cfg.transfer_info) todo.push(['configuracion', 'Agrega tus datos de transferencia (se envían al cliente con un clic)']);
        if (!('transfer_info' in cfg)) todo.push(['configuracion', 'Falta correr el SQL db/2026-09-29_panel.sql en Supabase (stock automático y datos de pago)']);

        view.innerHTML = `
            ${todo.length ? `<div class="callout is-warn">${ICON.alert}<div><strong>Pendientes de configuración</strong><ol>${todo.map(([v, t]) =>
                Admin.isSuper() ? `<li><a href="#${v}" style="text-decoration:underline">${t}</a></li>` : `<li>${t}</li>`).join('')}</ol></div></div>` : ''}

            <div class="kpis">
                <div class="card kpi">
                    <div class="label">${ICON.money}Ventas del mes</div>
                    <div class="value">${U.money(salesNow)}</div>
                    <div class="sub">${diff === null ? `${thisMonth.length} pedido${thisMonth.length === 1 ? '' : 's'} pagado${thisMonth.length === 1 ? '' : 's'}` : `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}% vs. mes anterior`}</div>
                </div>
                <a class="card kpi" href="#pedidos?estado=pending">
                    <div class="label">${ICON.clock}Por confirmar pago</div>
                    <div class="value">${pending.length}</div>
                    <div class="sub ${pending.length ? 'is-warn' : ''}">${pending.length ? 'Revisa si ya transfirieron' : 'Todo al día'}</div>
                </a>
                <a class="card kpi" href="#pedidos?estado=preparing">
                    <div class="label">${ICON.orders}Por entregar</div>
                    <div class="value">${toDeliver.length}</div>
                    <div class="sub">Pagados, falta coordinar la entrega</div>
                </a>
                <a class="card kpi" href="#inventario">
                    <div class="label">${ICON.stock}Alertas de stock</div>
                    <div class="value">${out.length + low.length}</div>
                    <div class="sub ${out.length ? 'is-bad' : low.length ? 'is-warn' : ''}">${out.length} agotado${out.length === 1 ? '' : 's'} · ${low.length} con poco stock</div>
                </a>
            </div>

            <div class="grid-3">
                <div class="card">
                    <div class="card-head">
                        <div><h2>Ventas de los últimos 30 días</h2><p>Solo pedidos pagados · ticket promedio del mes ${U.money(avg)}</p></div>
                    </div>
                    <div class="chart" id="salesChart"></div>
                </div>
                <div class="card">
                    <div class="card-head"><h2>Stock por reponer</h2><a class="btn btn-ghost btn-sm" href="#inventario">Inventario</a></div>
                    ${[...out, ...low].slice(0, 6).map(x => `
                        <a class="list-row" href="#inventario">
                            <img class="thumb" src="${U.img(x.image)}" alt="" loading="lazy">
                            <div class="grow"><strong>${U.esc(x.name)}</strong><small>${U.esc(Data.catName(x.category_id))}</small></div>
                            <span class="pill ${x.stock <= 0 ? 'bad' : 'warn'}">${x.stock <= 0 ? 'Agotado' : `Quedan ${x.stock}`}</span>
                        </a>`).join('') || U.empty('check', 'Stock en orden', 'Ningún producto está agotado o por agotarse.')}
                </div>
            </div>

            <div class="card mt-16">
                <div class="card-head"><h2>Últimos pedidos</h2><a class="btn btn-ghost btn-sm" href="#pedidos">Ver todos</a></div>
                ${orders.slice(0, 6).map(x => `
                    <a class="list-row" href="#pedidos?id=${x.id}">
                        <span class="avatar is-light">${U.esc(U.initials(x.customer_name))}</span>
                        <div class="grow"><strong>${U.esc(x.customer_name)}</strong><small>${U.esc(x.order_number)} · ${U.ago(x.created_at)}</small></div>
                        <div class="text-right"><div class="strong mono">${U.money(x.total)}</div><span class="pill ${x.status}">${ORDER_STATUS[x.status]?.short || x.status}</span></div>
                    </a>`).join('') || U.empty('orders', 'Aún no hay pedidos', 'Cuando alguien compre en la tienda, el pedido aparecerá aquí.')}
            </div>`;

        await Data.categoriesList().catch(() => {});
        this.chart(document.getElementById('salesChart'), paid);
    },

    // Gráfico de barras (1 serie): ventas pagadas por día, últimos 30 días.
    chart(el, paid) {
        const days = [];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today); d.setDate(d.getDate() - i);
            days.push({ d, total: 0, count: 0 });
        }
        paid.forEach(o => {
            const d = new Date(o.created_at); d.setHours(0, 0, 0, 0);
            const slot = days.find(x => x.d.getTime() === d.getTime());
            if (slot) { slot.total += Number(o.total); slot.count++; }
        });
        const max = Math.max(...days.map(x => x.total));
        if (!max) {
            el.innerHTML = `<div class="chart-empty">Todavía no hay ventas pagadas en los últimos 30 días.</div>`;
            return;
        }

        // Escala "redonda" para el eje
        const step = Math.pow(10, Math.floor(Math.log10(max)));
        const top = Math.ceil(max / step) * step;
        // Se dibuja al ancho real del contenedor (sin estirar el SVG, así el texto no se deforma)
        const W = Math.max(280, el.clientWidth - 40), H = 220, padL = 52, padB = 26, padT = 8;
        const innerW = W - padL, innerH = H - padB - padT;
        const band = innerW / days.length;
        const barW = Math.min(18, band - 2);
        const y = (v) => padT + innerH - (v / top) * innerH;
        const fmtAxis = (v) => v >= 1000000 ? `$${(v / 1000000).toLocaleString('es-CL')}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`;
        const ticks = [0, top / 2, top];

        el.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ventas diarias de los últimos 30 días">
                ${ticks.map(t => `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/>
                    <text class="axis-label" x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${fmtAxis(t)}</text>`).join('')}
                ${days.map((x, i) => {
                    const cx = padL + band * i + band / 2;
                    const h = Math.max(0, (x.total / top) * innerH);
                    const r = Math.min(4, h / 2, barW / 2);
                    const x0 = cx - barW / 2, y0 = padT + innerH - h;
                    // Barra con esquinas superiores redondeadas y base recta
                    const path = h > 0 ? `M${x0},${padT + innerH} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barW - r} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} V${padT + innerH} Z` : '';
                    const every = W < 480 ? 10 : 5;
                    const label = (i % every === every - 1 || i === days.length - 1) ? `<text class="axis-label" x="${cx}" y="${H - 6}" text-anchor="middle">${x.d.getDate()}/${x.d.getMonth() + 1}</text>` : '';
                    return `${path ? `<path class="bar" data-i="${i}" d="${path}"/>` : ''}
                            <rect class="bar-hit" data-i="${i}" x="${padL + band * i}" y="${padT}" width="${band}" height="${innerH}"/>${label}`;
                }).join('')}
            </svg>
            <div class="chart-tip" id="chartTip"></div>
            <table class="sr-only"><caption>Ventas pagadas por día</caption><tbody>${days.filter(x => x.total).map(x =>
                `<tr><th>${x.d.toLocaleDateString('es-CL')}</th><td>${U.money(x.total)}</td></tr>`).join('')}</tbody></table>`;

        const svg = el.querySelector('svg');
        const tip = el.querySelector('#chartTip');
        const show = (i) => {
            const x = days[i];
            const rect = svg.getBoundingClientRect();
            const scale = rect.width / W;
            tip.innerHTML = `<strong>${U.money(x.total)}</strong>${x.d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · ${x.count} pedido${x.count === 1 ? '' : 's'}`;
            tip.style.left = `${20 + (padL + band * i + band / 2) * scale}px`;
            tip.style.top = `${8 + y(x.total) * (rect.height / H)}px`;
            tip.classList.add('is-visible');
            svg.querySelectorAll('.bar').forEach(b => b.classList.toggle('is-dim', +b.dataset.i !== i));
        };
        const hide = () => { tip.classList.remove('is-visible'); svg.querySelectorAll('.bar').forEach(b => b.classList.remove('is-dim')); };
        svg.querySelectorAll('.bar-hit').forEach(r => {
            r.addEventListener('mouseenter', () => show(+r.dataset.i));
            r.addEventListener('click', () => show(+r.dataset.i));
        });
        svg.addEventListener('mouseleave', hide);

        // Redibujar si cambia el ancho (rotar el celular, abrir/cerrar paneles)
        if (!this.resizeBound) {
            this.resizeBound = true;
            window.addEventListener('resize', U.debounce(() => {
                const box = document.getElementById('salesChart');
                if (box && this.lastPaid) this.chart(box, this.lastPaid);
            }, 200));
        }
        this.lastPaid = paid;
    }
};

// ---------------- Pedidos ----------------
Views.pedidos = {
    orders: [],
    filter: 'all',
    query: '',

    filters: [
        ['all', 'Todos', () => true],
        ['pending', 'Por pagar', o => o.status === 'pending'],
        ['preparing', 'Por entregar', o => ['confirmed', 'processing', 'shipped'].includes(o.status)],
        ['delivered', 'Entregados', o => o.status === 'delivered'],
        ['cancelled', 'Cancelados', o => o.status === 'cancelled']
    ],

    async render(view) {
        const params = new URLSearchParams(location.hash.split('?')[1] || '');
        if (params.get('estado')) this.filter = params.get('estado');

        Admin.header('Pedidos', 'Confirma pagos, coordina entregas y habla con tus clientes.',
            `<button class="btn btn-ghost" id="exportCsv">${ICON.download}<span>Exportar CSV</span></button>`);

        const { data, error } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        this.orders = data || [];

        view.innerHTML = `
            <div class="toolbar">
                <div class="chips" id="orderChips"></div>
                <div class="spacer"></div>
                <label class="search">${ICON.search}<input type="search" id="orderSearch" placeholder="Buscar por N°, nombre o teléfono" value="${U.esc(this.query)}"></label>
            </div>
            <div class="card" id="ordersCard"></div>`;

        document.getElementById('orderSearch').addEventListener('input', U.debounce((e) => { this.query = e.target.value; this.renderList(); }, 150));
        document.getElementById('orderChips').addEventListener('click', (e) => {
            const c = e.target.closest('[data-filter]');
            if (!c) return;
            this.filter = c.dataset.filter;
            this.renderList();
        });
        document.getElementById('exportCsv').addEventListener('click', () => this.exportCsv());
        document.getElementById('ordersCard').addEventListener('click', (e) => {
            const row = e.target.closest('[data-order]');
            if (row) this.open(+row.dataset.order);
        });

        this.renderList();
        if (params.get('id')) this.open(+params.get('id'));
    },

    visible() {
        const f = this.filters.find(x => x[0] === this.filter) || this.filters[0];
        const q = U.normalize(this.query).replace(/\s+/g, ' ').trim();
        return this.orders.filter(f[2]).filter(o => !q ||
            U.normalize(`${o.order_number} ${o.customer_name} ${o.customer_phone} ${o.customer_email}`).includes(q) ||
            String(o.customer_phone).replace(/\D/g, '').includes(q.replace(/\D/g, '') || '@@'));
    },

    renderList() {
        document.getElementById('orderChips').innerHTML = this.filters.map(([id, label, fn]) =>
            `<button class="chip${this.filter === id ? ' is-active' : ''}" data-filter="${id}">${label}<span class="count">${this.orders.filter(fn).length}</span></button>`).join('');

        const list = this.visible();
        const card = document.getElementById('ordersCard');
        if (!list.length) {
            card.innerHTML = this.orders.length
                ? U.empty('search', 'Sin resultados', 'No hay pedidos que coincidan con este filtro o búsqueda.')
                : U.empty('orders', 'Aún no hay pedidos', 'Cuando alguien compre en la tienda, el pedido aparecerá aquí con sus datos de contacto.');
            return;
        }
        card.innerHTML = `
            <div class="table-wrap"><table class="table responsive">
                <thead><tr><th>Pedido</th><th>Cliente</th><th>Productos</th><th class="num">Total</th><th>Estado</th></tr></thead>
                <tbody>${list.map(o => {
                    const qty = (o.items || []).reduce((t, i) => t + Number(i.quantity || 0), 0);
                    return `
                    <tr class="is-clickable" data-order="${o.id}">
                        <td class="cell-primary"><strong class="mono">${U.esc(o.order_number)}</strong><div class="muted">${U.dateTime(o.created_at)}</div></td>
                        <td data-label="Cliente"><div><div class="strong">${U.esc(o.customer_name)}</div><div class="muted">${U.esc(o.customer_phone)}</div></div></td>
                        <td data-label="Productos">${qty} unidad${qty === 1 ? '' : 'es'}</td>
                        <td data-label="Total" class="num strong">${U.money(o.total)}</td>
                        <td data-label="Estado"><span class="pill ${o.status}">${ORDER_STATUS[o.status]?.short || o.status}</span></td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>`;
    },

    // Ficha del pedido
    async open(id) {
        const o = this.orders.find(x => x.id === id);
        if (!o) return;
        const cfg = await Data.configRow().catch(() => ({}));
        const first = String(o.customer_name).split(' ')[0];
        const items = o.items || [];
        const flow = ['pending', 'processing', 'shipped', 'delivered'];
        const stepIndex = o.status === 'confirmed' ? 1 : flow.indexOf(o.status);

        const payMsg = `Hola ${first}! Recibimos tu pedido ${o.order_number} por ${U.money(o.total)} 🔥\n\n` +
            (cfg.transfer_info ? `Estos son los datos para la transferencia:\n${cfg.transfer_info}\n\n` : '') +
            'Cuando transfieras, mándanos el comprobante por acá y coordinamos la entrega.';
        const readyMsg = `Hola ${first}! Tu pedido ${o.order_number} está listo 🔥 ¿Qué día y en qué estación de Metro te acomoda recibirlo?`;
        const waPay = U.waLink(o.customer_phone, payMsg);
        const waReady = U.waLink(o.customer_phone, readyMsg);
        const waChat = U.waLink(o.customer_phone, `Hola ${first}! Te escribimos de PopFlame por tu pedido ${o.order_number}.`);

        const actions = [];
        if (o.status === 'pending') actions.push(`<button class="btn btn-dark" data-status="confirmed">${ICON.check}Marcar como pagado</button>`);
        if (['confirmed', 'processing'].includes(o.status)) actions.push(`<button class="btn btn-dark" data-status="shipped">${ICON.check}Listo para entregar</button>`);
        if (o.status === 'shipped') actions.push(`<button class="btn btn-dark" data-status="delivered">${ICON.check}Marcar como entregado</button>`);

        const body = `
            <div class="order-steps${o.status === 'cancelled' ? ' is-cancelled' : ''}">${flow.map((_, i) => `<span class="${i <= stepIndex ? 'is-done' : ''}"></span>`).join('')}</div>
            <div class="row between wrap mb-16">
                <span class="pill ${o.status}">${ORDER_STATUS[o.status]?.label || o.status}</span>
                <span class="muted">${U.dateTime(o.created_at)} · ${U.ago(o.created_at)}</span>
            </div>

            ${o.status !== 'cancelled' ? `<div class="sheet-section"><div class="status-actions">${actions.join('')}
                ${o.status !== 'delivered' ? `<button class="btn btn-ghost" data-status="cancelled">Cancelar pedido</button>` : ''}</div>
                ${o.status === 'pending' ? `<p class="muted mt-8">Al marcarlo como pagado se descuenta el stock automáticamente${'stock_applied' in o ? '' : ' (requiere el SQL del panel)'}.</p>` : ''}
            </div>` : `<div class="callout">${ICON.info}<div>Pedido cancelado${o.stock_applied === false ? '' : ''}. Si ya se había descontado stock, se repuso automáticamente.
                <div class="mt-8"><button class="btn btn-ghost btn-sm" data-status="pending">Reabrir pedido</button></div></div></div>`}

            <div class="sheet-section">
                <h3>Cliente</h3>
                <div class="card card-body">
                    <dl class="kv">
                        <dt>Nombre</dt><dd class="strong">${U.esc(o.customer_name)}</dd>
                        <dt>Teléfono</dt><dd><a href="tel:${U.esc(o.customer_phone)}">${U.esc(o.customer_phone)}</a></dd>
                        <dt>Correo</dt><dd><a href="mailto:${U.esc(o.customer_email)}">${U.esc(o.customer_email)}</a></dd>
                        <dt>Entrega</dt><dd>${o.customer_address ? `Metro ${U.esc(o.customer_address)}` : '<span class="muted">Estación a coordinar</span>'}</dd>
                        ${o.note ? `<dt>Nota</dt><dd>${U.esc(o.note)}</dd>` : ''}
                    </dl>
                    <div class="contact-actions">
                        ${o.status === 'pending' && waPay ? `<a class="btn btn-whatsapp btn-sm" href="${U.esc(waPay)}" target="_blank" rel="noopener">${ICON.whatsapp}Enviar datos de pago</a>` : ''}
                        ${['confirmed', 'processing', 'shipped'].includes(o.status) && waReady ? `<a class="btn btn-whatsapp btn-sm" href="${U.esc(waReady)}" target="_blank" rel="noopener">${ICON.whatsapp}Coordinar entrega</a>` : ''}
                        ${waChat ? `<a class="btn btn-ghost btn-sm" href="${U.esc(waChat)}" target="_blank" rel="noopener">${ICON.whatsapp}Escribir</a>` : ''}
                        <a class="btn btn-ghost btn-sm" href="mailto:${U.esc(o.customer_email)}?subject=${encodeURIComponent('Tu pedido ' + o.order_number + ' en PopFlame')}">${ICON.mail}Correo</a>
                    </div>
                    ${o.status === 'pending' && !cfg.transfer_info && Admin.isSuper() ? `<p class="muted mt-8">Tip: agrega tus datos de transferencia en <a href="#configuracion" style="text-decoration:underline">Configuración</a> y se incluirán en el mensaje.</p>` : ''}
                </div>
            </div>

            <div class="sheet-section">
                <h3>Productos</h3>
                <div class="card card-body">
                    <div class="order-items">${items.map(i => `
                        <div class="item">
                            <img src="${U.img(i.image)}" alt="" loading="lazy">
                            <div><strong>${U.esc(i.name)}</strong><small>${[i.size && !/^[úu]nica$/i.test(i.size) ? 'Talla ' + i.size : '', i.color].filter(Boolean).map(U.esc).join(' · ')} · ${i.quantity} × ${U.money(i.price)}</small></div>
                            <span class="strong mono">${U.money(i.price * i.quantity)}</span>
                        </div>`).join('')}</div>
                    <div class="totals">
                        <div><span>Subtotal</span><span class="mono">${U.money(o.subtotal)}</span></div>
                        <div><span>Entrega</span><span class="mono">${Number(o.shipping) ? U.money(o.shipping) : 'Gratis'}</span></div>
                        <div class="is-total"><span>Total</span><span class="mono">${U.money(o.total)}</span></div>
                    </div>
                </div>
            </div>

            <div class="sheet-section">
                <h3>Cambiar estado manualmente</h3>
                <select class="input" id="statusSelect">${Object.entries(ORDER_STATUS).map(([k, v]) =>
                    `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
            </div>`;

        const foot = Admin.isSuper()
            ? `<button class="btn btn-danger" id="deleteOrder">${ICON.trash}Eliminar</button><div class="spacer"></div><button class="btn btn-ghost" data-sheet-close>Cerrar</button>`
            : `<div class="spacer"></div><button class="btn btn-ghost" data-sheet-close>Cerrar</button>`;

        UI.openSheet({
            title: `${U.esc(o.order_number)}`,
            body, foot,
            onOpen: (sheet) => {
                sheet.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => this.setStatus(o, b.dataset.status, b)));
                sheet.querySelector('#statusSelect').addEventListener('change', (e) => this.setStatus(o, e.target.value, e.target));
                sheet.querySelector('#deleteOrder')?.addEventListener('click', () => this.remove(o));
            }
        });
    },

    async setStatus(o, status, btn) {
        if (status === o.status) return;
        if (status === 'cancelled') {
            const ok = await UI.confirm({ title: `¿Cancelar ${o.order_number}?`, text: 'Si el pedido ya estaba pagado, el stock se repone automáticamente.', ok: 'Cancelar pedido' });
            if (!ok) { this.open(o.id); return; }
        }
        UI.setLoading(btn, true);
        const { data, error } = await supabaseClient.from('orders').update({ status }).eq('id', o.id).select().single();
        UI.setLoading(btn, false);
        if (error) { UI.toast('No se pudo cambiar el estado: ' + error.message, 'error'); return; }
        Object.assign(o, data);
        UI.toast(`${o.order_number}: ${ORDER_STATUS[o.status].label}`);
        this.renderList();
        Admin.refreshBadge();
        this.open(o.id);
    },

    async remove(o) {
        const ok = await UI.confirm({ title: `¿Eliminar ${o.order_number}?`, text: 'Se borra para siempre. Si solo no se concretó, mejor márcalo como cancelado.', ok: 'Eliminar pedido' });
        if (!ok) return;
        const { error } = await supabaseClient.from('orders').delete().eq('id', o.id);
        if (error) { UI.toast('No se pudo eliminar: ' + error.message, 'error'); return; }
        this.orders = this.orders.filter(x => x.id !== o.id);
        await UI.closeSheet(true);
        this.renderList();
        Admin.refreshBadge();
        UI.toast('Pedido eliminado');
    },

    exportCsv() {
        const list = this.visible();
        if (!list.length) { UI.toast('No hay pedidos para exportar', 'error'); return; }
        const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [['Pedido', 'Fecha', 'Estado', 'Cliente', 'Teléfono', 'Correo', 'Estación', 'Productos', 'Subtotal', 'Entrega', 'Total', 'Nota']];
        list.forEach(o => rows.push([
            o.order_number, new Date(o.created_at).toLocaleString('es-CL'), ORDER_STATUS[o.status]?.label || o.status,
            o.customer_name, o.customer_phone, o.customer_email, o.customer_address || '',
            (o.items || []).map(i => `${i.quantity}x ${i.name}${i.size ? ' ' + i.size : ''}${i.color ? ' ' + i.color : ''}`).join(' | '),
            o.subtotal, o.shipping, o.total, o.note || ''
        ]));
        const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `pedidos-popflame-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        UI.toast(`${list.length} pedido${list.length === 1 ? '' : 's'} exportado${list.length === 1 ? '' : 's'}`);
    }
};

// ---------------- Inventario ----------------
Views.inventario = {
    products: [],
    filter: 'all',
    query: '',

    async render(view) {
        Admin.header('Inventario', 'Ajusta el stock rápido. Los cambios se guardan solos.');
        const [{ data, error }] = await Promise.all([
            supabaseClient.from('products').select('id, name, price, stock, image, category_id, sizes').order('name'),
            Data.categoriesList()
        ]);
        if (error) throw error;
        this.products = data || [];

        view.innerHTML = `
            <div class="callout">${ICON.info}<div>El stock baja solo cuando marcas un pedido como <strong>pagado</strong>, y vuelve si lo cancelas. Aquí puedes corregirlo a mano (por ejemplo, si vendiste en persona).</div></div>
            <div class="toolbar">
                <div class="chips" id="invChips"></div>
                <div class="spacer"></div>
                <label class="search">${ICON.search}<input type="search" id="invSearch" placeholder="Buscar producto" value="${U.esc(this.query)}"></label>
            </div>
            <div class="card" id="invCard"></div>`;

        document.getElementById('invSearch').addEventListener('input', U.debounce(e => { this.query = e.target.value; this.renderList(); }, 150));
        document.getElementById('invChips').addEventListener('click', (e) => {
            const c = e.target.closest('[data-filter]');
            if (c) { this.filter = c.dataset.filter; this.renderList(); }
        });
        const card = document.getElementById('invCard');
        card.addEventListener('click', (e) => {
            const b = e.target.closest('[data-step]');
            if (!b) return;
            const input = b.parentElement.querySelector('input');
            input.value = Math.max(0, (U.int(input.value) || 0) + Number(b.dataset.step));
            this.queueSave(input);
        });
        card.addEventListener('input', (e) => { if (e.target.matches('[data-stock]')) this.queueSave(e.target); });
        this.renderList();
    },

    renderList() {
        const filters = [
            ['all', 'Todos', () => true],
            ['low', 'Poco stock', p => p.stock > 0 && p.stock <= LOW_STOCK],
            ['out', 'Agotados', p => p.stock <= 0]
        ];
        document.getElementById('invChips').innerHTML = filters.map(([id, label, fn]) =>
            `<button class="chip${this.filter === id ? ' is-active' : ''}" data-filter="${id}">${label}<span class="count">${this.products.filter(fn).length}</span></button>`).join('');

        const fn = filters.find(f => f[0] === this.filter)[2];
        const q = U.normalize(this.query);
        const list = this.products.filter(fn).filter(p => !q || U.normalize(p.name).includes(q));
        const card = document.getElementById('invCard');
        if (!list.length) {
            card.innerHTML = U.empty('stock', this.products.length ? 'Sin resultados' : 'Sin productos',
                this.products.length ? 'Ningún producto coincide con este filtro.' : 'Crea tu primer producto en la sección Productos.');
            return;
        }
        card.innerHTML = `
            <div class="table-wrap"><table class="table responsive">
                <thead><tr><th>Producto</th><th class="num">Precio</th><th>Estado</th><th class="text-right">Stock</th></tr></thead>
                <tbody>${list.map(p => `
                    <tr>
                        <td class="cell-primary"><div class="cell-main"><img class="thumb" src="${U.img(p.image)}" alt="" loading="lazy"><div><strong>${U.esc(p.name)}</strong><small>${U.esc(Data.catName(p.category_id))}</small></div></div></td>
                        <td data-label="Precio" class="num">${U.money(p.price)}</td>
                        <td data-label="Estado" data-state="${p.id}">${this.state(p.stock)}</td>
                        <td data-label="Stock" class="text-right">
                            <div class="stepper" data-stepper="${p.id}">
                                <button type="button" data-step="-1" aria-label="Restar uno">−</button>
                                <input type="number" inputmode="numeric" min="0" value="${p.stock}" data-stock="${p.id}" aria-label="Stock de ${U.esc(p.name)}">
                                <button type="button" data-step="1" aria-label="Sumar uno">+</button>
                            </div>
                        </td>
                    </tr>`).join('')}</tbody>
            </table></div>`;
    },

    state(stock) {
        if (stock <= 0) return '<span class="pill bad">Agotado</span>';
        if (stock <= LOW_STOCK) return '<span class="pill warn">Poco stock</span>';
        return '<span class="pill ok">Disponible</span>';
    },

    timers: {},
    queueSave(input) {
        const id = +input.dataset.stock;
        clearTimeout(this.timers[id]);
        this.timers[id] = setTimeout(() => this.save(id, input), 600);
    },

    async save(id, input) {
        const stock = U.int(input.value);
        const stepper = input.closest('.stepper');
        if (stock === null || stock < 0) { UI.toast('El stock debe ser un número desde 0', 'error'); return; }
        stepper.classList.add('is-saving');
        const { error } = await supabaseClient.from('products').update({ stock }).eq('id', id);
        stepper.classList.remove('is-saving');
        if (error) { UI.toast('No se pudo guardar el stock: ' + error.message, 'error'); return; }
        const p = this.products.find(x => x.id === id);
        if (p) p.stock = stock;
        const cell = document.querySelector(`[data-state="${id}"]`);
        if (cell) cell.innerHTML = this.state(stock);
        stepper.classList.add('is-saved');
        setTimeout(() => stepper.classList.remove('is-saved'), 1200);
        UI.toast(`Stock de ${p?.name || 'producto'}: ${stock}`);
    }
};
