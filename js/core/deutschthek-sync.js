/**
 * js/core/deutschthek-sync.js
 * OsirisSecurity + DeutschThek Live Catalog Synchronization + Social Share Helper
 * (Zero P2P / Zero Swarm / Zero hardcoded phone numbers)
 */
(function (window) {
    'use strict';

    const SYNC_CHANNEL_NAME = 'osiris_deutschthek_sync_v1';
    const META_STORAGE_KEY = 'deutschthek_catalog_meta';
    const UPDATED_DOCS_KEY = 'dt_synced_docs';
    const LEGACY_UPDATED_KEY = 'p2p_updated_docs';
    const LAST_CHECK_KEY = 'deutschthek_last_sync_check';
    const AUTO_THROTTLE_MS = 60000;
    const PERIODIC_SYNC_MS = 180000;
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const MAX_META_STRING_LEN = 200;

    const DEFAULT_CATALOG_URLS = Object.freeze([
        'https://osirisai-dev.github.io/DeutschThek/data/official-catalog.json',
        'https://deutschthek.pages.dev/data/official-catalog.json',
        'https://raw.githubusercontent.com/OsirisAI-dev/DeutschThek/main/data/official-catalog.json'
    ]);

    const ALLOWED_THEMES = Object.freeze(['light', 'dark', 'osiris', 'snow', 'grass', 'ocean', 'sunset']);
    const ALLOWED_FONTS = Object.freeze([
        "'Brush Script MT', cursive",
        "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        "Georgia, 'Times New Roman', serif",
        "'Courier New', Courier, monospace",
        "'Trebuchet MS', Verdana, sans-serif",
        "'Arial Narrow', Arial, sans-serif",
        "'Palatino Linotype', 'Book Antiqua', Palatino, serif"
    ]);

    let broadcastChannel = null;
    let activeSyncPromise = null;
    let periodicTimer = null;
    let listenersAttached = false;
    const syncCallbacks = new Set();

    function getUiLang() {
        try {
            const prefs = JSON.parse(localStorage.getItem('osiris_hub_prefs') || '{}');
            if (prefs && (prefs.lang === 'DE' || prefs.lang === 'FR')) return prefs.lang;
        } catch (e) {}
        return (document.documentElement.getAttribute('lang') || 'fr').toUpperCase().startsWith('DE') ? 'DE' : 'FR';
    }

    // =========================================================================
    // 1. ZERO-TRUST SECURITY & SANITIZATION SUITE (window.OsirisSecurity)
    // =========================================================================

    function isTrustedOrigin(event) {
        if (!event) return false;
        if (window.location.protocol === 'file:' && (event.origin === 'null' || event.origin === '' || event.origin === 'file://')) {
            return true;
        }
        return event.origin === window.location.origin;
    }

    function getTargetOrigin() {
        if (window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null') {
            return '*';
        }
        return window.location.origin;
    }

    function sanitizeThemeName(theme) {
        const t = String(theme || '').trim().toLowerCase();
        return ALLOWED_THEMES.indexOf(t) !== -1 ? t : 'light';
    }

    function sanitizeFontFamily(font) {
        const f = String(font || '').trim();
        if (ALLOWED_FONTS.indexOf(f) !== -1) return f;
        if (/^[a-zA-Z0-9\s,'"\-]+$/.test(f) && f.length <= 100 && !/url\s*\(|expression|import/i.test(f)) {
            return f;
        }
        return ALLOWED_FONTS[1];
    }

    function escapeHtml(val) {
        if (val === null || val === undefined) return '';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#96;');
    }

    function clampString(val, maxLen) {
        if (val === null || val === undefined) return '';
        const s = String(val)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u202A-\u202E\u2066-\u2069]/g, '')
            .trim();
        const limit = maxLen || MAX_META_STRING_LEN;
        return s.length > limit ? s.substring(0, limit) : s;
    }

    function sanitizeFileName(fileName) {
        let raw = String(fileName || 'Dokument.pdf')
            .replace(/[\u202A-\u202E\u2066-\u2069\u0000-\u001F\u007F-\u009F]/g, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\.{2,}/g, '_')
            .replace(/^\.+/, '');
        const dangerousExts = /\.(exe|dll|scr|bat|cmd|vbs|vbe|js|jse|wsf|wsh|msc|ps1|ps2|psc1|psc2|msi|msp|com|pif|reg|hta|jar)$/i;
        if (dangerousExts.test(raw)) {
            raw = raw.replace(dangerousExts, '.blocked');
        }
        return clampString(raw, 150) || 'Dokument.pdf';
    }

    function sanitizeUrl(url) {
        if (!url || typeof url !== 'string') return '#';
        const trimmed = url.replace(/[\x00-\x20\u202A-\u202E\u2066-\u2069]/g, '').trim();
        if (window.location.protocol !== 'file:' && /^file:/i.test(trimmed)) {
            return '#';
        }
        try {
            const parsed = new URL(trimmed, window.location.origin);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.href.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
            }
        } catch (e) {}
        return '#';
    }

    function sanitizeDataUrl(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return '';
        const trimmed = dataUrl.trim();
        const lower = trimmed.substring(0, 100).toLowerCase();
        if (!lower.startsWith('data:') || !lower.includes(';base64,')) return '';
        if (lower.startsWith('data:text/html') ||
            lower.startsWith('data:application/javascript') ||
            lower.startsWith('data:text/javascript') ||
            lower.startsWith('data:image/svg+xml')) {
            return '';
        }
        const commaIdx = trimmed.indexOf(',');
        if (commaIdx === -1) return '';
        const b64 = trimmed.substring(commaIdx + 1).replace(/\s+/g, '');
        if (!/^[A-Za-z0-9+/=]+$/.test(b64.substring(0, 500))) return '';
        return trimmed.substring(0, commaIdx + 1) + b64;
    }

    function sanitizeHtmlFragment(dirtyHtml) {
        if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(dirtyHtml, 'text/html');
            const forbiddenTags = [
                'script', 'iframe', 'object', 'embed', 'svg', 'math',
                'form', 'input', 'button', 'textarea', 'select', 'meta',
                'link', 'style', 'base', 'applet', 'frame', 'frameset',
                'audio', 'video', 'source', 'track', 'portal', 'template', 'noscript'
            ];
            forbiddenTags.forEach(tag => {
                doc.querySelectorAll(tag).forEach(el => el.remove());
            });
            doc.body.querySelectorAll('*').forEach(el => {
                Array.from(el.attributes).forEach(attr => {
                    const name = attr.name.toLowerCase();
                    const val = (attr.value || '').replace(/[\x00-\x20]/g, '').toLowerCase();
                    if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'style' || name === 'id' || name === 'name') {
                        el.removeAttribute(attr.name);
                    } else if (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') {
                        if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/png;base64,') || val.startsWith('data:image/jpeg;base64,')) {
                            if (name === 'href') {
                                el.setAttribute('target', '_blank');
                                el.setAttribute('rel', 'noopener noreferrer');
                            }
                        } else {
                            el.removeAttribute(attr.name);
                        }
                    }
                });
            });
            return doc.body.innerHTML;
        } catch (e) {
            return '';
        }
    }

    function safeJsonParse(raw) {
        if (!raw || typeof raw !== 'string') return null;
        try {
            return JSON.parse(raw, (key, value) => {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    return undefined;
                }
                return value;
            });
        } catch (e) {
            return null;
        }
    }

    function dataUrlToUint8Array(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') throw new Error('Invalid DataURL');
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx === -1) throw new Error('Malformed DataURL');
        const base64 = dataUrl.substring(commaIdx + 1).replace(/\s+/g, '');
        const binary = atob(base64);
        const len = binary.length;
        if (len > MAX_FILE_BYTES) throw new Error(`File size ${len} exceeds max limit`);
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
        return u8;
    }

    function validateMagicBytes(u8, fileName) {
        if (!u8 || !(u8 instanceof Uint8Array) || u8.length === 0) {
            return { valid: false, reason: 'Leere oder ungültige Binärdaten' };
        }
        if (u8.length > MAX_FILE_BYTES) {
            return { valid: false, reason: `Dateigröße (${(u8.length / (1024 * 1024)).toFixed(1)} MB) überschreitet 25 MB` };
        }

        const len = u8.length;
        const b0 = u8[0], b1 = u8[1], b2 = u8[2], b3 = u8[3];

        if (b0 === 0x4D && b1 === 0x5A) {
            return { valid: false, reason: 'Ausführbare Windows-Dateien (.exe, .dll, .scr) sind verboten' };
        }
        if (b0 === 0x7F && b1 === 0x45 && b2 === 0x4C && b3 === 0x46) {
            return { valid: false, reason: 'Ausführbare ELF-Binärdateien sind verboten' };
        }
        if (b0 === 0xCA && b1 === 0xFE && b2 === 0xBA && b3 === 0xBE) {
            return { valid: false, reason: 'Ausführbare Java-Klassendateien sind verboten' };
        }
        if (b0 === 0x4C && b1 === 0x00 && b2 === 0x00 && b3 === 0x00 && len >= 8 && u8[4] === 0x01 && u8[5] === 0x14) {
            return { valid: false, reason: 'Windows-Verknüpfungsdateien (.lnk) sind verboten' };
        }

        if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) {
            const checkLen = Math.min(len, 200000);
            const strSlice = typeof TextDecoder !== 'undefined'
                ? new TextDecoder('latin1').decode(u8.subarray(0, checkLen))
                : String.fromCharCode.apply(null, u8.subarray(0, checkLen));
            const dangerousPatterns = [
                /\/JavaScript\b/i, /\/JS\b/i, /\/Launch\b/i, /\/SubmitForm\b/i,
                /\/ImportData\b/i, /\/RichMedia\b/i, /\/OpenAction\b/i, /\/AA\b/i,
                /\/URI\s*\([^)]*javascript:/i
            ];
            for (const pat of dangerousPatterns) {
                if (pat.test(strSlice)) {
                    return { valid: false, reason: 'PDF enthält aktive Inhalte / Skripte (' + pat.source + ')' };
                }
            }
            return { valid: true, type: 'application/pdf' };
        }

        if (b0 === 0x50 && b1 === 0x4B && b2 === 0x03 && b3 === 0x04) {
            const checkLen = Math.min(len, 200000);
            const strSlice = typeof TextDecoder !== 'undefined'
                ? new TextDecoder('latin1').decode(u8.subarray(0, checkLen))
                : String.fromCharCode.apply(null, u8.subarray(0, checkLen));
            if (strSlice.includes('vbaProject.bin') || strSlice.includes('vbaData.xml') ||
                strSlice.includes('oleObject') || strSlice.includes('.exe') ||
                strSlice.includes('.vbs') || strSlice.includes('.bat') ||
                strSlice.includes('.ps1') || strSlice.includes('.cmd')) {
                return { valid: false, reason: 'Office-Container enthält Makros oder ausführbaren Code' };
            }
            return { valid: true, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
        }

        if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return { valid: true, type: 'image/png' };
        if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return { valid: true, type: 'image/jpeg' };
        if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46 && len >= 12 &&
            u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) {
            return { valid: true, type: 'image/webp' };
        }
        if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46 && b3 === 0x38) return { valid: true, type: 'image/gif' };

        const ext = (fileName || '').toLowerCase().split('.').pop();
        if (ext === 'txt' || ext === 'text' || ext === 'wiki') {
            for (let i = 0; i < Math.min(len, 4096); i++) {
                const byte = u8[i];
                if (byte === 0x00 || (byte < 0x09 && byte !== 0x07 && byte !== 0x08) || (byte > 0x0D && byte < 0x20 && byte !== 0x1B)) {
                    return { valid: false, reason: 'Textdatei enthält unerwartete Binärzeichen' };
                }
            }
            return { valid: true, type: 'text/plain' };
        }

        return { valid: false, reason: 'Dateityp nicht zugelassen (Nur PDF, DOCX, PNG, JPEG, WEBP, GIF, TXT)' };
    }

    async function computeSHA256(buffer) {
        if (!buffer) return '';
        try {
            if (window.crypto && window.crypto.subtle) {
                const hashBuf = await window.crypto.subtle.digest('SHA-256', buffer);
                return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) {}
        return '';
    }

    function sanitizeDocRecord(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const cleanThema = clampString(raw.thema || raw.title || 'Unbenannt', MAX_META_STRING_LEN);
        const cleanLektion = clampString(raw.lektion || '—', MAX_META_STRING_LEN);
        const cleanBuch = clampString(raw.buch || '—', MAX_META_STRING_LEN);
        const cleanKlassen = clampString(raw.klassen || raw.klasse || 'Alle', 80);
        const cleanJahr = clampString(raw.jahr || '2026', 20);
        const cleanTyp = clampString(raw.typ || raw.doktyp || 'Prüfungsstoff', 80);
        const cleanSubTyp = Array.isArray(raw.subTyp) ? raw.subTyp.slice(0, 10).map(s => clampString(s, 80)) : [];
        const cleanFileName = sanitizeFileName(raw.fileName || 'Dokument.pdf');
        const cleanFileType = clampString(raw.fileType || 'application/pdf', 100);
        const cleanDataUrl = sanitizeDataUrl(raw.fileData);

        let cleanId;
        if (typeof raw.id === 'number' && !isNaN(raw.id) && raw.id > 0) {
            cleanId = raw.id;
        } else if (typeof raw.id === 'string' && raw.id.trim().length > 0) {
            const num = Number(raw.id);
            cleanId = (!isNaN(num) && num > 0) ? num : raw.id.trim();
        } else {
            cleanId = Date.now() + Math.floor(Math.random() * 1000000);
        }

        return Object.assign({}, raw, {
            id: cleanId,
            thema: cleanThema,
            lektion: cleanLektion,
            buch: cleanBuch,
            klassen: cleanKlassen,
            jahr: cleanJahr,
            typ: cleanTyp,
            subTyp: cleanSubTyp,
            doktyp: raw.doktyp || cleanTyp,
            fileName: cleanFileName,
            fileType: cleanFileType,
            fileSize: Math.min(Math.max(0, Number(raw.fileSize) || 0), MAX_FILE_BYTES),
            fileHash: clampString(raw.fileHash || '', 64).replace(/[^a-f0-9]/gi, '').toLowerCase(),
            fileData: cleanDataUrl,
            date: clampString(raw.date || new Date().toLocaleDateString(), 40),
            sourceDb: clampString(raw.sourceDb || '', 60),
            text: typeof raw.text === 'string' ? raw.text : (raw.content || ''),
            questions: Array.isArray(raw.questions) ? raw.questions : []
        });
    }

    function sanitizeWikiEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        let cleanId;
        if (typeof raw.id === 'number' && !isNaN(raw.id) && raw.id > 0) {
            cleanId = raw.id;
        } else if (typeof raw.id === 'string' && raw.id.trim().length > 0) {
            const num = Number(raw.id);
            cleanId = (!isNaN(num) && num > 0) ? num : raw.id.trim();
        } else {
            cleanId = Date.now() + Math.floor(Math.random() * 1000000);
        }
        return Object.assign({}, raw, {
            id: cleanId,
            title: clampString(raw.title || raw.thema || 'Ohne Titel', 140),
            text: clampString(raw.text || '', 120000),
            url: sanitizeUrl(raw.url || raw.sourceLink || '') !== '#' ? sanitizeUrl(raw.url || raw.sourceLink || '') : clampString(raw.url || raw.sourceLink || '', 300),
            lang: clampString(raw.lang || 'de', 12),
            length: clampString(raw.length || 'Medium', 20),
            keywords: Array.isArray(raw.keywords) ? raw.keywords.slice(0, 12).map(k => clampString(k, 60)).filter(Boolean) : [],
            date: clampString(raw.date || new Date().toLocaleDateString('de-DE'), 40),
            updatedAt: clampString(raw.updatedAt || '', 60)
        });
    }

    function sanitizeLinkEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const href = sanitizeUrl(raw.url);
        if (!href || href === '#') return null;
        const entry = {
            name: clampString(raw.name || raw.label || href, 100),
            url: href
        };
        if (raw.category) entry.category = clampString(raw.category, 40);
        return entry;
    }

    function trackUpdatedDoc(id, hash) {
        try {
            const stored = JSON.parse(localStorage.getItem(UPDATED_DOCS_KEY) || '[]');
            const cleanHash = (hash || '').toLowerCase().trim();
            const cleanId = Number(id) || 0;
            const exists = stored.some(s => (cleanId > 0 && Number(s.id) === cleanId) || (cleanHash && s.hash && s.hash.toLowerCase() === cleanHash));
            if (!exists) {
                stored.unshift({ id: cleanId, hash: cleanHash, time: Date.now() });
                if (stored.length > 300) stored.splice(300);
                localStorage.setItem(UPDATED_DOCS_KEY, JSON.stringify(stored));
            }
        } catch (e) {}
    }

    function isDocAnUpdate(doc) {
        if (!doc) return false;
        if (doc.isDeutschThekSync || doc.isOfficial || doc.isUpdated || doc.isSwarmImport) return true;
        try {
            const list = JSON.parse(localStorage.getItem(UPDATED_DOCS_KEY) || '[]')
                .concat(JSON.parse(localStorage.getItem(LEGACY_UPDATED_KEY) || '[]'));
            const docHash = (doc.fileHash || '').toLowerCase().trim();
            const docId = Number(doc.id) || 0;
            return list.some(s => (docId > 0 && Number(s.id) === docId) || (docHash && s.hash && String(s.hash).toLowerCase() === docHash));
        } catch (e) {
            return false;
        }
    }

    const osirisSecurityApi = Object.freeze({
        escapeHtml,
        clampString,
        sanitizeUrl,
        sanitizeDataUrl,
        sanitizeHtmlFragment,
        safeJsonParse,
        validateMagicBytes,
        sanitizeDocRecord,
        sanitizeWikiEntry,
        sanitizeLinkEntry,
        sanitizeThemeName,
        sanitizeFontFamily,
        sanitizeFileName,
        isTrustedOrigin,
        getTargetOrigin,
        computeSHA256,
        MAX_FILE_BYTES,
        trackUpdatedDoc,
        isDocAnUpdate
    });

    // =========================================================================
    // 2. TOAST FEEDBACK & CROSS-FRAME BROADCAST
    // =========================================================================

    function showToast(message, type) {
        try {
            const hostDoc = (window.top && window.top.document && window.top.document.body) ? window.top.document : document;
            if (!hostDoc || !hostDoc.body) return;
            let container = hostDoc.getElementById('osiris-dt-sync-toast-container');
            if (!container) {
                container = hostDoc.createElement('div');
                container.id = 'osiris-dt-sync-toast-container';
                container.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:999999; display:flex; flex-direction:column; gap:10px; pointer-events:none; max-width:420px;';
                hostDoc.body.appendChild(container);
            }
            const toast = hostDoc.createElement('div');
            const bgColor = type === 'warning' || type === 'error' ? '#b91c1c' : (type === 'success' ? '#15803d' : '#2563eb');
            toast.style.cssText = `background:${bgColor}; color:#fff; padding:12px 16px; border-radius:10px; font-family:system-ui,-apple-system,sans-serif; font-size:0.86rem; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,0.22); pointer-events:auto; transition:opacity 0.25s ease, transform 0.25s ease;`;
            toast.textContent = String(message || '');
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(8px)';
                setTimeout(() => toast.remove(), 300);
            }, 4200);
        } catch (e) {}
    }

    function broadcastSyncReload(detail) {
        syncCallbacks.forEach(cb => {
            try { cb(detail); } catch (e) {}
        });
        const targetOrigin = getTargetOrigin();
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'RELOAD_DATA', payload: detail }, targetOrigin);
            }
        } catch (e) {}
        try {
            document.querySelectorAll('iframe').forEach(f => {
                if (f && f.contentWindow) {
                    f.contentWindow.postMessage({ type: 'RELOAD_DATA', payload: detail }, targetOrigin);
                }
            });
        } catch (e) {}
        try {
            if (broadcastChannel) {
                broadcastChannel.postMessage({ type: 'DEUTSCHTHEK_SYNCED', payload: detail });
            }
        } catch (e) {}
        try {
            window.postMessage({ type: 'RELOAD_DATA', payload: detail }, targetOrigin);
        } catch (e) {}
    }

    // =========================================================================
    // 3. LIVE DEUTSCHTHEK CATALOG SYNC (TestBankDB + OfflineWiki + SuggestedLinks)
    // =========================================================================

    function getCatalogUrls() {
        if (Array.isArray(window.DEUTSCHTHEK_CATALOG_URLS) && window.DEUTSCHTHEK_CATALOG_URLS.length > 0) {
            return window.DEUTSCHTHEK_CATALOG_URLS;
        }
        return DEFAULT_CATALOG_URLS;
    }

    function readSavedMeta() {
        try {
            return JSON.parse(localStorage.getItem(META_STORAGE_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function saveMeta(meta) {
        try {
            localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
        } catch (e) {}
    }

    async function fetchWithTimeout(url, opts, timeoutMs) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timer = null;
        if (controller) {
            timer = setTimeout(() => controller.abort(), timeoutMs);
        }
        try {
            const fetchOpts = Object.assign({ cache: 'no-store', mode: 'cors' }, opts || {});
            if (controller) fetchOpts.signal = controller.signal;
            return await fetch(url, fetchOpts);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function fetchCatalog(force) {
        if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) {
            return { offline: true };
        }
        const savedMeta = readSavedMeta();
        const urls = getCatalogUrls();
        const ts = Date.now();

        for (const baseCatalogUrl of urls) {
            const sep = baseCatalogUrl.includes('?') ? '&' : '?';
            const bustedUrl = `${baseCatalogUrl}${sep}t=${ts}`;
            try {
                let etag = '';
                let lastMod = '';

                if (!force && savedMeta && savedMeta.url === baseCatalogUrl) {
                    try {
                        const headResp = await fetchWithTimeout(bustedUrl, { method: 'HEAD' }, 5000);
                        if (headResp && headResp.ok) {
                            etag = headResp.headers.get('etag') || '';
                            lastMod = headResp.headers.get('last-modified') || '';
                            const hasValidator = Boolean(etag || lastMod);
                            if (hasValidator &&
                                (!etag || savedMeta.etag === etag) &&
                                (!lastMod || savedMeta.lastModified === lastMod)) {
                                saveMeta(Object.assign({}, savedMeta, { checkedAt: Date.now() }));
                                return { unchanged: true, url: baseCatalogUrl };
                            }
                        }
                    } catch (_headErr) {
                        // Fall back directly to GET if HEAD isn't allowed
                    }
                }

                const resp = await fetchWithTimeout(bustedUrl, { method: 'GET' }, 25000);
                if (!resp || !resp.ok) continue;
                etag = resp.headers.get('etag') || etag;
                lastMod = resp.headers.get('last-modified') || lastMod;
                const rawText = await resp.text();
                const data = safeJsonParse(rawText);
                if (data && Array.isArray(data.documents)) {
                    return {
                        catalog: data,
                        url: baseCatalogUrl,
                        etag,
                        lastModified: lastMod
                    };
                }
            } catch (err) {
                console.warn('[DeutschThekSync] Catalog endpoint unreachable:', baseCatalogUrl, err && err.message ? err.message : err);
            }
        }
        return { error: true };
    }

    function openTestBankDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('TestBankDB');
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('documents')) {
                    db.createObjectStore('documents', { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                const db = e.target.result;
                if (db.objectStoreNames.contains('documents')) {
                    resolve(db);
                } else {
                    const nextV = (db.version || 1) + 1;
                    db.close();
                    const up = indexedDB.open('TestBankDB', nextV);
                    up.onupgradeneeded = (ev) => {
                        const upDb = ev.target.result;
                        if (!upDb.objectStoreNames.contains('documents')) {
                            upDb.createObjectStore('documents', { keyPath: 'id' });
                        }
                    };
                    up.onsuccess = (ev) => resolve(ev.target.result);
                    up.onerror = (ev) => reject(ev.target.error);
                }
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async function readTestBankIndex(db) {
        return new Promise((resolve) => {
            const tx = db.transaction(['documents'], 'readonly');
            const store = tx.objectStore('documents');
            const byId = new Map();
            const hashes = new Set();
            const fileKeys = new Set();
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const v = cursor.value;
                    if (v) {
                        const numId = Number(v.id);
                        if (numId > 0) byId.set(numId, v);
                        if (v.fileHash) hashes.add(String(v.fileHash).trim().toLowerCase());
                        if (v.fileName && v.fileSize) {
                            fileKeys.add(`${String(v.fileName).trim().toLowerCase()}_${Number(v.fileSize)}`);
                        }
                    }
                    cursor.continue();
                } else {
                    resolve({ byId, hashes, fileKeys });
                }
            };
            req.onerror = () => resolve({ byId, hashes, fileKeys });
        });
    }

    async function writeBigWikiBackup(list) {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('OsirisBigStorage', 1);
                req.onupgradeneeded = (e) => {
                    if (!e.target.result.objectStoreNames.contains('store')) {
                        e.target.result.createObjectStore('store');
                    }
                };
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('store')) { db.close(); return resolve(false); }
                    const tx = db.transaction(['store'], 'readwrite');
                    tx.objectStore('store').put(JSON.stringify(list), 'offline_wiki_db');
                    tx.oncomplete = () => { db.close(); resolve(true); };
                    tx.onerror = () => { db.close(); resolve(false); };
                };
                req.onerror = () => resolve(false);
            } catch (e) { resolve(false); }
        });
    }

    async function readBigWikiBackup() {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('OsirisBigStorage', 1);
                req.onupgradeneeded = (e) => {
                    if (!e.target.result.objectStoreNames.contains('store')) {
                        e.target.result.createObjectStore('store');
                    }
                };
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('store')) { db.close(); return resolve([]); }
                    const tx = db.transaction(['store'], 'readonly');
                    const getReq = tx.objectStore('store').get('offline_wiki_db');
                    getReq.onsuccess = () => {
                        db.close();
                        try {
                            const arr = getReq.result ? JSON.parse(getReq.result) : [];
                            resolve(Array.isArray(arr) ? arr : []);
                        } catch (_e) { resolve([]); }
                    };
                    getReq.onerror = () => { db.close(); resolve([]); };
                };
                req.onerror = () => resolve([]);
            } catch (e) { resolve([]); }
        });
    }

    async function syncWikiEntries(wikiDocs) {
        if (!Array.isArray(wikiDocs) || wikiDocs.length === 0) return { added: 0, updated: 0 };

        let lsList = [];
        try { lsList = safeJsonParse(localStorage.getItem('offline_wiki_db') || '[]') || []; } catch (e) { lsList = []; }
        if (!Array.isArray(lsList)) lsList = [];

        const bigList = await readBigWikiBackup();
        const merged = [];
        const seen = new Set();
        [...lsList, ...bigList].forEach(item => {
            if (!item) return;
            const key = item.id ? 'id:' + String(item.id) : 'title:' + String(item.title || '').toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(item);
            }
        });

        let added = 0;
        let updated = 0;

        for (const rawDoc of wikiDocs) {
            const clean = sanitizeWikiEntry(rawDoc);
            if (!clean) continue;
            clean.isOfficial = true;
            clean.isDeutschThekSync = true;
            if (!clean.url || clean.url === '#') clean.url = 'https://deutschthek.local/wiki';

            const normTitle = String(clean.title || '').trim().toLowerCase();
            const docId = Number(clean.id) || 0;
            const idx = merged.findIndex(w => w && (
                (docId > 0 && Number(w.id) === docId) ||
                (normTitle && String(w.title || w.thema || '').trim().toLowerCase() === normTitle)
            ));

            if (idx === -1) {
                merged.unshift(clean);
                added++;
            } else if (clean.updatedAt && merged[idx].updatedAt !== clean.updatedAt) {
                merged[idx] = Object.assign({}, merged[idx], clean);
                updated++;
            }
        }

        if (added > 0 || updated > 0) {
            try {
                localStorage.setItem('offline_wiki_db', JSON.stringify(merged));
            } catch (_quotaErr) {
                // Keep OsirisBigStorage updated if localStorage is full
            }
            await writeBigWikiBackup(merged);
        }
        return { added, updated };
    }

    async function syncTestBankDocs(tbDocs, catalogBaseUrl) {
        if (!Array.isArray(tbDocs) || tbDocs.length === 0) return { added: 0, updated: 0 };

        const db = await openTestBankDb();
        let index;
        try {
            index = await readTestBankIndex(db);
        } catch (err) {
            try { db.close(); } catch (_e) {}
            throw err;
        }

        const toPut = [];
        let added = 0;
        let updated = 0;

        for (const rawDoc of tbDocs) {
            if (!rawDoc || typeof rawDoc !== 'object') continue;
            const cleanDoc = sanitizeDocRecord(rawDoc);
            if (!cleanDoc) continue;

            const docHash = cleanDoc.fileHash;
            const docId = Number(cleanDoc.id) || 0;
            const fileKey = (cleanDoc.fileName && cleanDoc.fileSize > 0)
                ? `${cleanDoc.fileName.toLowerCase().trim()}_${cleanDoc.fileSize}`
                : '';

            const existing = (docId > 0 && index.byId.get(docId)) || null;
            const existsByHashOrFile = (docHash && index.hashes.has(docHash)) || (fileKey && index.fileKeys.has(fileKey));

            if (existing || existsByHashOrFile) {
                const target = existing;
                if (target && rawDoc.updatedAt && target.updatedAt !== rawDoc.updatedAt) {
                    const updatedRec = Object.assign({}, target, {
                        thema: cleanDoc.thema || target.thema,
                        typ: cleanDoc.typ || target.typ,
                        subTyp: Array.isArray(cleanDoc.subTyp) ? cleanDoc.subTyp : (target.subTyp || []),
                        niveau: rawDoc.niveau !== undefined ? clampString(rawDoc.niveau, 40) : (target.niveau || ''),
                        klasse: cleanDoc.klassen || target.klasse || target.klassen || '',
                        klassen: cleanDoc.klassen || target.klassen || target.klasse || '',
                        schulart: rawDoc.schulart !== undefined ? clampString(rawDoc.schulart, 60) : (target.schulart || ''),
                        jahr: cleanDoc.jahr || target.jahr,
                        lektion: cleanDoc.lektion !== undefined ? cleanDoc.lektion : (target.lektion || ''),
                        buch: cleanDoc.buch || target.buch,
                        kommentar: rawDoc.kommentar !== undefined ? clampString(rawDoc.kommentar, 500) : (target.kommentar || ''),
                        updatedAt: clampString(rawDoc.updatedAt, 60),
                        fileName: cleanDoc.fileName || target.fileName,
                        fileType: cleanDoc.fileType || target.fileType,
                        fileSize: cleanDoc.fileSize || target.fileSize,
                        fileHash: docHash || target.fileHash,
                        fileData: cleanDoc.fileData || target.fileData,
                        isOfficial: true,
                        isDeutschThekSync: true,
                        isUpdated: true
                    });
                    toPut.push(updatedRec);
                    trackUpdatedDoc(updatedRec.id, updatedRec.fileHash);
                    updated++;
                }
                continue;
            }

            let fileData = cleanDoc.fileData;
            if (!fileData && rawDoc.filePath) {
                try {
                    const resolvedUrl = new URL(rawDoc.filePath, catalogBaseUrl).href;
                    const fileResp = await fetchWithTimeout(resolvedUrl, { method: 'GET' }, 20000);
                    if (fileResp && fileResp.ok) {
                        const blob = await fileResp.blob();
                        fileData = await new Promise((resolve) => {
                            const r = new FileReader();
                            r.onloadend = () => resolve(sanitizeDataUrl(r.result || ''));
                            r.onerror = () => resolve('');
                            r.readAsDataURL(blob);
                        });
                    }
                } catch (_fErr) {}
            }

            if (fileData) {
                try {
                    const u8 = dataUrlToUint8Array(fileData);
                    const secCheck = validateMagicBytes(u8, cleanDoc.fileName);
                    if (!secCheck.valid) {
                        console.warn('[DeutschThekSync] Rejected unsafe file from catalog:', cleanDoc.fileName, secCheck.reason);
                        continue;
                    }
                    if (!cleanDoc.fileHash) {
                        cleanDoc.fileHash = await computeSHA256(u8.buffer);
                    }
                } catch (_secErr) {
                    continue;
                }
            }

            const newRecord = Object.assign({}, cleanDoc, {
                fileData: fileData || '',
                sourceDb: 'TestBankDB',
                isOfficial: true,
                isDeutschThekSync: true,
                isUpdated: true,
                syncedAt: Date.now()
            });
            toPut.push(newRecord);
            trackUpdatedDoc(newRecord.id, newRecord.fileHash);
            if (newRecord.fileHash) index.hashes.add(newRecord.fileHash);
            if (fileKey) index.fileKeys.add(fileKey);
            added++;
        }

        if (toPut.length > 0) {
            await new Promise((resolve) => {
                const tx = db.transaction(['documents'], 'readwrite');
                const store = tx.objectStore('documents');
                toPut.forEach(item => store.put(item));
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        }
        try { db.close(); } catch (_e) {}
        return { added, updated };
    }

    function syncSuggestedLinks(suggestedLinks) {
        if (!Array.isArray(suggestedLinks)) return false;
        const clean = suggestedLinks.map(sanitizeLinkEntry).filter(Boolean);
        const nextJson = JSON.stringify(clean);
        const prevJson = localStorage.getItem('admin_suggested_links') || '[]';
        if (nextJson !== prevJson) {
            localStorage.setItem('admin_suggested_links', nextJson);
            return true;
        }
        return false;
    }

    async function syncNow(options) {
        const opts = options || {};
        const force = !!opts.force;
        const silent = opts.silent !== false && !force;

        if (!force) {
            try {
                const lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
                if (lastCheck && (Date.now() - lastCheck < AUTO_THROTTLE_MS)) {
                    return { throttled: true, added: 0, updated: 0 };
                }
            } catch (e) {}
        }

        if (activeSyncPromise) return activeSyncPromise;

        activeSyncPromise = (async () => {
            const lang = getUiLang();
            try {
                try { localStorage.setItem(LAST_CHECK_KEY, String(Date.now())); } catch (e) {}
                const res = await fetchCatalog(force);

                if (res.offline) {
                    if (force) {
                        showToast(lang === 'DE' ? 'Offline — Synchronisierung nicht möglich.' : 'Hors ligne — synchronisation impossible.', 'warning');
                    }
                    return { offline: true, added: 0, updated: 0 };
                }

                if (res.unchanged) {
                    if (force) {
                        showToast(lang === 'DE' ? 'DeutschThek ist bereits aktuell.' : 'DeutschThek est déjà à jour.', 'info');
                    }
                    return { unchanged: true, added: 0, updated: 0 };
                }

                if (!res.catalog) {
                    if (force) {
                        showToast(lang === 'DE' ? 'DeutschThek-Katalog derzeit nicht erreichbar.' : 'Catalogue DeutschThek inaccessible pour le moment.', 'warning');
                    }
                    return { error: true, added: 0, updated: 0 };
                }

                const docs = res.catalog.documents || [];
                const tbDocs = [];
                const wikiDocs = [];

                for (const d of docs) {
                    if (!d) continue;
                    if (d.sourceDb === 'OfflineWikiDB' || d.sourceDb === 'OfflineWikiIDB' || d.categoryKey === 'OW') {
                        wikiDocs.push(d);
                    } else if (d.sourceDb === 'TestBankDB' || (!d.sourceDb && d.categoryKey === 'TB')) {
                        tbDocs.push(d);
                    }
                    // DokumentationDB is intentionally skipped: Portfolio uses Bibliothek instead
                }

                const tbStats = await syncTestBankDocs(tbDocs, res.url);
                const wikiStats = await syncWikiEntries(wikiDocs);
                const linksChanged = syncSuggestedLinks(res.catalog.suggestedLinks);

                saveMeta({
                    url: res.url,
                    updatedAt: res.catalog.updatedAt || '',
                    totalDocuments: docs.length,
                    etag: res.etag || '',
                    lastModified: res.lastModified || '',
                    checkedAt: Date.now(),
                    syncedAt: Date.now()
                });

                const totalAdded = tbStats.added + wikiStats.added;
                const totalUpdated = tbStats.updated + wikiStats.updated;

                if (totalAdded > 0 || totalUpdated > 0 || linksChanged) {
                    broadcastSyncReload({
                        deutschthekSync: true,
                        testBankAdded: tbStats.added,
                        testBankUpdated: tbStats.updated,
                        wikiAdded: wikiStats.added,
                        wikiUpdated: wikiStats.updated,
                        linksChanged
                    });
                }

                if (totalAdded > 0 || totalUpdated > 0) {
                    const count = totalAdded + totalUpdated;
                    const msg = lang === 'DE'
                        ? `${count} DeutschThek-Dokument(e) synchronisiert.`
                        : `${count} document(s) DeutschThek synchronisé(s).`;
                    showToast(msg, 'success');
                } else if (force || !silent) {
                    const msg = lang === 'DE'
                        ? 'DeutschThek ist auf dem neuesten Stand.'
                        : 'DeutschThek est déjà à jour.';
                    showToast(msg, 'info');
                }

                return {
                    added: totalAdded,
                    updated: totalUpdated,
                    tbStats,
                    wikiStats,
                    linksChanged
                };
            } finally {
                activeSyncPromise = null;
            }
        })();

        return activeSyncPromise;
    }

    // =========================================================================
    // 4. GENERIC SOCIAL SHARE HELPER (WhatsApp share, Telegram, Email, Bluetooth)
    // =========================================================================

    function exportSinglePackage(docData) {
        const safeDoc = sanitizeDocRecord(docData);
        if (!safeDoc) return;
        const pkg = {
            app: 'OsirisEduHub',
            version: '3.0',
            exportedAt: new Date().toISOString(),
            document: safeDoc
        };
        const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (safeDoc.thema || 'Dokument').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
        a.download = `${safeName}.edu.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    async function shareSocial(platform, docData) {
        const safeDoc = sanitizeDocRecord(docData);
        if (!safeDoc) return;
        const fileName = safeDoc.fileName;
        const title = safeDoc.thema || fileName;
        const typ = safeDoc.typ || 'Prüfungsstoff';
        const shortHash = safeDoc.fileHash ? safeDoc.fileHash.substring(0, 6).toUpperCase() : 'LOCAL';
        const msgText = `📄 ${title} [${typ}]\nKlasse: ${safeDoc.klassen} | Jahr: ${safeDoc.jahr} | SHA: #${shortHash}\nBereitgestellt über Lehrer-Portfolio.`;

        let fileObj = null;
        if (safeDoc.fileData) {
            try {
                const u8 = dataUrlToUint8Array(safeDoc.fileData);
                const mime = (safeDoc.fileData.split(',')[0].match(/:(.*?);/) || [])[1] || 'application/pdf';
                fileObj = new File([u8], fileName, { type: mime });
            } catch (e) {}
        }

        if (platform === 'whatsapp') {
            if (fileObj && navigator.canShare && navigator.canShare({ files: [fileObj] })) {
                try {
                    await navigator.share({ files: [fileObj], title, text: msgText });
                    return;
                } catch (e) { if (e && e.name === 'AbortError') return; }
            }
            window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(msgText), '_blank', 'noopener,noreferrer');
        } else if (platform === 'telegram') {
            if (fileObj && navigator.canShare && navigator.canShare({ files: [fileObj] })) {
                try {
                    await navigator.share({ files: [fileObj], title, text: msgText });
                    return;
                } catch (e) { if (e && e.name === 'AbortError') return; }
            }
            window.open('https://t.me/share/url?url=' + encodeURIComponent(window.location.href) + '&text=' + encodeURIComponent(msgText), '_blank', 'noopener,noreferrer');
        } else if (platform === 'email') {
            if (fileObj && navigator.canShare && navigator.canShare({ files: [fileObj] })) {
                try {
                    await navigator.share({ files: [fileObj], title, text: msgText });
                    return;
                } catch (e) { if (e && e.name === 'AbortError') return; }
            }
            window.location.href = 'mailto:?subject=' + encodeURIComponent('Lehrer-Portfolio Dokument: ' + title) + '&body=' + encodeURIComponent(msgText);
        } else if (platform === 'direct' || platform === 'bluetooth') {
            if (fileObj && navigator.canShare && navigator.canShare({ files: [fileObj] })) {
                try {
                    await navigator.share({ files: [fileObj], title, text: msgText });
                } catch (e) { if (e && e.name !== 'AbortError') alert('Teilen fehlgeschlagen: ' + e.message); }
            } else if (navigator.share) {
                try {
                    await navigator.share({ title, text: msgText });
                } catch (e) { if (e && e.name !== 'AbortError') alert('Teilen fehlgeschlagen: ' + e.message); }
            } else {
                exportSinglePackage(safeDoc);
            }
        } else if (platform === 'package') {
            exportSinglePackage(safeDoc);
        }
    }

    function init(config) {
        const cfg = config || {};
        if (typeof cfg.onUpdated === 'function') {
            syncCallbacks.add(cfg.onUpdated);
        }

        if (!listenersAttached) {
            listenersAttached = true;
            if ('BroadcastChannel' in window) {
                try {
                    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
                    broadcastChannel.onmessage = (ev) => {
                        if (ev && ev.data && ev.data.type === 'DEUTSCHTHEK_SYNCED') {
                            syncCallbacks.forEach(cb => {
                                try { cb(ev.data.payload || {}); } catch (_e) {}
                            });
                        }
                    };
                } catch (e) {}
            }

            window.addEventListener('online', () => {
                syncNow({ force: false, silent: true }).catch(() => {});
            });

            if (!periodicTimer) {
                periodicTimer = setInterval(() => {
                    if (document.visibilityState === 'visible' && navigator.onLine !== false) {
                        syncNow({ force: false, silent: true }).catch(() => {});
                    }
                }, cfg.periodicMs || PERIODIC_SYNC_MS);
            }
        }

        if (cfg.autoSync !== false) {
            setTimeout(() => {
                syncNow({ force: false, silent: true }).catch(() => {});
            }, 350);
        }
    }

    const syncApi = Object.freeze({
        init,
        syncNow,
        fetchCatalog,
        shareSocial,
        exportSinglePackage,
        showToast,
        DEFAULT_CATALOG_URLS
    });

    try {
        Object.defineProperty(window, 'OsirisSecurity', {
            value: osirisSecurityApi,
            writable: false,
            configurable: false,
            enumerable: true
        });
        Object.defineProperty(window, 'DeutschThekSync', {
            value: syncApi,
            writable: false,
            configurable: false,
            enumerable: true
        });
    } catch (e) {
        window.OsirisSecurity = osirisSecurityApi;
        window.DeutschThekSync = syncApi;
    }

})(window);
