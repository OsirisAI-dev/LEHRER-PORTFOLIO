/* ============================================================
   osiris-sync.js
   Module de Synchronisation Multi-Appareils et Sauvegarde Sécurisée
   pour le Portfolio Enseignant (Osiris Inc.).

   Fonctionnalités :
   - Option A : Synchronisation hybride par QR Code (WebRTC P2P direct
     + Relais éphémère zero-knowledge avec clé en URL Hash, sans compte).
   - Option D : Export / Import de sauvegarde complète unifiée (.osiris)
     chiffrée en AES-256-GCM (mot de passe Coffre-fort ou PIN) avec support
     du partage natif (AirDrop / QuickShare / Nearby Share).
   - OsirisSyncUI : Interface utilisateur modale autonome, responsive
     et bilingue (FR / DE) auto-injectable sur n'importe quelle page.
   ============================================================ */

(function (global) {
    "use strict";

    var MAGIC_UNIFIED = "OSIRIS_UNIFIED_SYNC_V1";
    var MAGIC_ENCRYPTED = "OSIRIS_ENCRYPTED_BACKUP_V1";
    var MAGIC_EPHEMERAL = "OSIRIS_EPHEMERAL_V1";
    var RELAY_POST_URL = "https://bytebin.lucko.me/post";
    var RELAY_GET_BASE = "https://bytebin.lucko.me/";

    // Liste exhaustive des clés d'état de l'application
    var SYNC_KEYS = {
        dashboard: "osirisTeacherDashboardState_v1",
        portfolioOwner: "osirisPortfolioOwnerName",
        portfolioHue: "osirisPortfolioHue",
        portfolioDark: "osirisPortfolioDark",
        portfolioMetal: "osirisPortfolioMetal",
        portfolioPersonalize: "portfolioPersonalize",
        portfolioTabs: "portfolioTabsState",
        portfolioLinks: "portfolioUserLinks",
        vaultProviders: "ki_safe_providers",
        vaultStore: "ki_safe_vault_store",
        vaultManualKeys: "osiris_manual_keys",
        vaultManualModels: "osiris_manual_models",
        dictDelta: "dict_delta_store",
        dictTechnical: "wl_db",
        ficheProHtml: "fiche_pro_html_v4",
        ficheTheme: "fiche_theme",
        testBankLinks: "bank_links",
        hubPrefs: "osiris_hub_prefs",
        schoolsList: "schools",
        appLang: "lang"
    };

    // ==========================================
    // UTILITAIRES CRYPTO & ENCODAGE (Web Crypto)
    // ==========================================

    function buf2b64(buf) {
        var bytes = new Uint8Array(buf);
        var bin = "";
        for (var i = 0; i < bytes.byteLength; i++) {
            bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin);
    }

    function b642buf(b64) {
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function b64ToUrlSafe(b64) {
        return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function urlSafeToB64(urlSafe) {
        var b64 = urlSafe.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) {
            b64 += "=";
        }
        return b64;
    }

    function getRandomBytes(len) {
        var bytes = new Uint8Array(len);
        if (typeof crypto !== "undefined" && crypto.getRandomValues) {
            crypto.getRandomValues(bytes);
        } else {
            for (var i = 0; i < len; i++) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }
        return bytes;
    }

    function generateSessionId(length) {
        length = length || 10;
        var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        var res = "";
        var bytes = getRandomBytes(length);
        for (var i = 0; i < length; i++) {
            res += chars[bytes[i] % chars.length];
        }
        return res;
    }

    async function encryptWithRawKey(plainText, rawKeyBytes) {
        var key = await crypto.subtle.importKey(
            "raw",
            rawKeyBytes,
            { name: "AES-GCM" },
            false,
            ["encrypt"]
        );
        var iv = getRandomBytes(12);
        var enc = new TextEncoder();
        var cipherBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            enc.encode(plainText)
        );
        return {
            iv: b64ToUrlSafe(buf2b64(iv.buffer)),
            data: b64ToUrlSafe(buf2b64(cipherBuffer))
        };
    }

    async function decryptWithRawKey(ivUrlSafe, dataUrlSafe, rawKeyBytes) {
        var key = await crypto.subtle.importKey(
            "raw",
            rawKeyBytes,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );
        var iv = new Uint8Array(b642buf(urlSafeToB64(ivUrlSafe)));
        var cipherBuf = b642buf(urlSafeToB64(dataUrlSafe));
        var plainBuf = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            cipherBuf
        );
        var dec = new TextDecoder();
        return dec.decode(plainBuf);
    }

    async function deriveKeyFromPassword(password, saltUint8, iterations) {
        iterations = iterations || 100000;
        var enc = new TextEncoder();
        var keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: saltUint8,
                iterations: iterations,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    }

    async function encryptWithPassword(plainText, password) {
        var salt = getRandomBytes(16);
        var iv = getRandomBytes(12);
        var iterations = 100000;
        var key = await deriveKeyFromPassword(password, salt, iterations);
        var enc = new TextEncoder();
        var cipherBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            enc.encode(plainText)
        );
        return {
            magic: MAGIC_ENCRYPTED,
            version: 1,
            salt: buf2b64(salt.buffer),
            iv: buf2b64(iv.buffer),
            iterations: iterations,
            ciphertext: buf2b64(cipherBuffer)
        };
    }

    async function decryptWithPassword(envelope, password) {
        if (!envelope || envelope.magic !== MAGIC_ENCRYPTED) {
            throw new Error("Format de fichier chiffré non reconnu.");
        }
        var salt = new Uint8Array(b642buf(envelope.salt));
        var iv = new Uint8Array(b642buf(envelope.iv));
        var cipherBuf = b642buf(envelope.ciphertext);
        var key = await deriveKeyFromPassword(password, salt, envelope.iterations || 100000);
        var plainBuf = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            cipherBuf
        );
        var dec = new TextDecoder();
        return dec.decode(plainBuf);
    }

    // ==========================================
    // AGGRÉGATION ET RESTAURATION DE L'ÉTAT
    // ==========================================

    var OsirisSync = {
        collectData: function () {
            var rawStore = {};
            for (var keyName in SYNC_KEYS) {
                var actualKey = SYNC_KEYS[keyName];
                var val = localStorage.getItem(actualKey);
                if (val !== null && val !== undefined) {
                    try {
                        rawStore[keyName] = JSON.parse(val);
                    } catch (e) {
                        rawStore[keyName] = val;
                    }
                }
            }

            var dashboard = rawStore.dashboard || {};
            var schoolsCount = Array.isArray(dashboard.schools) ? dashboard.schools.length : 0;
            var classesCount = Array.isArray(dashboard.classes) ? dashboard.classes.length : 0;
            var studentsTotal = 0;
            if (Array.isArray(dashboard.classes)) {
                dashboard.classes.forEach(function (c) {
                    if (Array.isArray(c.students)) {
                        studentsTotal += c.students.length;
                    } else if (c.effectif) {
                        studentsTotal += parseInt(c.effectif, 10) || 0;
                    }
                });
            }

            var bundle = {
                magic: MAGIC_UNIFIED,
                version: 1,
                timestamp: new Date().toISOString(),
                meta: {
                    appName: "Osiris Portfolio",
                    schoolsCount: schoolsCount,
                    classesCount: classesCount,
                    studentsTotal: studentsTotal,
                    hasVault: !!rawStore.vaultStore,
                    hasCustomTheme: !!rawStore.portfolioPersonalize,
                    hasFichePro: !!rawStore.ficheProHtml,
                    deviceUserAgent: navigator.userAgent.substring(0, 80)
                },
                data: rawStore
            };

            return bundle;
        },

        applyData: function (bundle) {
            if (!bundle || bundle.magic !== MAGIC_UNIFIED || !bundle.data) {
                throw new Error("Paquet de synchronisation invalide ou corrompu.");
            }

            var rawStore = bundle.data;
            var restoredCount = 0;

            for (var keyName in SYNC_KEYS) {
                var actualKey = SYNC_KEYS[keyName];
                if (rawStore.hasOwnProperty(keyName)) {
                    var val = rawStore[keyName];
                    if (val === null || val === undefined) {
                        localStorage.removeItem(actualKey);
                    } else if (typeof val === "object") {
                        localStorage.setItem(actualKey, JSON.stringify(val));
                    } else {
                        localStorage.setItem(actualKey, String(val));
                    }
                    restoredCount++;
                }
            }

            return {
                success: true,
                restoredKeys: restoredCount,
                meta: bundle.meta || {}
            };
        },

        exportBackup: async function (passwordOrPin) {
            var bundle = this.collectData();
            var jsonText = JSON.stringify(bundle, null, 2);

            var exportPayload;
            var filename = "osiris-backup-" + new Date().toISOString().slice(0, 10);

            if (passwordOrPin && String(passwordOrPin).trim().length > 0) {
                exportPayload = await encryptWithPassword(jsonText, String(passwordOrPin).trim());
                filename += ".osiris";
            } else {
                exportPayload = bundle;
                filename += ".json";
            }

            var fileContent = JSON.stringify(exportPayload, null, 2);
            var blob = new Blob([fileContent], { type: "application/json" });

            var sharedNatively = false;
            if (navigator.canShare && typeof File !== "undefined") {
                try {
                    var file = new File([blob], filename, { type: "application/json" });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: "Sauvegarde Osiris Portfolio",
                            text: "Sauvegarde sécurisée complète de votre portfolio enseignant."
                        });
                        sharedNatively = true;
                    }
                } catch (shareErr) {
                    console.log("Partage natif non abouti ou annulé:", shareErr);
                }
            }

            if (!sharedNatively) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(function () {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 2000);
            }

            return { filename: filename, sharedNatively: sharedNatively, meta: bundle.meta };
        },

        importBackup: async function (file, passwordOrPin) {
            return new Promise(function (resolve, reject) {
                if (!file) return reject(new Error("Aucun fichier sélectionné."));
                var reader = new FileReader();
                reader.onload = async function (e) {
                    try {
                        var text = e.target.result;
                        var parsed = JSON.parse(text);

                        if (parsed.magic === MAGIC_ENCRYPTED) {
                            if (!passwordOrPin) {
                                return resolve({ needPassword: true, envelope: parsed });
                            }
                            var decryptedJson = await decryptWithPassword(parsed, String(passwordOrPin).trim());
                            var decryptedBundle = JSON.parse(decryptedJson);
                            resolve({ needPassword: false, bundle: decryptedBundle });
                        } else if (parsed.magic === MAGIC_UNIFIED) {
                            resolve({ needPassword: false, bundle: parsed });
                        } else {
                            reject(new Error("Ce fichier n'est pas une sauvegarde Osiris valide."));
                        }
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = function () {
                    reject(new Error("Erreur de lecture du fichier."));
                };
                reader.readAsText(file, "UTF-8");
            });
        },

        createSenderSession: async function (onStatusChange) {
            var self = this;
            onStatusChange = onStatusChange || function () {};

            var bundle = self.collectData();
            var bundleJson = JSON.stringify(bundle);
            var rawKeyBytes = getRandomBytes(32);
            var rawKeyUrlSafe = b64ToUrlSafe(buf2b64(rawKeyBytes.buffer));
            var roomId = generateSessionId(8);

            onStatusChange("encrypting", "Chiffrement AES-256-GCM des données...");
            var encrypted = await encryptWithRawKey(bundleJson, rawKeyBytes);

            var relayKey = "";
            var p2pPeer = null;

            try {
                onStatusChange("relay_upload", "Préparation du relais éphémère...");
                var relayPayload = JSON.stringify({
                    magic: MAGIC_EPHEMERAL,
                    roomId: roomId,
                    iv: encrypted.iv,
                    data: encrypted.data,
                    ts: Date.now()
                });

                var res = await fetch(RELAY_POST_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: relayPayload
                });

                if (res.ok) {
                    var data = await res.json();
                    relayKey = data.key || "";
                }
            } catch (relayErr) {
                console.warn("Relais note (P2P reste actif):", relayErr);
            }

            if (typeof Peer !== "undefined") {
                try {
                    onStatusChange("p2p_init", "Ouverture du canal direct WebRTC...");
                    p2pPeer = new Peer("osiris-" + roomId, {
                        debug: 0,
                        config: {
                            iceServers: [
                                { urls: "stun:stun.l.google.com:19302" },
                                { urls: "stun:stun1.l.google.com:19302" }
                            ]
                        }
                    });

                    p2pPeer.on("connection", function (conn) {
                        conn.on("open", function () {
                            onStatusChange("p2p_transfer", "Appareil connecté en P2P direct ! Transfert...");
                            conn.send({
                                type: "OSIRIS_SYNC_PAYLOAD",
                                iv: encrypted.iv,
                                data: encrypted.data
                            });
                            onStatusChange("completed", "Données transmises avec succès à votre autre appareil !");
                        });
                    });
                } catch (p2pErr) {
                    console.log("PeerJS init note:", p2pErr);
                }
            }

            var baseHref = window.location.href.split("#")[0].split("?")[0];
            var qrUrl = baseHref + "?sync=" + encodeURIComponent(relayKey) + "&p2p=" + encodeURIComponent(roomId) + "#" + rawKeyUrlSafe;

            onStatusChange("ready", "Prêt pour le scan !");

            return {
                roomId: roomId,
                relayKey: relayKey,
                qrUrl: qrUrl,
                meta: bundle.meta,
                destroy: function () {
                    if (p2pPeer && !p2pPeer.destroyed) {
                        try { p2pPeer.destroy(); } catch (e) {}
                    }
                }
            };
        },

        receiveSession: async function (relayKey, roomId, rawKeyUrlSafe, onStatusChange) {
            onStatusChange = onStatusChange || function () {};
            var rawKeyBytes = new Uint8Array(b642buf(urlSafeToB64(rawKeyUrlSafe)));

            return new Promise(async function (resolve, reject) {
                var resolved = false;

                function handlePayload(iv, data, source) {
                    if (resolved) return;
                    resolved = true;
                    onStatusChange("decrypting", "Déchiffrement sécurisé des données reçues (" + source + ")...");
                    decryptWithRawKey(iv, data, rawKeyBytes)
                        .then(function (plainJson) {
                            var bundle = JSON.parse(plainJson);
                            resolve(bundle);
                        })
                        .catch(function (err) {
                            reject(new Error("Échec du déchiffrement : " + (err ? err.message : err)));
                        });
                }

                if (typeof Peer !== "undefined" && roomId) {
                    try {
                        onStatusChange("connecting_p2p", "Connexion directe en cours avec votre ordinateur...");
                        var peer = new Peer({
                            debug: 0,
                            config: {
                                iceServers: [
                                    { urls: "stun:stun.l.google.com:19302" },
                                    { urls: "stun:stun1.l.google.com:19302" }
                                ]
                            }
                        });

                        peer.on("open", function () {
                            var conn = peer.connect("osiris-" + roomId, { reliable: true });
                            conn.on("data", function (msg) {
                                if (msg && msg.type === "OSIRIS_SYNC_PAYLOAD") {
                                    handlePayload(msg.iv, msg.data, "P2P direct");
                                }
                            });
                        });
                    } catch (e) {
                        console.log("P2P connect note:", e);
                    }
                }

                var fetchFromRelay = async function () {
                    if (resolved || !relayKey) return;
                    try {
                        onStatusChange("fetching_relay", "Récupération sécurisée via le relais éphémère...");
                        var res = await fetch(RELAY_GET_BASE + encodeURIComponent(relayKey));
                        if (!res.ok) throw new Error("Session expirée ou introuvable sur le relais.");
                        var envelope = await res.json();
                        if (envelope && envelope.iv && envelope.data) {
                            handlePayload(envelope.iv, envelope.data, "Relais éphémère");
                        } else {
                            throw new Error("Contenu du relais incomplet.");
                        }
                    } catch (relayErr) {
                        if (!resolved) {
                            reject(new Error("Impossible de récupérer la synchronisation : " + (relayErr ? relayErr.message : relayErr)));
                        }
                    }
                };

                setTimeout(fetchFromRelay, 3000);
                if (!roomId || typeof Peer === "undefined") {
                    fetchFromRelay();
                }
            });
        },

        checkIncomingSync: function (onIncomingDetected) {
            var search = window.location.search || "";
            var hash = window.location.hash || "";

            if (!search || !hash) return false;

            var params = new URLSearchParams(search);
            var syncKey = params.get("sync") || "";
            var p2pId = params.get("p2p") || "";
            var rawKey = hash.replace(/^#/, "");

            if ((syncKey || p2pId) && rawKey.length > 20) {
                if (typeof onIncomingDetected === "function") {
                    onIncomingDetected(syncKey, p2pId, rawKey);
                }
                return true;
            }
            return false;
        },

        cleanUrlParams: function () {
            try {
                var cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            } catch (e) {}
        }
    };

    // ==========================================
    // OSIRIS SYNC UI (Interface Modale Universelle)
    // ==========================================

    var OsirisSyncUI = {
        activeTab: "qr",
        senderSession: null,
        countdownTimer: null,

        i18n: {
            FR: {
                modalTitle: "Synchronisation & Sauvegarde Osiris",
                tabQr: "📱 Synchroniser (QR Code)",
                tabFile: "💾 Sauvegarde Sécurisée (.osiris)",
                qrDesc: "Transférez instantanément vos données (classes, notes, design et clés IA) vers votre smartphone ou tablette, sans aucun compte ni e-mail.",
                btnGenerateQr: "Générer le QR Code de synchronisation",
                scanPrompt: "Visez ce code avec l'appareil photo standard de votre mobile :",
                countdownLabel: "Expire dans :",
                e2eeNotice: "🛡️ Chiffrement AES-256-GCM de bout en bout (Zero-Knowledge). La clé de sécurité reste confinée à vos écrans.",
                fileExportTitle: "1. Exporter / Partager",
                fileExportDesc: "Créez un fichier chiffré complet contenant toutes vos données. Compatible AirDrop, QuickShare et clé USB.",
                pinPlaceholder: "Mot de passe Coffre-fort ou code PIN (facultatif)",
                btnExport: "Exporter la sauvegarde (.osiris)",
                fileImportTitle: "2. Restaurer depuis un fichier",
                fileImportDesc: "Importez un fichier .osiris ou .json pour mettre à jour vos données sur cet appareil.",
                dropZoneText: "Cliquez ou déposez votre fichier .osiris ici",
                btnImport: "Restaurer",
                incomingTitle: "📥 Synchronisation Entrante Reçue !",
                incomingPrompt: "Votre autre appareil souhaite mettre à jour les données de ce navigateur :",
                btnApplySync: "Confirmer et Appliquer",
                btnCancel: "Annuler",
                syncSuccess: "Synchronisation terminée avec succès ! La page va s'actualiser...",
                syncError: "Erreur de synchronisation : "
            },
            DE: {
                modalTitle: "Osiris Synchronisation & Sicherung",
                tabQr: "📱 Geräte-Sync (QR-Code)",
                tabFile: "💾 Sicherungsdatei (.osiris)",
                qrDesc: "Übertragen Sie Ihre Klassen, Noten, Einstellungen und KI-Schlüssel sofort auf Ihr Smartphone oder Tablet – ohne Konto oder E-Mail.",
                btnGenerateQr: "Sync-QR-Code generieren",
                scanPrompt: "Scannen Sie diesen Code mit der normalen Smartphone-Kamera:",
                countdownLabel: "Gültig für:",
                e2eeNotice: "🛡️ Ende-zu-Ende-Verschlüsselung (AES-256-GCM, Zero-Knowledge). Der Sicherheitsschlüssel bleibt ausschließlich auf Ihren Bildschirmen.",
                fileExportTitle: "1. Exportieren / Teilen",
                fileExportDesc: "Erstellen Sie eine verschlüsselte Sicherungsdatei. Kompatibel mit AirDrop, QuickShare oder USB-Sticks.",
                pinPlaceholder: "Tresor-Passwort oder PIN (optional)",
                btnExport: "Sicherung exportieren (.osiris)",
                fileImportTitle: "2. Aus Datei wiederherstellen",
                fileImportDesc: "Laden Sie eine .osiris- oder .json-Datei, um die Daten auf diesem Gerät zu aktualisieren.",
                dropZoneText: "Hier klicken oder .osiris-Datei ablegen",
                btnImport: "Wiederherstellen",
                incomingTitle: "📥 Eingehende Synchronisation!",
                incomingPrompt: "Ihr anderes Gerät möchte die Daten dieses Browsers aktualisieren:",
                btnApplySync: "Bestätigen und anwenden",
                btnCancel: "Abbrechen",
                syncSuccess: "Synchronisation erfolgreich! Seite wird neu geladen...",
                syncError: "Fehler bei der Synchronisation: "
            }
        },

        getLang: function () {
            var l = localStorage.getItem("lang") || (window.appState && window.appState.lang) || "FR";
            return l.toUpperCase() === "DE" ? "DE" : "FR";
        },

        injectStyles: function () {
            if (document.getElementById("osirisSyncStyles")) return;
            var css = `
                .osiris-sync-overlay {
                    display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.55); z-index: 10005; align-items: center; justify-content: center;
                    backdrop-filter: blur(3px); overflow-y: auto; padding: 16px; box-sizing: border-box;
                }
                .osiris-sync-overlay.active { display: flex; }
                .osiris-sync-content {
                    background: var(--white, #ffffff); color: var(--text-color, #1e293b);
                    border-radius: 14px; padding: 22px 24px; max-width: 540px; width: 92%;
                    max-height: 88vh; display: flex; flex-direction: column; margin: auto;
                    box-shadow: 0 15px 35px rgba(0,0,0,0.25); box-sizing: border-box; overflow: hidden;
                    text-align: left;
                }
                .osiris-sync-header {
                    display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 1px solid var(--border-grey, #e2e8f0); padding-bottom: 12px; margin-bottom: 14px;
                    flex-shrink: 0;
                }
                .osiris-sync-title { font-size: 1.15rem; font-weight: 700; color: var(--accent, #3498db); display: flex; align-items: center; gap: 8px; }
                .osiris-sync-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #94a3b8; line-height: 1; }
                .osiris-sync-close:hover { color: #0f172a; }
                .osiris-sync-tabs { display: flex; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid var(--border-grey, #e2e8f0); padding-bottom: 8px; flex-shrink: 0; }
                .osiris-sync-tab-btn {
                    background: none; border: none; padding: 6px 12px; font-weight: 600; font-size: 0.88rem;
                    color: var(--secondary-text, #64748b); cursor: pointer; border-radius: 6px; transition: all 0.2s;
                }
                .osiris-sync-tab-btn.active { background: var(--accent, #3498db); color: #ffffff; }
                .osiris-sync-body { flex: 1 1 auto; overflow-y: auto; padding-right: 4px; min-height: 0; }
                .osiris-sync-body::-webkit-scrollbar { width: 6px; }
                .osiris-sync-body::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.4); border-radius: 4px; }
                .osiris-sync-box {
                    background: rgba(52, 152, 219, 0.08); border-left: 4px solid var(--accent, #3498db);
                    border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; font-size: 0.88rem; line-height: 1.5;
                }
                .osiris-sync-qr-container { display: flex; flex-direction: column; align-items: center; margin: 12px 0; gap: 10px; }
                .osiris-sync-qr-box {
                    background: #ffffff; padding: 12px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    display: inline-block;
                }
                .osiris-sync-status-pill {
                    display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px;
                    font-size: 0.82rem; font-weight: 600; background: #e0f2fe; color: #0369a1;
                }
                .osiris-sync-status-pill.success { background: #dcfce7; color: #15803d; }
                .osiris-sync-btn-action {
                    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                    background: var(--dot-checked, #27ae60); color: #ffffff; border: none; border-radius: 6px;
                    padding: 8px 16px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
                    width: 100%; box-sizing: border-box; margin-top: 6px;
                }
                .osiris-sync-btn-action:hover { opacity: 0.92; transform: translateY(-1px); }
                .osiris-sync-input {
                    width: 100%; padding: 8px 12px; border: 1.5px solid var(--border-grey, #cbd5e1);
                    border-radius: 6px; font-size: 0.88rem; box-sizing: border-box; margin: 6px 0 10px 0;
                    background: var(--white, #ffffff); color: var(--text-color, #1e293b);
                }
                .osiris-sync-dropzone {
                    border: 2px dashed var(--border-grey, #cbd5e1); border-radius: 8px; padding: 16px;
                    text-align: center; cursor: pointer; margin-bottom: 10px; transition: border-color 0.2s;
                }
                .osiris-sync-dropzone:hover { border-color: var(--accent, #3498db); }
                @media (max-width: 600px) {
                    .osiris-sync-content { width: 95%; max-height: 92vh; padding: 16px 14px; }
                    .osiris-sync-tabs { flex-wrap: wrap; }
                    .osiris-sync-tab-btn { flex: 1 1 auto; text-align: center; }
                }
            `;
            var styleEl = document.createElement("style");
            styleEl.id = "osirisSyncStyles";
            styleEl.textContent = css;
            document.head.appendChild(styleEl);
        },

        injectModal: function () {
            if (document.getElementById("osirisSyncModal")) return;
            this.injectStyles();

            var lang = this.i18n[this.getLang()];
            var html = `
                <div id="osirisSyncModal" class="osiris-sync-overlay" onclick="if(event.target===this) OsirisSyncUI.close()">
                    <div class="osiris-sync-content" onclick="event.stopPropagation()">
                        <div class="osiris-sync-header">
                            <div class="osiris-sync-title" id="osirisSyncModalTitle">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                                <span>${lang.modalTitle}</span>
                            </div>
                            <button class="osiris-sync-close" onclick="OsirisSyncUI.close()">&times;</button>
                        </div>

                        <div class="osiris-sync-tabs" id="osirisSyncTabs">
                            <button class="osiris-sync-tab-btn active" id="tabQrBtn" onclick="OsirisSyncUI.switchTab('qr')">${lang.tabQr}</button>
                            <button class="osiris-sync-tab-btn" id="tabFileBtn" onclick="OsirisSyncUI.switchTab('file')">${lang.tabFile}</button>
                        </div>

                        <div class="osiris-sync-body" id="osirisSyncBody">
                            <!-- Onglet QR Code -->
                            <div id="osirisSyncPanelQr">
                                <div class="osiris-sync-box">
                                    ${lang.qrDesc}
                                </div>
                                <div id="osirisSyncQrInitial">
                                    <button class="osiris-sync-btn-action" onclick="OsirisSyncUI.startQrSync()">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                                        <span>${lang.btnGenerateQr}</span>
                                    </button>
                                </div>
                                <div id="osirisSyncQrActive" style="display:none;" class="osiris-sync-qr-container">
                                    <div style="font-size:0.88rem; font-weight:600;">${lang.scanPrompt}</div>
                                    <div class="osiris-sync-qr-box" id="osirisSyncQrCanvas"></div>
                                    <div class="osiris-sync-status-pill" id="osirisSyncStatusPill">
                                        <span id="osirisSyncStatusText">Connexion en cours...</span>
                                    </div>
                                    <div style="font-size:0.8rem; color:#64748b;" id="osirisSyncCountdown">
                                        ${lang.countdownLabel} 05:00
                                    </div>
                                    <div style="font-size:0.8rem; color:#64748b; text-align:center; margin-top:6px;">
                                        ${lang.e2eeNotice}
                                    </div>
                                </div>
                            </div>

                            <!-- Onglet Sauvegarde Fichier -->
                            <div id="osirisSyncPanelFile" style="display:none;">
                                <div style="font-weight:700; margin-bottom:4px;">${lang.fileExportTitle}</div>
                                <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">${lang.fileExportDesc}</div>
                                <input type="password" id="osirisSyncExportPin" class="osiris-sync-input" placeholder="${lang.pinPlaceholder}">
                                <button class="osiris-sync-btn-action" onclick="OsirisSyncUI.exportFile()">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    <span>${lang.btnExport}</span>
                                </button>

                                <hr style="border:none; border-top:1px solid var(--border-grey, #e2e8f0); margin:18px 0;">

                                <div style="font-weight:700; margin-bottom:4px;">${lang.fileImportTitle}</div>
                                <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">${lang.fileImportDesc}</div>
                                <div class="osiris-sync-dropzone" onclick="document.getElementById('osirisSyncFileInput').click()">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent,#3498db);margin-bottom:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                    <div id="osirisSyncFileName" style="font-size:0.88rem; font-weight:600;">${lang.dropZoneText}</div>
                                </div>
                                <input type="file" id="osirisSyncFileInput" accept=".osiris,.json" style="display:none;" onchange="OsirisSyncUI.handleFileSelect(event)">
                                <input type="password" id="osirisSyncImportPin" class="osiris-sync-input" placeholder="${lang.pinPlaceholder}" style="display:none;">
                                <button class="osiris-sync-btn-action" id="osirisSyncBtnImport" style="display:none;" onclick="OsirisSyncUI.importFile()">
                                    <span>${lang.btnImport}</span>
                                </button>
                            </div>

                            <!-- Vue Réception Entrante (Auto-détection QR code) -->
                            <div id="osirisSyncPanelIncoming" style="display:none;">
                                <div style="font-weight:700; font-size:1.05rem; color:var(--accent,#3498db); margin-bottom:6px;">
                                    ${lang.incomingTitle}
                                </div>
                                <div style="font-size:0.9rem; margin-bottom:12px;">
                                    ${lang.incomingPrompt}
                                </div>
                                <div class="osiris-sync-box" id="osirisSyncIncomingSummary">
                                    Chargement des données...
                                </div>
                                <div style="display:flex; gap:10px; margin-top:14px;">
                                    <button class="osiris-sync-btn-action" style="background:#64748b;" onclick="OsirisSyncUI.close()">
                                        ${lang.btnCancel}
                                    </button>
                                    <button class="osiris-sync-btn-action" id="osirisSyncBtnConfirmApply" onclick="OsirisSyncUI.applyIncoming()">
                                        ${lang.btnApplySync}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            var wrap = document.createElement("div");
            wrap.innerHTML = html;
            document.body.appendChild(wrap.firstElementChild);
        },

        open: function (initialTab) {
            this.injectModal();
            var m = document.getElementById("osirisSyncModal");
            if (m) m.classList.add("active");
            if (initialTab) this.switchTab(initialTab);
        },

        close: function () {
            var m = document.getElementById("osirisSyncModal");
            if (m) m.classList.remove("active");
            if (this.senderSession) {
                this.senderSession.destroy();
                this.senderSession = null;
            }
            if (this.countdownTimer) {
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
            }
            OsirisSync.cleanUrlParams();
        },

        switchTab: function (tab) {
            this.activeTab = tab;
            var tabQrBtn = document.getElementById("tabQrBtn");
            var tabFileBtn = document.getElementById("tabFileBtn");
            var panelQr = document.getElementById("osirisSyncPanelQr");
            var panelFile = document.getElementById("osirisSyncPanelFile");
            var panelInc = document.getElementById("osirisSyncPanelIncoming");

            if (panelInc) panelInc.style.display = "none";
            if (tab === "qr") {
                if (tabQrBtn) tabQrBtn.classList.add("active");
                if (tabFileBtn) tabFileBtn.classList.remove("active");
                if (panelQr) panelQr.style.display = "block";
                if (panelFile) panelFile.style.display = "none";
            } else {
                if (tabQrBtn) tabQrBtn.classList.remove("active");
                if (tabFileBtn) tabFileBtn.classList.add("active");
                if (panelQr) panelQr.style.display = "none";
                if (panelFile) panelFile.style.display = "block";
            }
        },

        startQrSync: async function () {
            var self = this;
            var initBox = document.getElementById("osirisSyncQrInitial");
            var activeBox = document.getElementById("osirisSyncQrActive");
            var qrCanvas = document.getElementById("osirisSyncQrCanvas");
            var statusText = document.getElementById("osirisSyncStatusText");
            var statusPill = document.getElementById("osirisSyncStatusPill");
            var countdownEl = document.getElementById("osirisSyncCountdown");

            if (initBox) initBox.style.display = "none";
            if (activeBox) activeBox.style.display = "flex";
            if (qrCanvas) qrCanvas.innerHTML = "";

            try {
                self.senderSession = await OsirisSync.createSenderSession(function (code, msg) {
                    if (statusText) statusText.textContent = msg;
                    if (code === "completed") {
                        if (statusPill) statusPill.className = "osiris-sync-status-pill success";
                    }
                });

                // Génération visuelle du QR code avec QRCode.js
                if (typeof QRCode !== "undefined" && qrCanvas) {
                    new QRCode(qrCanvas, {
                        text: self.senderSession.qrUrl,
                        width: 190,
                        height: 190,
                        colorDark: "#0f172a",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.M
                    });
                }

                // Compte à rebours 5 minutes
                var secondsLeft = 300;
                var lang = self.i18n[self.getLang()];
                if (self.countdownTimer) clearInterval(self.countdownTimer);
                self.countdownTimer = setInterval(function () {
                    secondsLeft--;
                    if (secondsLeft <= 0) {
                        clearInterval(self.countdownTimer);
                        if (countdownEl) countdownEl.textContent = "Session expirée.";
                        self.close();
                    } else {
                        var mins = Math.floor(secondsLeft / 60);
                        var secs = secondsLeft % 60;
                        var fmt = (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;
                        if (countdownEl) countdownEl.textContent = lang.countdownLabel + " " + fmt;
                    }
                }, 1000);

            } catch (err) {
                alert("Erreur lors de la préparation de la synchronisation: " + err.message);
                if (initBox) initBox.style.display = "block";
                if (activeBox) activeBox.style.display = "none";
            }
        },

        exportFile: async function () {
            var pin = document.getElementById("osirisSyncExportPin").value;
            try {
                var res = await OsirisSync.exportBackup(pin);
                var lang = this.i18n[this.getLang()];
                if (res.sharedNatively) {
                    // Partagé via le menu natif
                }
            } catch (err) {
                alert(this.i18n[this.getLang()].syncError + err.message);
            }
        },

        selectedFile: null,
        handleFileSelect: function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            this.selectedFile = file;
            var nameEl = document.getElementById("osirisSyncFileName");
            if (nameEl) nameEl.textContent = file.name;
            var pinInput = document.getElementById("osirisSyncImportPin");
            var btnImport = document.getElementById("osirisSyncBtnImport");
            if (file.name.endsWith(".osiris")) {
                if (pinInput) pinInput.style.display = "block";
            } else {
                if (pinInput) pinInput.style.display = "none";
            }
            if (btnImport) btnImport.style.display = "block";
        },

        importFile: async function () {
            if (!this.selectedFile) return;
            var pin = document.getElementById("osirisSyncImportPin").value;
            var lang = this.i18n[this.getLang()];
            try {
                var res = await OsirisSync.importBackup(this.selectedFile, pin);
                if (res.needPassword) {
                    alert("Ce fichier est chiffré. Veuillez saisir le mot de passe ou le code PIN.");
                    document.getElementById("osirisSyncImportPin").style.display = "block";
                    return;
                }
                var applied = OsirisSync.applyData(res.bundle);
                alert(lang.syncSuccess);
                window.location.reload();
            } catch (err) {
                alert(lang.syncError + err.message);
            }
        },

        incomingBundle: null,
        handleIncoming: async function (syncKey, p2pId, rawKey) {
            var self = this;
            self.open();
            var tabs = document.getElementById("osirisSyncTabs");
            var panelQr = document.getElementById("osirisSyncPanelQr");
            var panelFile = document.getElementById("osirisSyncPanelFile");
            var panelInc = document.getElementById("osirisSyncPanelIncoming");
            var summaryEl = document.getElementById("osirisSyncIncomingSummary");
            var lang = self.i18n[self.getLang()];

            if (tabs) tabs.style.display = "none";
            if (panelQr) panelQr.style.display = "none";
            if (panelFile) panelFile.style.display = "none";
            if (panelInc) panelInc.style.display = "block";

            try {
                var bundle = await OsirisSync.receiveSession(syncKey, p2pId, rawKey, function (step, msg) {
                    if (summaryEl) summaryEl.textContent = msg;
                });
                self.incomingBundle = bundle;
                var meta = bundle.meta || {};
                var summaryHtml = `
                    <strong>${meta.appName || 'Osiris Portfolio'}</strong><br>
                    • Écoles : ${meta.schoolsCount || 0}<br>
                    • Classes : ${meta.classesCount || 0} (${meta.studentsTotal || 0} élèves)<br>
                    • Coffre-fort IA : ${meta.hasVault ? '✅ Inclus' : 'Non configuré'}<br>
                    • Date d'envoi : ${new Date(bundle.timestamp).toLocaleString()}
                `;
                if (summaryEl) summaryEl.innerHTML = summaryHtml;
            } catch (err) {
                if (summaryEl) summaryEl.innerHTML = `<span style="color:#ef4444;">${lang.syncError} ${err.message}</span>`;
            }
        },

        applyIncoming: function () {
            if (!this.incomingBundle) return;
            var lang = this.i18n[this.getLang()];
            try {
                OsirisSync.applyData(this.incomingBundle);
                OsirisSync.cleanUrlParams();
                alert(lang.syncSuccess);
                window.location.reload();
            } catch (err) {
                alert(lang.syncError + err.message);
            }
        },

        init: function () {
            var self = this;
            OsirisSync.checkIncomingSync(function (syncKey, p2pId, rawKey) {
                self.handleIncoming(syncKey, p2pId, rawKey);
            });
        }
    };

    global.OsirisSync = OsirisSync;
    global.OsirisSyncUI = OsirisSyncUI;

    // Détection automatique au chargement
    if (typeof window !== "undefined") {
        if (document.readyState === "loading") {
            window.addEventListener("DOMContentLoaded", function () { OsirisSyncUI.init(); });
        } else {
            OsirisSyncUI.init();
        }
    }

})(typeof window !== "undefined" ? window : this);
