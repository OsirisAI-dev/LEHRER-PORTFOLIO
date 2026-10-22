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

    // Chiffrement / Déchiffrement AES-GCM avec clé brute (pour le QR Code)
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

    // Chiffrement / Déchiffrement basé sur un mot de passe ou code PIN (PBKDF2 + AES-GCM)
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
        /**
         * Extrait l'ensemble des données locales de l'utilisateur sous forme de paquet standardisé.
         */
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

        /**
         * Restaure les données du paquet dans le localStorage de l'appareil.
         */
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

        // ==========================================
        // OPTION D : FICHIER DE SAUVEGARDE & PARTAGE
        // ==========================================

        /**
         * Génère un fichier .osiris chiffré et propose soit le partage natif (AirDrop/QuickShare), soit le téléchargement.
         */
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

            // Tentative d'utilisation du partage natif (iOS AirDrop, Android QuickShare, etc.)
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
                    // Si l'utilisateur annule le menu de partage ou s'il échoue, on bascule sur le téléchargement standard
                    console.log("Partage natif non abouti ou annulé, fallback téléchargement:", shareErr);
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

        /**
         * Lit et déchiffre un fichier .osiris / .json importé.
         */
        importBackup: async function (file, passwordOrPin) {
            return new Promise(function (resolve, reject) {
                if (!file) return reject(new Error("Aucun fichier sélectionné."));
                var reader = new FileReader();
                reader.onload = async function (e) {
                    try {
                        var text = e.target.result;
                        var parsed = JSON.parse(text);

                        // Si le fichier est chiffré
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

        // ==========================================
        // OPTION A : HYBRIDE P2P WEBRTC + RELAIS E2EE
        // ==========================================

        /**
         * Initialise une session d'émission :
         * Chiffre le paquet, configure le P2P direct et dépose le blob chiffré sur le relais éphémère.
         */
        createSenderSession: async function (onStatusChange) {
            var self = this;
            onStatusChange = onStatusChange || function () {};

            // 1. Préparer le paquet et générer la clé 256 bits
            var bundle = self.collectData();
            var bundleJson = JSON.stringify(bundle);
            var rawKeyBytes = getRandomBytes(32);
            var rawKeyUrlSafe = b64ToUrlSafe(buf2b64(rawKeyBytes.buffer));
            var roomId = generateSessionId(8);

            onStatusChange("encrypting", "Chiffrement AES-256-GCM des données...");
            var encrypted = await encryptWithRawKey(bundleJson, rawKeyBytes);

            var relayKey = "";
            var p2pPeer = null;

            // 2. Dépôt éphémère sur le relais (Zero-Knowledge)
            try {
                onStatusChange("relay_upload", "Préparation du relais de secours éphémère...");
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
                console.warn("Échec du relais de secours, le P2P reste actif:", relayErr);
            }

            // 3. Initialisation du Peer WebRTC P2P direct
            var p2pConnected = false;
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
                            p2pConnected = true;
                            onStatusChange("p2p_transfer", "Appareil connecté en P2P direct ! Envoi des données...");
                            conn.send({
                                type: "OSIRIS_SYNC_PAYLOAD",
                                iv: encrypted.iv,
                                data: encrypted.data
                            });
                            onStatusChange("completed", "Données transmises avec succès à votre autre appareil !");
                        });
                    });

                    p2pPeer.on("error", function (err) {
                        console.log("PeerJS note (relais prend le relais):", err);
                    });
                } catch (p2pErr) {
                    console.log("P2P initialisation note:", p2pErr);
                }
            }

            // 4. Construction de l'URL cible encodée dans le QR Code
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

        /**
         * Reçoit et déchiffre les données sur le 2e appareil (Smartphone/Tablette) :
         * Tente le P2P direct et bascule instantanément sur le relais si besoin.
         */
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

                // Tentative 1 : P2P direct WebRTC via PeerJS
                var peer = null;
                if (typeof Peer !== "undefined" && roomId) {
                    try {
                        onStatusChange("connecting_p2p", "Connexion directe en cours avec votre ordinateur...");
                        peer = new Peer({
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
                        console.log("P2P connect skip:", e);
                    }
                }

                // Tentative 2 : Bascule sur le relais éphémère après 3 secondes (ou immédiatement si pas de P2P)
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

        /**
         * Vérifie au chargement de la page si un lien entrant de synchronisation est présent.
         */
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

        /**
         * Nettoie les paramètres d'URL après la synchronisation sans recharger la page.
         */
        cleanUrlParams: function () {
            try {
                var cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            } catch (e) {}
        }
    };

    global.OsirisSync = OsirisSync;
})(typeof window !== "undefined" ? window : this);
