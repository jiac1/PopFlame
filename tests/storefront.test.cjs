const test = require('node:test');
const assert = require('node:assert/strict');

// cart.js usa ProductsManager como global (en el navegador lo define products.js).
const ProductsManager = require('../js/products.js');
globalThis.ProductsManager = ProductsManager;
const CartManager = require('../js/cart.js');

test('a product manually marked "agotado" is treated as out of stock even with stock loaded', () => {
    const p = ProductsManager.mapProduct({ id: 1, name: 'X', price: 1000, stock: 5, status: 'agotado' });
    assert.equal(p.stock, 0);
    assert.equal(ProductsManager.stockState(p), 'out');
});

test('"a_pedido" and "pocas" keep their stock and their own state', () => {
    const order = ProductsManager.mapProduct({ id: 2, name: 'Y', price: 1000, stock: 0, status: 'a_pedido' });
    const few = ProductsManager.mapProduct({ id: 3, name: 'Z', price: 1000, stock: 2, status: 'pocas' });
    assert.equal(ProductsManager.stockState(order), 'order');
    assert.equal(few.stock, 2);
    assert.equal(ProductsManager.stockState(few), 'pocas');
});

test('WhatsApp message uses the server total and omits the empty product section', () => {
    ProductsManager.products = [ProductsManager.mapProduct({ id: 2, name: 'Collar', price: 1000, stock: 0, status: 'a_pedido' })];
    ProductsManager.config = { shippingCost: 5990, freeShippingMin: 0 };
    const items = [{ productId: 2, name: 'Collar', price: 1000, quantity: 2, size: 'Única', color: '' }];
    const text = CartManager.generateWhatsAppText({ name: 'Ana', phone: '1', email: 'a@b.cl' }, 'PF-0001', items, 2000);
    assert.match(text, /\*Total:\* \$2\.000/);
    assert.doesNotMatch(text, /\*Productos:\*/);
    assert.match(text, /\*Productos A Pedido/);
});
