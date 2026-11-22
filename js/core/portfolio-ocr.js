/**
 * js/core/portfolio-ocr.js
 * Reuses Portfolio's existing offline Tesseract.js v5 engine (lib/tesseract/v5/)
 * for scanned PDF/image pages without duplicating OCR vendor assets.
 */
(function (window) {
    'use strict';

    let tesseractLoadPromise = null;

    function resolveBase(customBase) {
        if (customBase) return customBase.replace(/\/+$/, '');
        const p = (window.location && window.location.pathname) || '';
        return (p.includes('/pages/') || p.includes('/shelves/'))
            ? '../lib/tesseract/v5'
            : './lib/tesseract/v5';
    }

    function ensureLoaded(libBase) {
        if (typeof window.Tesseract !== 'undefined') return Promise.resolve(true);
        if (tesseractLoadPromise) return tesseractLoadPromise;
        const base = resolveBase(libBase);
        tesseractLoadPromise = new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = base + '/tesseract.min.js';
            s.onload = () => resolve(typeof window.Tesseract !== 'undefined');
            s.onerror = () => {
                tesseractLoadPromise = null;
                resolve(false);
            };
            document.head.appendChild(s);
        });
        return tesseractLoadPromise;
    }

    async function runRecognize(source, lang, base, onProgress) {
        return await window.Tesseract.recognize(source, lang, {
            langPath: base + '/tesseract-lang',
            workerPath: base + '/worker.min.js',
            corePath: base + '/tesseract-core',
            logger: (msg) => {
                if (typeof onProgress === 'function' && msg && typeof msg.progress === 'number') {
                    onProgress(Math.round(msg.progress * 100), msg.status || '');
                }
            }
        });
    }

    async function recognizeCanvas(canvas, options) {
        const opts = options || {};
        const base = resolveBase(opts.libBase);
        const ok = await ensureLoaded(base);
        if (!ok || !canvas) return { text: '', lines: [] };

        const primaryLang = opts.lang || 'deu+fra';
        let result = null;
        try {
            result = await runRecognize(canvas, primaryLang, base, opts.onProgress);
        } catch (err) {
            if (primaryLang !== 'deu') {
                try {
                    result = await runRecognize(canvas, 'deu', base, opts.onProgress);
                } catch (_fallbackErr) {
                    return { text: '', lines: [] };
                }
            } else {
                return { text: '', lines: [] };
            }
        }

        const rawText = (result && result.data && result.data.text) ? result.data.text.trim() : '';
        if (!rawText) return { text: '', lines: [] };

        const lines = rawText
            .split(/\r?\n/)
            .map(l => l.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .map(l => ({ text: l, heading: 0 }));

        return { text: rawText, lines };
    }

    window.PortfolioOCR = Object.freeze({
        ensureLoaded,
        recognizeCanvas
    });
})(window);
