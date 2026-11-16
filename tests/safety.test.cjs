const test = require('node:test');
const assert = require('node:assert/strict');
const Safety = require('../js/safety.js');

test('safe href allows web links and local paths but rejects executable schemes', () => {
    assert.equal(Safety.safeHref('https://example.com/store'), 'https://example.com/store');
    assert.equal(Safety.safeHref('/pages/categoria.html'), '/pages/categoria.html');
    assert.equal(Safety.safeHref('javascript:alert(1)'), '');
    assert.equal(Safety.safeHref('data:text/html,<script>alert(1)</script>'), '');
    assert.equal(Safety.safeHref('file:///etc/passwd'), '');
});

test('safe href only allows anchors when explicitly requested', () => {
    assert.equal(Safety.safeHref('#catalog'), '');
    assert.equal(Safety.safeHref('#catalog', { allowHash: true }), '#catalog');
});

test('safe media URLs reject active schemes and limit blobs to local previews', () => {
    assert.equal(Safety.safeMediaUrl('https://cdn.example.com/image.jpg'), 'https://cdn.example.com/image.jpg');
    assert.equal(Safety.safeMediaUrl('images/products/coat.jpg'), 'images/products/coat.jpg');
    assert.equal(Safety.safeMediaUrl('javascript:alert(1)'), '');
    assert.equal(Safety.safeMediaUrl('data:text/html,<svg onload=alert(1)>'), '');
    assert.equal(Safety.safeMediaUrl('blob:https://example.com/abc'), '');
    assert.equal(Safety.safeMediaUrl('blob:https://example.com/abc', { allowBlob: true }), 'blob:https://example.com/abc');
});
