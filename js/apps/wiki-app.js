/**
 * js/apps/wiki-app.js
 * Offline Wiki Engine — Portfolio + DeutschThek Live Sync Integration
 * (Zero P2P / Zero Swarm)
 */

// --- IDB Storage Helpers (OsirisBigStorage + OfflineWikiIDB quota fallback) ---
const OSIRIS_DB_NAME = 'OsirisBigStorage';
function getOsirisDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(OSIRIS_DB_NAME, 1);
        req.onupgradeneeded = e => {
            if (!e.target.result.objectStoreNames.contains('store')) {
                e.target.result.createObjectStore('store');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function osirisIdbGet(key) {
    try {
        const dbase = await getOsirisDB();
        return await new Promise(resolve => {
            const req = dbase.transaction('store', 'readonly').objectStore('store').get(key);
            req.onsuccess = () => { try { dbase.close(); } catch (_e) {} resolve(req.result); };
            req.onerror = () => { try { dbase.close(); } catch (_e) {} resolve(null); };
        });
    } catch (e) { return null; }
}
async function osirisIdbSet(key, val) {
    try {
        const dbase = await getOsirisDB();
        return await new Promise(resolve => {
            const tx = dbase.transaction('store', 'readwrite');
            tx.objectStore('store').put(val, key);
            tx.oncomplete = () => { try { dbase.close(); } catch (_e) {} resolve(true); };
            tx.onerror = () => { try { dbase.close(); } catch (_e) {} resolve(false); };
        });
    } catch (e) { return false; }
}
async function osirisIdbDelete(key) {
    try {
        const dbase = await getOsirisDB();
        return await new Promise(resolve => {
            const tx = dbase.transaction('store', 'readwrite');
            tx.objectStore('store').delete(key);
            tx.oncomplete = () => { try { dbase.close(); } catch (_e) {} resolve(true); };
            tx.onerror = () => { try { dbase.close(); } catch (_e) {} resolve(false); };
        });
    } catch (e) { return false; }
}

let db = [];
let links = [];

function mergeWikiCollections(listA, listB) {
    const merged = [];
    const seen = new Set();
    [...(Array.isArray(listA) ? listA : []), ...(Array.isArray(listB) ? listB : [])].forEach(item => {
        if (!item || typeof item !== 'object') return;
        const key = item.id ? 'id:' + String(item.id) : 'title:' + String(item.title || item.thema || '').toLowerCase() + ':' + String(item.url || '');
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
        }
    });
    return merged;
}

async function persistWikiDb(list) {
    const payload = JSON.stringify(Array.isArray(list) ? list : []);
    let lsOk = false;
    try {
        localStorage.setItem('offline_wiki_db', payload);
        lsOk = true;
    } catch (_quotaErr) {}
    await osirisIdbSet('offline_wiki_db', payload);
    return lsOk;
}

async function loadMergedWikiDb() {
    let lsArr = [];
    try {
        const raw = localStorage.getItem('offline_wiki_db');
        if (raw) {
            const parsed = window.OsirisSecurity ? window.OsirisSecurity.safeJsonParse(raw) : JSON.parse(raw);
            if (Array.isArray(parsed)) lsArr = parsed;
        }
    } catch (e) {}

    let bigArr = [];
    try {
        const idbStr = await osirisIdbGet('offline_wiki_db');
        if (idbStr) {
            const parsed = window.OsirisSecurity ? window.OsirisSecurity.safeJsonParse(idbStr) : JSON.parse(idbStr);
            if (Array.isArray(parsed)) bigArr = parsed;
        }
    } catch (e) {}

    return mergeWikiCollections(lsArr, bigArr);
}

const svgImportBtn = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
const svgImportTitle = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
const svgSearch = `<svg width="30" height="30" style="margin-right: 8px;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 14.5L19 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const i18n = {
    FR: {
        importBtn: "IMPORTER TEXTE",
        syncBtn: "Sync DeutschThek",
        themeBtn: "Thème",
        linksBtn: "LIENS UTILES",
        importTitle: `${svgImportTitle} Importer &amp; Indexer`,
        textLabel: "Contenu du texte",
        sourceLabel: "Lien source (URL)",
        saveBtn: "Enregistrer",
        searchTitle: `${svgSearch}Recherche Wiki`,
        searchPlac: "Rechercher des mots-clés...",
        textPlac: "Collez votre texte ici...",
        popTitle: "Ajouter lien",
        popBtn: "Ajouter",
        suggestions: "Suggestions :",
        copy: "📋 Copier",
        word: "📄 Word",
        namePlac: "Nom",
        exportJson: "Exporter DB (JSON)",
        importJson: "Importer DB (JSON)",
        resetDb: "Réinitialiser DB",
        deleteMode: "Activer la suppression du texte",
        emptyTicker: "Ajoutez vos liens favoris pour les voir défiler ici !"
    },
    DE: {
        importBtn: "TEXT IMPORTIEREN",
        syncBtn: "DeutschThek Sync",
        themeBtn: "Design",
        linksBtn: "NÜTZLICHE LINKS",
        importTitle: `${svgImportTitle} Dokument importieren &amp; indexieren`,
        textLabel: "Textinhalt",
        sourceLabel: "Quell-Link (URL)",
        saveBtn: "Speichern",
        searchTitle: `${svgSearch}Wiki-Suche`,
        searchPlac: "Suchen...",
        textPlac: "Fügen Sie Ihren Text hier ein...",
        popTitle: "Link hinzufügen",
        popBtn: "Hinzufügen",
        suggestions: "Vorschläge:",
        copy: "📋 Kopieren",
        word: "📄 Word",
        namePlac: "Name",
        exportJson: "Datenbank Exportieren (DB)",
        importJson: "Datenbank Importieren (DB)",
        resetDb: "Datenbank zurücksetzen (DB)",
        deleteMode: "Textlöschung aktivieren",
        emptyTicker: "Fügen Sie Ihre Lieblingslinks hinzu, um sie hier durchlaufen zu sehen!"
    }
};

const lengthMap = {
    FR: { Short: "Court", Medium: "Moyen", Long: "Long" },
    DE: { Short: "Kurz", Medium: "Mittel", Long: "Lang" }
};

function escapeWikiHtml(val) {
    if (window.OsirisSecurity && typeof window.OsirisSecurity.escapeHtml === 'function') {
        return window.OsirisSecurity.escapeHtml(val);
    }
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}

function highlightSafeHtml(rawText, query) {
    const safeFull = escapeWikiHtml(rawText || '');
    if (!query || !query.trim()) return safeFull;
    const escapedQuery = escapeWikiHtml(query.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escapedQuery) return safeFull;
    try {
        return safeFull.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark>$1</mark>');
    } catch (e) {
        return safeFull;
    }
}

function safeWikiUrl(rawUrl) {
    if (window.OsirisSecurity && typeof window.OsirisSecurity.sanitizeUrl === 'function') {
        const sanitized = window.OsirisSecurity.sanitizeUrl(rawUrl);
        if (sanitized !== '#') return sanitized;
    }
    if (!rawUrl || typeof rawUrl !== 'string') return '#';
    const trimmed = rawUrl.replace(/[\x00-\x20]/g, '').trim();
    if (window.location.protocol !== 'file:' && /^file:/i.test(trimmed)) return '#';
    if (/^(https?:\/\/|\/|#|mailto:)/i.test(trimmed)) {
        return trimmed.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
    }
    return 'https://' + trimmed.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
}

// ── Language toggle (FR / DE, synced with osiris_hub_prefs) ──────────
const wikiLangs = ['FR', 'DE'];
const langs = wikiLangs;
function readInitialLang() {
    try {
        const prefs = JSON.parse(localStorage.getItem('osiris_hub_prefs') || '{}');
        if (prefs.lang === 'DE') return 1;
        if (prefs.lang === 'FR') return 0;
    } catch (e) {}
    const saved = localStorage.getItem('wiki_lang_idx');
    if (saved !== null) {
        return parseInt(saved, 10) === 1 ? 1 : 0;
    }
    return 0;
}
let lIdx = readInitialLang();

function applyI18n() {
    const lang = langs[lIdx] || 'FR';
    const data = i18n[lang] || i18n.FR;

    const lbl = document.getElementById('langBtnLabel');
    if (lbl) lbl.textContent = lang;
    const impLbl = document.getElementById('importBtnLabel');
    if (impLbl) impLbl.textContent = data.importBtn;
    const syncLbl = document.getElementById('syncBtnLabel');
    if (syncLbl) syncLbl.textContent = data.syncBtn;
    const tbl = document.getElementById('themeBtnLabel');
    if (tbl) tbl.textContent = data.themeBtn;
    const lblLinks = document.getElementById('linksBtnLabel');
    if (lblLinks) lblLinks.textContent = data.linksBtn;

    const importSub = document.getElementById('import-submenu');
    if (importSub) {
        const h2 = importSub.querySelector('h2');
        if (h2) h2.innerHTML = data.importTitle;
        const labels = importSub.querySelectorAll('label');
        if (labels[0]) labels[0].innerText = data.textLabel;
        if (labels[1]) labels[1].innerText = data.sourceLabel;
    }
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.innerText = data.saveBtn;
    const delLbl = document.getElementById('delete-mode-label');
    if (delLbl) delLbl.innerText = data.deleteMode;

    const impText = document.getElementById('import-text');
    if (impText) impText.placeholder = data.textPlac;
    const searchIn = document.getElementById('search-input');
    if (searchIn) searchIn.placeholder = data.searchPlac;
    const searchTitle = document.getElementById('search-title');
    if (searchTitle) searchTitle.innerHTML = data.searchTitle;

    const popTitle = document.getElementById('pop-title');
    if (popTitle) popTitle.innerText = data.popTitle;
    const linkName = document.getElementById('link-name');
    if (linkName) linkName.placeholder = data.namePlac;
    const popBtn = document.getElementById('pop-btn');
    if (popBtn) popBtn.innerText = data.popBtn;

    const bExp = document.getElementById('btn-export-json');
    if (bExp && bExp.querySelector('span')) bExp.querySelector('span').innerText = data.exportJson;
    const bImp = document.getElementById('btn-import-json');
    if (bImp && bImp.querySelector('span')) bImp.querySelector('span').innerText = data.importJson;
    const bRes = document.getElementById('btn-reset-db');
    if (bRes && bRes.querySelector('span')) bRes.querySelector('span').innerText = data.resetDb;

    renderResults();
    updateTicker();
}

window.setWikiLang = function (newLang) {
    const idx = langs.indexOf(String(newLang || '').toUpperCase());
    if (idx !== -1) {
        lIdx = idx;
        localStorage.setItem('wiki_lang_idx', String(lIdx));
        applyI18n();
    }
};

// ── Font pool ───────────────────────────────────────────
const FONT_POOL = [
    "'Brush Script MT', cursive",
    "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    "Georgia, 'Times New Roman', serif",
    "'Courier New', Courier, monospace",
    "'Trebuchet MS', Verdana, sans-serif",
    "'Arial Narrow', Arial, sans-serif",
    "'Palatino Linotype', 'Book Antiqua', Palatino, serif"
];
const FONT_TITLE = { FR: 'Changer la police (aléatoire)', DE: 'Schriftart wechseln (zufällig)' };

function randomFont() {
    const current = getComputedStyle(document.documentElement).getPropertyValue('--wiki-font-family').trim();
    const pool = FONT_POOL.filter(f => f !== current);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    document.documentElement.style.setProperty('--wiki-font-family', pick);
    try {
        const prefs = JSON.parse(localStorage.getItem('osiris_hub_prefs') || '{}');
        prefs.font = pick;
        localStorage.setItem('osiris_hub_prefs', JSON.stringify(prefs));
    } catch (e) {}
    const fb = document.getElementById('fontBtn');
    if (fb) fb.title = FONT_TITLE[langs[lIdx]] || FONT_TITLE.FR;
}

function toggleLang() {
    lIdx = (lIdx + 1) % langs.length;
    const lang = langs[lIdx];
    localStorage.setItem('wiki_lang_idx', String(lIdx));
    try {
        const prefs = JSON.parse(localStorage.getItem('osiris_hub_prefs') || '{}');
        prefs.lang = lang;
        localStorage.setItem('osiris_hub_prefs', JSON.stringify(prefs));
    } catch (e) {}
    applyI18n();
}

function toggleImport(e) {
    if (e) e.stopPropagation();
    const el = document.getElementById('import-submenu');
    if (el) el.classList.toggle('open');
}

function toggleLinksPop(e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById('links-pop');
    if (!pop) return;
    pop.style.display = (pop.style.display === 'block') ? 'none' : 'block';
    renderLinksList();
}

async function syncDeutschThekWiki(e) {
    if (e) e.stopPropagation();
    const btn = document.getElementById('sync-dt-btn');
    if (btn) btn.classList.add('is-syncing');
    try {
        if (window.DeutschThekSync && typeof window.DeutschThekSync.syncNow === 'function') {
            await window.DeutschThekSync.syncNow({ force: true, silent: false });
            await window.reloadWikiData();
        }
    } finally {
        if (btn) btn.classList.remove('is-syncing');
    }
}

function addLink() {
    const nameEl = document.getElementById('link-name');
    const urlEl = document.getElementById('link-url');
    const name = nameEl ? nameEl.value.trim() : '';
    const url = urlEl ? urlEl.value.trim() : '';
    if (!name || !url) { alert("Nom et URL requis."); return; }
    const safeUrl = safeWikiUrl(url);
    if (safeUrl === '#') { alert("URL invalide."); return; }
    links.push({ name: name.substring(0, 100), url: safeUrl });
    localStorage.setItem('wiki_links', JSON.stringify(links));
    if (nameEl) nameEl.value = '';
    if (urlEl) urlEl.value = '';
    renderLinksList();
}

function removeLink(idx) {
    links.splice(Number(idx), 1);
    localStorage.setItem('wiki_links', JSON.stringify(links));
    renderLinksList();
}

function renderLinksList() {
    const list = document.getElementById('pop-links-list');
    if (!list) return;
    list.innerHTML = '';
    links.forEach((l, idx) => {
        if (!l) return;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;';
        div.innerHTML = `
            <a href="${safeWikiUrl(l.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--text); text-decoration:none; font-weight:bold; max-width:85%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeWikiHtml(l.name)}</a>
            <span onclick="removeLink(${Number(idx)})" style="cursor:pointer; color:red; font-weight:bold;">✖</span>
        `;
        list.appendChild(div);
    });
    updateTicker();
}

function updateTicker() {
    const ticker = document.getElementById('footer-ticker');
    if (!ticker) return;
    ticker.innerHTML = '';

    let adminLinks = [];
    try { adminLinks = JSON.parse(localStorage.getItem('admin_suggested_links') || '[]'); } catch (e) {}
    if ((!Array.isArray(adminLinks) || adminLinks.length === 0) &&
        window.OFFICIAL_CATALOG_DATA && Array.isArray(window.OFFICIAL_CATALOG_DATA.suggestedLinks)) {
        adminLinks = window.OFFICIAL_CATALOG_DATA.suggestedLinks;
    }

    const combined = Array.isArray(links) ? [...links] : [];
    const seenUrls = new Set(combined.map(l => (l && l.url ? String(l.url).trim().toLowerCase() : '')));
    if (Array.isArray(adminLinks)) {
        adminLinks.forEach(al => {
            if (al && al.url) {
                const u = String(al.url).trim().toLowerCase();
                if (!seenUrls.has(u)) {
                    combined.push({ name: al.name, url: al.url, category: al.category, isSuggested: true });
                    seenUrls.add(u);
                }
            }
        });
    }

    const activeLang = langs[lIdx] || 'FR';
    if (combined.length === 0) {
        const msg = (i18n[activeLang] || i18n.FR).emptyTicker;
        ticker.innerHTML = `<span>${escapeWikiHtml(msg)}</span>`;
        return;
    }

    const pool = [...combined, ...combined, ...combined];
    pool.forEach(l => {
        if (!l || !l.url) return;
        const span = document.createElement('span');
        span.style.margin = '0 22px';
        const safeHref = safeWikiUrl(l.url);
        const safeName = escapeWikiHtml(l.name);
        const catBadge = l.category ? `<span style="font-size:0.7em; background:rgba(37,99,235,0.12); color:#2563eb; padding:1px 5px; border-radius:3px; margin-right:5px; font-weight:700;">${escapeWikiHtml(l.category)}</span>` : '';
        span.innerHTML = `${catBadge}<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:none; font-weight:bold;">${safeName} ↗</a>`;
        ticker.appendChild(span);
    });
}

