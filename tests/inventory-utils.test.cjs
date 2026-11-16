const test = require('node:test');
const assert = require('node:assert/strict');
const Inventory = require('../admin/js/inventory-utils.js');

test('whole-number stock parser accepts non-negative integers only', () => {
    assert.equal(Inventory.parseWholeNumber('0'), 0);
    assert.equal(Inventory.parseWholeNumber('12'), 12);
    assert.equal(Inventory.parseWholeNumber(' 12 '), 12);
});

test('whole-number stock parser rejects decimals, signs, exponent notation, and malformed input', () => {
    for (const value of ['2.5', '-1', '+2', '1e3', '1x', '', '   ', '999999999999999999999']) {
        assert.equal(Inventory.parseWholeNumber(value), null, String(value));
    }
});

test('stock state uses a configurable low-stock threshold', () => {
    assert.equal(Inventory.stockState(0), 'out');
    assert.equal(Inventory.stockState(1), 'low');
    assert.equal(Inventory.stockState(3), 'low');
    assert.equal(Inventory.stockState(4), 'in');
    assert.equal(Inventory.stockState(4, 4), 'low');
    assert.equal(Inventory.stockState(5, 4), 'in');
});

test('low-stock threshold itself must be a positive whole number', () => {
    assert.equal(Inventory.parseThreshold('4'), 4);
    assert.equal(Inventory.parseThreshold('0'), null);
    assert.equal(Inventory.parseThreshold('2.5'), null);
});
