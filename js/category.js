// Catálogo / página de categoría (pages/categoria.html?cat=<id>). Sin ?cat muestra todo.
const Category = {
    catId: null,

    init() {
        const params = new URLSearchParams(location.search);
        this.catId = params.get('cat');
        const sort = params.get('sort');
        if (sort) document.getElementById('sortFilter').value = sort;

        const grid = document.getElementById('catGrid');
        if (grid && !grid.children.length) grid.innerHTML = ProductsManager.skeletonCards(8);

        ['sizeFilter', 'colorFilter', 'sortFilter'].forEach(id =>
            document.getElementById(id).addEventListener('change', () => this.renderGrid()));

        Site.start({ render: () => this.render() });
    },

    base() {
        return this.catId ? ProductsManager.getProductsByCategory(this.catId) : ProductsManager.getAllProducts();
    },

    render() {
        const cat = this.catId ? ProductsManager.getCategoryById(this.catId) : null;
        const title = cat ? cat.name : 'Catálogo';
        document.getElementById('catTitle').textContent = title;
        document.getElementById('crumbCurrent').textContent = title;
        document.getElementById('catDesc').textContent = cat
            ? (cat.description || `Descubre la colección de ${cat.name.toLowerCase()} PopFlame.`)
            : 'Todo lo que tenemos disponible en este momento.';
        Site.setMeta(`${title} | PopFlame`, cat?.description || 'Streetwear hecho en Chile.');

        if (this.catId && !cat && ProductsManager.categories.length) {
            document.getElementById('catTitle').textContent = 'Categoría no encontrada';
            document.getElementById('catDesc').textContent = 'Es posible que esta categoría ya no exista.';
        }

        this.renderChips();
        this.fillFilters();
        this.renderGrid();
    },

    renderChips() {
        const chips = document.getElementById('catChips');
        const cats = ProductsManager.getVisibleCategories();
        const link = (id, label, active) =>
            `<a class="chip${active ? ' is-active' : ''}" href="${PF.url('pages/categoria.html' + (id ? '?cat=' + encodeURIComponent(id) : ''))}"${active ? ' aria-current="page"' : ''}>${PF.escape(label)}</a>`;
        chips.innerHTML = link('', 'Todo', !this.catId) + cats.map(c => link(c.id, c.name, c.id === this.catId)).join('');
        const active = chips.querySelector('.is-active');
        if (active) chips.scrollLeft = active.offsetLeft - (chips.clientWidth - active.offsetWidth) / 2;
    },

    fillFilters() {
        const products = this.base();
        const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
        const sizes = [...new Set(products.flatMap(p => p.sizes))]
            .sort((a, b) => {
                const ia = order.indexOf(a), ib = order.indexOf(b);
                if (ia > -1 && ib > -1) return ia - ib;
                if (!isNaN(a) && !isNaN(b)) return a - b;
                return String(a).localeCompare(String(b));
            });
        const colors = [...new Set(products.flatMap(p => p.colors))].sort((a, b) => a.localeCompare(b));

        const fill = (id, label, values) => {
            const sel = document.getElementById(id);
            const current = sel.value;
            sel.innerHTML = `<option value="">${label}</option>` + values.map(v => `<option value="${PF.escape(v)}">${PF.escape(v)}</option>`).join('');
            sel.value = values.includes(current) ? current : '';
            sel.hidden = values.length < 2;
        };
        fill('sizeFilter', 'Talla', sizes);
        fill('colorFilter', 'Color', colors);
    },

    renderGrid() {
        let products = [...this.base()];
        const size = document.getElementById('sizeFilter').value;
        const color = document.getElementById('colorFilter').value;
        const sort = document.getElementById('sortFilter').value;

        if (size) products = products.filter(p => p.sizes.includes(size));
        if (color) products = products.filter(p => p.colors.includes(color));

        const inStock = (p) => (p.stock > 0 ? 1 : 0);
        const sorters = {
            featured: (a, b) => inStock(b) - inStock(a) || b.featured - a.featured || b.id - a.id,
            new: (a, b) => b.id - a.id,
            'price-asc': (a, b) => a.price - b.price,
            'price-desc': (a, b) => b.price - a.price,
            name: (a, b) => a.name.localeCompare(b.name)
        };
        products.sort(sorters[sort] || sorters.featured);

        document.getElementById('resultCount').textContent = `${products.length} producto${products.length === 1 ? '' : 's'}`;

        const grid = document.getElementById('catGrid');
        if (!products.length) {
            const filtered = size || color;
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1">
                    <h3>${filtered ? 'Sin resultados' : 'Muy pronto'}</h3>
                    <p>${filtered ? 'No hay productos con esos filtros. Prueba quitando alguno.' : 'Estamos preparando nuevos drops para esta categoría.'}</p>
                    ${filtered
                        ? '<button class="btn btn-outline" id="clearFilters">Quitar filtros</button>'
                        : `<a class="btn btn-dark" href="${PF.url('pages/categoria.html')}">Ver todo el catálogo</a>`}
                </div>`;
            document.getElementById('clearFilters')?.addEventListener('click', () => {
                document.getElementById('sizeFilter').value = '';
                document.getElementById('colorFilter').value = '';
                this.renderGrid();
            });
            return;
        }
        ProductsManager.renderProducts(grid, products, { eagerCount: 4 });
    }
};

Category.init();