function autoDetect(text) {
    const wordCount = text.trim().split(/\s+/).length;
    let length = "Short";
    if (wordCount > 500) length = "Long";
    else if (wordCount > 150) length = "Medium";

    const lower = text.toLowerCase();
    let lang = "de";
    if (/\b(le|la|les|est|dans)\b/.test(lower)) lang = "fr";
    else if (/\b(der|die|das|und|ist)\b/.test(lower)) lang = "de";
    else if (/\b(el|la|los|es|en)\b/.test(lower)) lang = "sp";
    else if (/\b(the|is|are|and|in)\b/.test(lower)) lang = "en";

    return { length, lang };
}

function extractSourceFromText(text) {
    if (!text) return null;
    const citationMatch = text.match(/(?:^|\n)\s*[—–\-]\s*(.+?)(?:\r?\n|$)/);
    if (citationMatch && citationMatch[1]) return citationMatch[1].trim();
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) return urlMatch[0];
    const srcMatch = text.match(/(?:Source|Quelle|Lien|Citation)\s*:\s*(.+?)(?:\r?\n|$)/i);
    if (srcMatch && srcMatch[1]) return srcMatch[1].trim();
    return null;
}

async function saveEntry() {
    let url = document.getElementById('import-url').value.trim();
    const text = document.getElementById('import-text').value.trim();
    if (!text) { alert("Contenu du texte requis / Textinhalt erforderlich."); return; }
    if (!url) url = extractSourceFromText(text) || 'https://deutschthek.local/wiki';

    const meta = autoDetect(text);
    const words = text.toLowerCase().match(/\b([a-zA-ZäöüÄÖÜßàéèêëîïôùûç]{6,})\b/g) || [];
    const uniqueKws = [...new Set(words)].slice(0, 5);

    const entry = {
        id: Date.now(),
        url: safeWikiUrl(url),
        text,
        lang: meta.lang,
        length: meta.length,
        keywords: uniqueKws,
        date: new Date().toLocaleDateString()
    };

    try {
        db.unshift(entry);
        const lsOk = await persistWikiDb(db);
        if (!lsOk) saveToIndexedDB(entry);

        document.getElementById('import-url').value = '';
        document.getElementById('import-text').value = '';
        document.getElementById('import-submenu').classList.remove('open');
        renderResults();
    } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
            saveToIndexedDB(entry);
        } else {
            alert("Erreur d'enregistrement.");
        }
    }
}

