(function (root) {
    const MAX_STOCK = 2147483647;
    const DEFAULT_THRESHOLD = 3;

    function parseWholeNumber(value, max = MAX_STOCK) {
        const raw = String(value ?? '').trim();
        if (!/^\d+$/.test(raw)) return null;
        const number = Number(raw);
        return Number.isSafeInteger(number) && number <= max ? number : null;
    }

    function parseThreshold(value) {
        const threshold = parseWholeNumber(value, 100000);
        return threshold !== null && threshold > 0 ? threshold : null;
    }

    function stockState(value, threshold = DEFAULT_THRESHOLD) {
        const stock = parseWholeNumber(value);
        const lowAt = parseThreshold(threshold) || DEFAULT_THRESHOLD;
        if (stock === null) return 'invalid';
        if (stock === 0) return 'out';
        return stock <= lowAt ? 'low' : 'in';
    }

    const api = { MAX_STOCK, DEFAULT_THRESHOLD, parseWholeNumber, parseThreshold, stockState };
    root.PFInventory = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
