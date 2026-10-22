/**
 * js/core/vault-crypto.js
 * Centralized, zero-dependency WebCrypto AES-GCM Vault subsystem.
 * Securely encrypts and persists API keys in IndexedDB + localStorage,
 * handles cross-window postMessage synchronization with Portfolio Safe,
 * and normalizes provider IDs across all apps and dictionaries.
 */

(function (global) {
    'use strict';

    const VAULT_SUPPORTED = !!(global.crypto && global.crypto.subtle && global.indexedDB);

    const VAULT_PROVIDER_ALIASES = {
        'pollinationsai': 'pollinations', 'pollinations': 'pollinations',
        'cerebras': 'cerebras',
        'groq': 'groq',
        'googlegemini': 'google', 'google': 'google', 'gemini': 'google',
        'nvidianim': 'nvidia', 'nvidia': 'nvidia',
        'githubmodels': 'github', 'github': 'github',
        'cloudflareworkersai': 'cloudflare', 'cloudflare': 'cloudflare',
        'openrouter': 'openrouter',
        'huggingface': 'huggingface', 'huggingfacecommunityfallback': 'huggingface'
    };

    function normalizeProviderName(name) {
        const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return VAULT_PROVIDER_ALIASES[key] || null;
    }

    function bufToB64(buf) {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function b64ToBuf(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    // --- Passphrase PBKDF2 Crypto (for Portfolio Safe) ---
    async function deriveVaultKey(passphrase, saltBytes) {
        const enc = new TextEncoder();
        const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' },
            baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
    }

    async function encryptVault(passphrase, data) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveVaultKey(passphrase, salt);
        const enc = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
        return { v: 1, salt: bufToB64(salt), iv: bufToB64(iv), ct: bufToB64(new Uint8Array(ciphertext)) };
    }

    async function decryptVault(passphrase, blob) {
        const key = await deriveVaultKey(passphrase, b64ToBuf(blob.salt));
        const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(blob.iv) }, key, b64ToBuf(blob.ct));
        return JSON.parse(new TextDecoder().decode(plainBuf));
    }

    // --- IndexedDB Key Store (for Dictionary Apps) ---
    function openVaultDb(dbName, storeName) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(storeName)) {
                    req.result.createObjectStore(storeName);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getVaultKey(dbName, storeName, keyId) {
        const db = await openVaultDb(dbName, storeName);
        const existing = await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(keyId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        if (existing) return existing;
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(key, keyId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        return key;
    }

    class VaultClient {
        constructor(options) {
            this.dbName = options.dbName;
            this.storeName = options.storeName || 'keys';
            this.keyId = options.keyId || 'vaultKey';
            this.storageKey = options.storageKey;
            this.onKeysUpdated = options.onKeysUpdated || null;
            this.onRestore = options.onRestore || null;
            this.persisted = false;

            if (options.listen !== false) {
                this.attachMessageListener();
            }
        }

        async saveKeys(apiKeys) {
            if (!VAULT_SUPPORTED) { this.persisted = false; return false; }
            try {
                const key = await getVaultKey(this.dbName, this.storeName, this.keyId);
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const payload = JSON.stringify({ apiKeys: apiKeys || {} });
                const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload));
                localStorage.setItem(this.storageKey, JSON.stringify({ iv: bufToB64(iv), data: bufToB64(cipher) }));
                this.persisted = true;
                return true;
            } catch (err) {
                console.warn('API-Schlüssel-Tresor konnte nicht gespeichert werden:', err);
                this.persisted = false;
                return false;
            }
        }

        async loadKeys() {
            if (!VAULT_SUPPORTED) return null;
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return null;
            try {
                const { iv, data } = JSON.parse(raw);
                const key = await getVaultKey(this.dbName, this.storeName, this.keyId);
                const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(iv) }, key, b64ToBuf(data));
                const parsed = JSON.parse(new TextDecoder().decode(plainBuf));
                this.persisted = true;
                return (parsed && typeof parsed.apiKeys === 'object') ? parsed.apiKeys : {};
            } catch (err) {
                console.warn('API-Schlüssel-Tresor beschädigt – wird zurückgesetzt.', err);
                localStorage.removeItem(this.storageKey);
                this.persisted = false;
                return null;
            }
        }

        async migrateLegacy(vaultWasLoaded, apiKeys, onSaveMenu) {
            if (!VAULT_SUPPORTED || vaultWasLoaded) return;
            const hasLegacyKeys = apiKeys && Object.keys(apiKeys).length > 0;
            if (hasLegacyKeys) await this.saveKeys(apiKeys);
            if (typeof onSaveMenu === 'function') onSaveMenu();
        }

        attachMessageListener() {
            window.addEventListener('message', (e) => {
                if (!e.data || !e.data.type) return;
                if (e.origin !== window.location.origin) {
                    console.warn('[Security] Ignored postMessage from unexpected origin:', e.origin);
                    return;
                }
                if (e.data.type === 'osirisVaultRequestExport') {
                    let blob = null;
                    try {
                        const raw = localStorage.getItem(this.storageKey);
                        blob = raw ? JSON.parse(raw) : null;
                    } catch (err) { blob = null; }
                    if (e.source) e.source.postMessage({ type: 'osirisVaultExportData', blob }, e.origin || '*');
                } else if (e.data.type === 'osirisVaultRestoreBlob' && e.data.blob) {
                    try {
                        localStorage.setItem(this.storageKey, JSON.stringify(e.data.blob));
                        this.loadKeys().then((keys) => {
                            if (typeof this.onRestore === 'function') this.onRestore(keys);
                        });
                    } catch (err) { /* Storage unavailable */ }
                } else if (e.data.type === 'osirisVaultKeys' && Array.isArray(e.data.keys)) {
                    const newKeys = {};
                    let applied = 0;
                    e.data.keys.forEach(k => {
                        const providerId = normalizeProviderName(k && k.provider);
                        const value = k && typeof k.key === 'string' ? k.key.trim() : '';
                        if (providerId && value) {
                            newKeys[providerId] = value;
                            applied++;
                        }
                    });
                    if (applied > 0) {
                        if (typeof this.onKeysUpdated === 'function') {
                            this.onKeysUpdated(newKeys);
                        }
                    }
                    if (e.source) e.source.postMessage({ type: 'osirisVaultKeysApplied', count: applied }, e.origin || '*');
                }
            });
        }
    }

    const VaultCrypto = {
        isSupported: () => VAULT_SUPPORTED,
        normalizeProviderName,
        bufToB64,
        b64ToBuf,
        deriveVaultKey,
        encryptVault,
        decryptVault,
        openVaultDb,
        getVaultKey,
        createClient: (options) => new VaultClient(options)
    };

    global.VaultCrypto = VaultCrypto;
    global.normalizeVaultProviderName = normalizeProviderName;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = VaultCrypto;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