// --- OfflineWikiIDB fallback ---
let idb;
const request = indexedDB.open("OfflineWikiIDB", 1);
request.onupgradeneeded = (e) => {
    idb = e.target.result;
    if (!idb.objectStoreNames.contains("entries")) {
        idb.createObjectStore("entries", { keyPath: "id" });
    }
};
request.onsuccess = (e) => { idb = e.target.result; };
request.onerror = (e) => { console.error("OfflineWikiIDB error:", e); };

function saveToIndexedDB(entry) {
    const progressContainer = document.getElementById('idb-progress-container');
    const progressBar = document.getElementById('idb-progress-bar');
    const statusText = document.getElementById('idb-status-text');
    if (!idb) return;
    try {
        const tx = idb.transaction(["entries"], "readwrite");
        tx.objectStore("entries").put(entry);
        tx.oncomplete = () => {
            document.getElementById('import-submenu').classList.remove('open');
            renderResults();
            resetProgressBar(progressContainer, progressBar, statusText);
        };
        tx.onerror = () => resetProgressBar(progressContainer, progressBar, statusText);
    } catch (e) {
        resetProgressBar(progressContainer, progressBar, statusText);
    }
}

function resetProgressBar(container, bar, text) {
    setTimeout(() => {
        if (container) container.style.display = 'none';
        if (text) text.style.display = 'none';
        if (bar) bar.style.width = '0%';
    }, 500);
}

