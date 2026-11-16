(function (root) {
    const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
    const ALLOWED_CONTENT_TAGS = new Set(['p', 'h2', 'h3', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'a', 'blockquote']);
    const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);

    function safeHref(value, options = {}) {
        const raw = String(value ?? '').trim();
        if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw)) return '';
        if (raw.startsWith('#')) return options.allowHash && /^#[\w-]*$/.test(raw) ? raw : '';

        const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(raw);
        if (hasScheme) {
            try {
                const parsed = new URL(raw);
                return HTTP_PROTOCOLS.has(parsed.protocol) ? raw : '';
            } catch (e) {
                return '';
            }
        }

        if (raw.startsWith('//')) return '';
        try {
            const parsed = new URL(raw, 'https://popflame.invalid/');
            return parsed.origin === 'https://popflame.invalid' ? raw : '';
        } catch (e) {
            return '';
        }
    }

    function safeMediaUrl(value, options = {}) {
        const raw = String(value ?? '').trim();
        if (/^blob:/i.test(raw)) return options.allowBlob ? raw : '';
        if (/^data:/i.test(raw)) {
            return options.allowDataImage && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(raw) ? raw : '';
        }
        return safeHref(raw);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function sanitizeRichHtml(value) {
        const raw = String(value ?? '');
        if (typeof DOMParser === 'undefined' || typeof document === 'undefined') return escapeHtml(raw);
        const parsed = new DOMParser().parseFromString(raw, 'text/html');
        const fragment = document.createDocumentFragment();

        const copySafe = (source, target) => {
            for (const child of source.childNodes) {
                if (child.nodeType === 3) {
                    target.appendChild(document.createTextNode(child.textContent || ''));
                    continue;
                }
                if (child.nodeType !== 1) continue;
                const tag = child.tagName.toLowerCase();
                if (DROP_CONTENT_TAGS.has(tag)) continue;

                if (!ALLOWED_CONTENT_TAGS.has(tag)) {
                    copySafe(child, target);
                    continue;
                }

                const element = document.createElement(tag);
                if (tag === 'a') {
                    const href = safeHref(child.getAttribute('href'));
                    if (href) {
                        element.setAttribute('href', href);
                        element.setAttribute('rel', 'noopener noreferrer');
                    }
                }
                copySafe(child, element);
                target.appendChild(element);
            }
        };

        copySafe(parsed.body, fragment);
        const holder = document.createElement('div');
        holder.appendChild(fragment);
        return holder.innerHTML;
    }

    const api = { safeHref, safeMediaUrl, escapeHtml, sanitizeRichHtml };
    root.PFSafety = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