async function deleteEntry(id, event) {
    if (event) event.stopPropagation();
    if (confirm("Confirmer la suppression / Löschung bestätigen ?")) {
        db = db.filter(i => String(i.id) !== String(id));
        await persistWikiDb(db);
        renderResults();
    }
}

function toggleExportMenu(e, id) {
    if (e) e.stopPropagation();
    document.querySelectorAll('.export-menu').forEach(m => {
        if (m.id !== 'export-menu-' + id) m.style.display = 'none';
    });
    const menu = document.getElementById('export-menu-' + id);
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function renderResults() {
    const searchEl = document.getElementById('search-input');
    const query = searchEl ? searchEl.value.toLowerCase().trim() : '';
    const container = document.getElementById('results-container');
    const kwContainer = document.getElementById('recent-keywords');
    if (!container || !kwContainer) return;

    const activeLang = langs[lIdx] || 'FR';
    const delCb = document.getElementById('delete-mode-cb');
    const deleteMode = delCb ? delCb.checked : false;
    container.innerHTML = '';

    const allKws = db.flatMap(i => (i && Array.isArray(i.keywords)) ? i.keywords : []);
    const uniqueRecent = [...new Set(allKws.filter(Boolean))].slice(0, 8);
    kwContainer.innerHTML = uniqueRecent.length ? `<span>${(i18n[activeLang] || i18n.FR).suggestions}</span>` : '';
    uniqueRecent.forEach(kw => {
        const span = document.createElement('span');
        span.className = 'kw-sugg';
        span.textContent = kw;
        span.onclick = () => { if (searchEl) searchEl.value = kw; renderResults(); };
        kwContainer.appendChild(span);
    });

    const filtered = db.filter(item => {
        if (!item) return false;
        const txt = String(item.text || '').toLowerCase();
        const title = String(item.title || item.thema || '').toLowerCase();
        const kws = Array.isArray(item.keywords) ? item.keywords : [];
        if (!query) return true;
        return txt.includes(query) || title.includes(query) || kws.some(k => String(k || '').toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div style="padding:20px; color:gray;">${activeLang === 'DE' ? 'Keine Texte gefunden.' : 'Aucun texte trouvé.'}</div>`;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'result-card';

        const rawText = String(item.text || '');
        const rawPreview = rawText.length > 200 ? (rawText.substring(0, 200) + '...') : rawText;
        const highlighted = highlightSafeHtml(rawText, query).replace(/\n/g, '<br>');
        const preview = highlightSafeHtml(rawPreview, query);

        const itemLang = String(item.lang || 'de').toUpperCase();
        const itemLenKey = item.length || 'Medium';
        const translatedLength = (lengthMap[activeLang] && lengthMap[activeLang][itemLenKey]) || itemLenKey;
        const safeIdAttr = escapeWikiHtml(String(item.id || ''));
        const safeDate = escapeWikiHtml(item.date || '');
        const safeUrlHref = safeWikiUrl(item.url || item.sourceLink || '#');
        const safeUrlText = escapeWikiHtml(item.url || item.sourceLink || '');
        const safeTitle = (item.title || item.thema)
            ? `<h3 style="margin:0 0 6px 0; color:var(--primary);">${escapeWikiHtml(item.title || item.thema)}</h3>`
            : '';
        const officialBadge = (item.isOfficial || item.isDeutschThekSync)
            ? `<span style="background:rgba(37,99,235,0.12); color:#2563eb; border:1px solid rgba(37,99,235,0.3); padding:1px 6px; border-radius:4px; font-size:0.72rem; font-weight:700; margin-right:6px;">DeutschThek</span>`
            : '';
        const kws = Array.isArray(item.keywords) ? item.keywords : [];
        const deleteBtnHtml = deleteMode
            ? `<span onclick="deleteEntry('${safeIdAttr}', event)" style="position:absolute; top:15px; right:15px; color:#dc3545; font-weight:bold; cursor:pointer; font-size:1.2rem; z-index:5;">✖</span>`
            : '';

        card.innerHTML = `
            ${deleteBtnHtml}
            ${safeTitle}
            <div class="result-meta">
                ${officialBadge}<strong>[${escapeWikiHtml(itemLang)} - ${escapeWikiHtml(translatedLength)}]</strong> | ${safeDate} | 🔗 <a href="${safeUrlHref}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${safeUrlText}</a>
            </div>
            <div class="pill-container">${kws.map(k => `<span class="pill">${escapeWikiHtml(k)}</span>`).join('')}</div>
            <div class="result-preview">${preview}</div>
            <div class="expanded-content">
                <div>${highlighted}</div>
                <div class="floating-options" onclick="event.stopPropagation()">
                    <button class="action-btn" onclick="copyText('${safeIdAttr}')">${(i18n[activeLang] || i18n.FR).copy}</button>
                    <div style="position:relative; display:inline-block;">
                        <button class="word-btn" onclick="toggleExportMenu(event, '${safeIdAttr}')">${(i18n[activeLang] || i18n.FR).word} ▾</button>
                        <div id="export-menu-${safeIdAttr}" class="export-menu">
                            <div onclick="exportDoc('${safeIdAttr}', 'doc', event)">.doc</div>
                            <div onclick="exportDoc('${safeIdAttr}', 'docx', event)">.docx</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        card.onclick = () => {
            const wasExpanded = card.classList.contains('expanded');
            document.querySelectorAll('.result-card').forEach(c => c.classList.remove('expanded'));
            if (!wasExpanded) card.classList.add('expanded');
        };
        container.appendChild(card);
    });
}

function copyText(id) {
    const item = db.find(i => i && String(i.id) === String(id));
    if (!item) return;
    navigator.clipboard.writeText(`${item.text || ''}\n\nSource: ${item.url || ''}`).then(() => alert("Copié / Kopiert!"));
}

function escapeXmlWiki(str) {
    return String(str || '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function buildWikiOpenXmlDocx(item) {
    const zip = new window.JSZip();
    const title = item.title || item.thema || 'Wiki Export';
    const url = item.url || item.sourceLink || '';
    const paragraphs = String(item.text || '').split(/\r?\n/);

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    let bodyXml = `<w:p><w:r><w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${escapeXmlWiki(title)}</w:t></w:r></w:p>`;
    for (const p of paragraphs) {
        bodyXml += `<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXmlWiki(p)}</w:t></w:r></w:p>`;
    }
    if (url) {
        bodyXml += `<w:p><w:r><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">Quelle / Source: ${escapeXmlWiki(url)}</w:t></w:r></w:p>`;
    }

    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>
</w:document>`);

    return await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE'
    });
}

async function exportDoc(id, format, event) {
    if (event) event.stopPropagation();
    const menuEl = document.getElementById('export-menu-' + id);
    if (menuEl) menuEl.style.display = 'none';

    const item = db.find(i => i && String(i.id) === String(id));
    if (!item) return;

    const rawTitle = String(item.title || item.thema || item.text || 'wiki_export');
    const shortName = rawTitle.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'wiki_export';
    const fileName = `${shortName}.${format}`;

    const safeTitle = escapeWikiHtml(item.title || item.thema || 'Wiki Export');
    const safeBody = escapeWikiHtml(item.text || '').replace(/\n/g, '<br>');
    const safeHref = safeWikiUrl(item.url || '');
    const safeUrlText = escapeWikiHtml(item.url || '');

    const header = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Wiki Export</title></head><body>";
    const content = `<h2>${safeTitle}</h2><p>${safeBody}</p><br><p>Source: <a href="${safeHref}">${safeUrlText}</a></p></body></html>`;
    const fullHtml = header + content;

    let blob = null;
    if (format === 'doc') {
        blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
    } else if (format === 'docx') {
        if (typeof window.JSZip !== 'undefined') {
            blob = await buildWikiOpenXmlDocx(item);
        } else if (typeof htmlDocx !== 'undefined') {
            blob = htmlDocx.asBlob(fullHtml);
        } else {
            alert("Erreur: librairie de conversion Word indisponible.");
            return;
        }
    }

    if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.style.display = "none";
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { if (link.parentNode) link.parentNode.removeChild(link); }, 500);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
}

const _tt = document.getElementById('theme-toggle');
if (_tt) _tt.onclick = () => {
    const themes = ['light', 'dark', 'osiris', 'snow', 'grass', 'ocean'];
    const current = document.documentElement.getAttribute('data-theme');
    const nextTheme = themes[(themes.indexOf(current) + 1) % themes.length];
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('wiki_theme', nextTheme);
    try {
        const prefs = JSON.parse(localStorage.getItem('osiris_hub_prefs') || '{}');
        prefs.theme = nextTheme;
        localStorage.setItem('osiris_hub_prefs', JSON.stringify(prefs));
    } catch (_e) {}
    const targetOrigin = (window.OsirisSecurity && window.OsirisSecurity.getTargetOrigin) ? window.OsirisSecurity.getTargetOrigin() : '*';
    try { window.parent.postMessage({ type: 'THEME_CHANGED', theme: nextTheme }, targetOrigin); } catch (e) {}
};

document.addEventListener('click', function (event) {
    const linksPop = document.getElementById('links-pop');
    const linksBtn = document.getElementById('links-toggle-btn');
    if (linksPop && linksPop.style.display === 'block' && !linksPop.contains(event.target) && linksBtn && !linksBtn.contains(event.target)) {
        linksPop.style.display = 'none';
    }

    const importMenu = document.getElementById('import-submenu');
    const importBtn = document.getElementById('import-toggle-btn');
    if (importMenu && importMenu.classList.contains('open') && !importMenu.contains(event.target) && importBtn && !importBtn.contains(event.target)) {
        importMenu.classList.remove('open');
    }

    document.querySelectorAll('.export-menu').forEach(m => { m.style.display = 'none'; });
});

function exportDB() {
    if (db.length === 0) { alert("Database is empty!"); return; }
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "offline_wiki_db.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function importDB(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const parsed = window.OsirisSecurity ? window.OsirisSecurity.safeJsonParse(e.target.result) : JSON.parse(e.target.result);
            let importedData = [];
            if (Array.isArray(parsed)) importedData = parsed;
            else if (parsed && parsed.databases && Array.isArray(parsed.databases.OW)) importedData = parsed.databases.OW;

            if (Array.isArray(importedData) && importedData.length > 0) {
                const existingIds = new Set(db.map(i => String(i.id)));
                const sanitized = importedData
                    .map(i => window.OsirisSecurity ? window.OsirisSecurity.sanitizeWikiEntry(i) : i)
                    .filter(i => i && !existingIds.has(String(i.id)));
                db = [...sanitized, ...db];
                await persistWikiDb(db);
                renderResults();
                alert("Database imported successfully!");
            } else {
                alert("Invalid database format.");
            }
        } catch (err) {
            alert("Error reading file. Make sure it's a valid JSON database.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function resetDB() {
    if (confirm("Are you sure you want to clear the entire text database?")) {
        if (confirm("DOUBLE CONFIRMATION: This action is irreversible! Proceed?")) {
            db = [];
            try { localStorage.removeItem('offline_wiki_db'); } catch (e) {}
            await osirisIdbDelete('offline_wiki_db');
            renderResults();
            alert("Database has been reset.");
        }
    }
}

const importTextEl = document.getElementById('import-text');
const importUrlEl = document.getElementById('import-url');

function checkAutofillUrl() {
    if (!importTextEl || !importUrlEl) return;
    const text = importTextEl.value;
    const extracted = extractSourceFromText(text);
    if (extracted && (!importUrlEl.value.trim() || importUrlEl.dataset.autofilled === 'true')) {
        importUrlEl.value = extracted;
        importUrlEl.dataset.autofilled = 'true';
    }
}

if (importTextEl) {
    importTextEl.addEventListener('input', checkAutofillUrl);
    importTextEl.addEventListener('paste', () => setTimeout(checkAutofillUrl, 50));
}
if (importUrlEl) {
    importUrlEl.addEventListener('input', () => { delete importUrlEl.dataset.autofilled; });
}

window.reloadWikiData = async function () {
    try {
        db = await loadMergedWikiDb();
        links = JSON.parse(localStorage.getItem('wiki_links') || '[]') || [];
    } catch (e) {}
    renderResults();
    updateTicker();
    if (document.getElementById('links-pop') && document.getElementById('links-pop').style.display === 'block') {
        renderLinksList();
    }
};

(async function bootstrapWiki() {
    try {
        links = JSON.parse(localStorage.getItem('wiki_links') || '[]') || [];
        db = await loadMergedWikiDb();
    } catch (e) {}
    applyI18n();

    if (window.DeutschThekSync && typeof window.DeutschThekSync.init === 'function') {
        window.DeutschThekSync.init({
            autoSync: true,
            onUpdated: () => window.reloadWikiData()
        });
    }
})();
