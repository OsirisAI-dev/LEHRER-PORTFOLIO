/* ============================================================
   osiris-core.js
   Shared library core for the Osiris multi-theme bookshelf.

   Step 3 of the workplan ("Shared schema + storage key"): one
   storage key, one array of book records, read/written by every
   shelf (CLASSIQUE, Codex Collection, Lit Circle). Dark Shelf is
   intentionally NOT migrated yet — see workplan §2/§9 step 4.

   Each shelf already contains its own one-time migration logic
   (MIGRATION_FLAG + legacy key fold-in) that calls into the
   loadLibrary/saveLibrary/makeBookId functions below — this file
   only needs to provide the shared storage primitives, it does not
   need to know about any shelf's legacy key format.
   ============================================================ */
(function (global) {
  "use strict";

  var LIB_KEY = "osiris_library_books_v2";

  /* ---------------- id helper ---------------- */


  function makeBookId() {
    return "b_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  /* ---------------- load / save ---------------- */


  function loadLibrary() {
    try {
      var raw = global.localStorage.getItem(LIB_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }


  function saveLibrary(books) {
    try {
      global.localStorage.setItem(LIB_KEY, JSON.stringify(books || []));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- hub api dependencies ---------------- */

  var MSG = {
    SHELF_READY: "OSIRIS_SHELF_READY",
    SET_SORT: "OSIRIS_SET_SORT",
    LIBRARY_UPDATED: "OSIRIS_LIBRARY_UPDATED",


    SET_LANG: "SET_LANG"
  };

  function send(targetWindow, type, payload) {
    if (targetWindow && targetWindow.postMessage) {
      targetWindow.postMessage({ type: type, payload: payload }, "*");
    }
  }


  var _listeners = [];

  function listen(win, handlers) {
    var listenerObj = { target: win, handlers: handlers };
    _listeners.push(listenerObj);
    if (_listeners.length === 1) {
      global.addEventListener("message", function (e) {
        for (var i = 0; i < _listeners.length; i++) {
          var lstn = _listeners[i];
          if (lstn.target && e.source === lstn.target) {
            if (e.data && e.data.type && lstn.handlers && lstn.handlers[e.data.type]) {
              lstn.handlers[e.data.type](e.data.payload);
              return;
            }
          }
        }
      });
    }
  }

  /* ---------------- Vault Bridge (real Portfolio contract) ----------------
     Ported from the actual PORTFOLIO_SEITE.html message contract. The vault
     itself (PBKDF2 -> AES-GCM, 4-digit passphrase, ki_safe_vault_store) lives
     entirely inside Portfolio — it is never present in this file or the Hub.
     Portfolio does NOT broadcast a vault "state" and does NOT answer a
     "request state" query; the previous OSIRIS_VAULT_STATE / OSIRIS_REQUEST_
     VAULT message types here were speculative and matched nothing Portfolio
     actually sends, which is why the Hub's vault status always fell back to
     "locked/unavailable" even against a genuinely unlocked vault.

     What Portfolio really does: when the user clicks "Apply Keys" on its
     side, it posts already-decrypted keys, unprompted, straight to the
     current .page-frame's contentWindow:
       { type: 'osirisVaultKeys', keys: [{ provider, key, email }] }
     — provider is a free-text display name (e.g. "Google Gemini", "GitHub
     Models"), not one of this file's provider ids — and expects an ack
     back so it can update its own status line:
       { type: 'osirisVaultKeysApplied', count }
     There is no "locked vs unlocked" signal available to the embedded page
     at all; the only observable event is "keys arrived" or "they didn't". */


  function matchProviderId(displayName) {
    var norm = String(displayName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!norm) return null;
    for (var i = 0; i < PROVIDERS.length; i++) {
      var id = PROVIDERS[i].id;
      if (norm.indexOf(id) !== -1) return id;
    }
    return null;
  }


  function onVaultKeysReceived(cb) {
    global.addEventListener("message", function (e) {
      if (!e.data || e.data.type !== "osirisVaultKeys" || !Array.isArray(e.data.keys)) return;
      if (e.origin !== global.location.origin) return;
      var applied = {};
      var count = 0;
      e.data.keys.forEach(function (k) {
        var id = matchProviderId(k && k.provider);
        if (id && k.key) {
          applied[id] = k.key;
          count++;
        }
      });
      cb(applied, count);
      if (e.source && e.source.postMessage) {
        e.source.postMessage({ type: "osirisVaultKeysApplied", count: count }, global.location.origin);
      }
    });
  }

  /* ---------------- Manual API Keys Store ---------------- */


  var PROVIDERS = [
    { id: "pollinations", label: "Pollinations AI" },
    { id: "cerebras", label: "Cerebras" },
    { id: "groq", label: "Groq" },
    { id: "google", label: "Google AI Studio" },
    { id: "nvidia", label: "NVIDIA NIM" },
    { id: "github", label: "GitHub Models" },
    { id: "cloudflare", label: "Cloudflare Workers AI" },
    { id: "openrouter", label: "OpenRouter" },
    { id: "huggingface", label: "Hugging Face" }
  ];

  var FREE_MODELS = {
    cerebras: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B (Cerebras, ultra-fast)" },
      { id: "llama3.1-8b", label: "Llama 3.1 8B (Cerebras)" }
    ],
    groq: [
      { id: "llama3-70b-8192", label: "Llama 3 70B" },
      { id: "llama3-8b-8192", label: "Llama 3 8B (fast)" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" }
    ],
    google: [
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { id: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash Exp (cheap)" }
    ],
    nvidia: [
      { id: "deepseek-ai/deepseek-r1", label: "DeepSeek R1 (NIM)" },
      { id: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B" },
      { id: "meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B (NIM)" }
    ],
    github: [
      { id: "gpt-4o-mini", label: "GPT-4o mini (GitHub Models)" },
      { id: "Meta-Llama-3.1-70B-Instruct", label: "Llama 3.1 70B (GitHub Models)" }
    ],
    cloudflare: [
      { id: "@cf/meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B (Workers AI, 10k/day)" },
      { id: "@cf/qwen/qwen1.5-14b-chat-awq", label: "Qwen 1.5 14B (Workers AI)" }
    ],
    openrouter: [
      { id: "meta-llama/llama-3-8b-instruct:free", label: "Llama 3 70B (:free)" },
      { id: "google/gemma-2-9b-it:free", label: "Llama 3 8B (:free, fast)" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (:free)" }
    ],
    huggingface: [
      { id: "meta-llama/Llama-3.1-8B-Instruct", label: "Llama 3.1 8B (HF Router)" },
      { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen 2.5 72B (HF Router)" }
    ],
    pollinations: [
      { id: "openai", label: "OpenAI (Pollinations)" },
      { id: "mistral", label: "Mistral (Pollinations)" },
      { id: "llama", label: "Llama (Pollinations)" }
    ]
  };

  var FREE_KEY_LINKS = {
    cerebras: "https://cloud.cerebras.ai/platform/api-keys",
    groq: "https://console.groq.com/keys",
    google: "https://aistudio.google.com/apikey",
    nvidia: "https://build.nvidia.com/explore/discover",
    github: "https://github.com/settings/tokens",
    cloudflare: "https://dash.cloudflare.com/profile/api-tokens",
    openrouter: "https://openrouter.ai/keys",
    huggingface: "https://huggingface.co/settings/tokens",
    pollinations: "https://enter.pollinations.ai"
  };


  var KEYLESS_PROVIDERS = ['pollinations'];


  var API_KEY_PATTERNS = {
    cerebras: { re: /^csk-[a-zA-Z0-9]{20,}$/, hint: 'starts with "csk-"' },
    openrouter: { re: /^sk-or-[a-zA-Z0-9-]{16,}$/, hint: 'starts with "sk-or-"' },
    groq: { re: /^gsk_[a-zA-Z0-9]{20,}$/, hint: 'starts with "gsk_"' },


    google: { re: /^(AIza[a-zA-Z0-9_-]{35}|AQ\.[a-zA-Z0-9_.-]{20,})$/, hint: 'starts with "AIza" (39 chars) or "AQ." (new Google key format)' },
    nvidia: { re: /^nvapi-[a-zA-Z0-9_-]{20,}$/, hint: 'starts with "nvapi-"' },
    github: { re: /^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{20,})$/, hint: 'starts with "ghp_" or "github_pat_"' },


    cloudflare: { re: /^[a-f0-9]{32}:[a-zA-Z0-9_-]{20,}$/, hint: 'format "AccountID:APIToken" (Account ID = 32 hex chars)' },
    huggingface: { re: /^hf_[a-zA-Z0-9]{20,}$/, hint: 'starts with "hf_"' },


    pollinations: { re: /^(sk|pk)_[a-zA-Z0-9]{16,}$/, hint: 'starts with "sk_" or "pk_"' }
  };

  function validateApiKey(provider, rawKey) {
    var key = (rawKey || "").trim();
    var keyed = KEYLESS_PROVIDERS.indexOf(provider) === -1;
    if (!keyed) return { status: "empty", message: "" };
    if (!key) return { status: "warning", message: "A key is required for " + provider + "." };
    var pattern = API_KEY_PATTERNS[provider];
    if (pattern && !pattern.re.test(key)) {
      return { status: "invalid", message: "Invalid format: a " + provider + " key " + pattern.hint + "." };
    }
    if (/\s/.test(rawKey)) {
      return { status: "invalid", message: "The key contains whitespace — please check it." };
    }
    return { status: "valid", message: "Key format looks valid." };
  }

  function loadManualKeys() {
    var keys = {};
    try {
      keys = JSON.parse(global.localStorage.getItem("osiris_manual_keys") || "{}");
    } catch(err) {
      keys = {};
    }
    return Promise.resolve(keys);
  }

  function saveManualKeys(keys) {
    global.localStorage.setItem("osiris_manual_keys", JSON.stringify(keys));
  }

  function clearManualKeys() {
    global.localStorage.removeItem("osiris_manual_keys");
  }

  function loadManualModels() {
    try {
      return JSON.parse(global.localStorage.getItem("osiris_manual_models") || "{}");
    } catch(err) {
      return {};
    }
  }

  function saveManualModels(models) {
    global.localStorage.setItem("osiris_manual_models", JSON.stringify(models));
  }

  /* ---------------- File handle store (§5 / §9.6) ----------------
     IndexedDB store for FileSystemFileHandle objects, keyed by book id.
     Handles are opaque objects that can't be JSON.stringify'd into
     localStorage (that's why the schema's book.fileHandle field is just
     a boolean flag, not the handle itself — the real handle lives here).
     Chromium only: callers must feature-detect `showOpenFilePicker`
     before offering this path and fall back to book.link otherwise. */
  var FH_DB_NAME = "osiris_file_handles_db";
  var FH_STORE = "handles";


  var BLOB_STORE = "blobs";
  var _fhDbPromise = null;

  function _openHandleDb() {
    if (_fhDbPromise) return _fhDbPromise;
    _fhDbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error("indexedDB unavailable")); return; }
      var req = global.indexedDB.open(FH_DB_NAME, 2);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(FH_STORE)) {
          req.result.createObjectStore(FH_STORE);
        }
        if (!req.result.objectStoreNames.contains(BLOB_STORE)) {
          req.result.createObjectStore(BLOB_STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return _fhDbPromise;
  }


  function saveFileBlob(bookId, blob) {
    return _openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(BLOB_STORE, "readwrite");
        tx.objectStore(BLOB_STORE).put(blob, bookId);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return false; });
  }

  function getFileBlob(bookId) {
    return _openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(BLOB_STORE, "readonly");
        var req = tx.objectStore(BLOB_STORE).get(bookId);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function deleteFileBlob(bookId) {
    return _openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(BLOB_STORE, "readwrite");
        tx.objectStore(BLOB_STORE).delete(bookId);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return false; });
  }


  function openFileBlob(bookId) {
    return getFileBlob(bookId).then(function (blob) {
      if (!blob) return "unavailable";
      var url = URL.createObjectURL(blob);
      global.open(url, "_blank");
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return "opened";
    });
  }


  function fileHandlesSupported() {
    return typeof global.showOpenFilePicker === "function";
  }

  function saveFileHandle(bookId, handle) {
    return _openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FH_STORE, "readwrite");
        tx.objectStore(FH_STORE).put(handle, bookId);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return false; });
  }

  function getFileHandle(bookId) {
    return _openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FH_STORE, "readonly");
        var req = tx.objectStore(FH_STORE).get(bookId);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function deleteFileHandle(bookId) {
    return _openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FH_STORE, "readwrite");
        tx.objectStore(FH_STORE).delete(bookId);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return false; });
  }


  function pickFileHandle(options) {
    if (!fileHandlesSupported()) return Promise.resolve(null);
    return global.showOpenFilePicker(options || {}).then(function (handles) {
      return handles && handles[0] ? handles[0] : null;
    }).catch(function (err) {
      if (err && err.name === "AbortError") return null; // user cancelled — not an error


      throw err;
    });
  }


  function resolveFileHandle(handle) {
    if (!handle || typeof handle.queryPermission !== "function") return Promise.resolve(null);
    return handle.queryPermission({ mode: "read" }).then(function (state) {
      if (state === "granted") return true;
      return handle.requestPermission({ mode: "read" }).then(function (s) { return s === "granted"; });
    }).then(function (granted) {
      if (!granted) return null;
      return handle.getFile();
    }).catch(function () {
      return null;
    });
  }


  function openFileHandle(handle) {
    return resolveFileHandle(handle).then(function (file) {
      if (!file) return "unavailable";
      var url = URL.createObjectURL(file);
      global.open(url, "_blank");
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return "opened";
    });
  }

  /* ---------------- AI Classifier (§7 AI Sorting) ----------------
     Batch classification of books into {theme, cecr} using whatever
     provider(s) have a key present, in FREE_MODELS declaration order,
     with automatic failover to the next provider on any error.

     IMPORTANT LIMITATION (as of this pass): no shelf extracts real
     text from an opened PDF/EPUB yet (that's workplan §9, the text
     extractor) — only cover art is extracted today. So every result
     from this file is metadata-only and always tagged
     confidence:"estimated", per the §7 spec's "link-only entry" branch.
     Once §9 ships and a real excerpt is available, a caller can pass
     it via the `excerpt` field on an entry and this file will use it
     (confidence becomes "excerpt") — the classifier already branches
     on that, only no caller populates it yet. */

  var CHAT_ENDPOINTS = {
    cerebras: "https://api.cerebras.ai/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
    github: "https://models.github.ai/inference/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    huggingface: "https://router.huggingface.co/v1/chat/completions",
    pollinations: "https://text.pollinations.ai/openai",
    google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  };


  var PROVIDER_FAILOVER_ORDER = [
    "cerebras", "groq", "google", "nvidia", "github",
    "cloudflare", "openrouter", "huggingface", "pollinations"
  ];


  function pickActiveModel(preferredProvider) {
    return loadManualKeys().then(function (keys) {
      var models = loadManualModels();
      var order = PROVIDER_FAILOVER_ORDER.slice();
      if (preferredProvider) {
        order = [preferredProvider].concat(order.filter(function (p) { return p !== preferredProvider; }));
      }
      for (var i = 0; i < order.length; i++) {
        var p = order[i];
        if (!keys[p] && KEYLESS_PROVIDERS.indexOf(p) === -1) continue;
        var modelList = FREE_MODELS[p] || [];
        if (!modelList.length) continue;
        var savedId = models[p];
        var m = (savedId && modelList.filter(function (x) { return x.id === savedId; })[0]) || modelList[0];
        return { provider: p, id: m.id, name: m.label };
      }
      return null;
    });
  }


  function generateWithFailover(preferredProvider, systemPrompt, userPrompt, signal) {
    return loadManualKeys().then(function (keys) {
      var models = loadManualModels();
      var order = PROVIDER_FAILOVER_ORDER.slice();
      if (preferredProvider) {
        order = [preferredProvider].concat(order.filter(function (p) { return p !== preferredProvider; }));
      }
      var candidates = order.filter(function (p) { return !!keys[p] || KEYLESS_PROVIDERS.indexOf(p) !== -1; });
      if (!candidates.length) return Promise.reject(new Error("no API key configured for any provider"));

      var errors = [];
      function tryNext(i) {
        if (i >= candidates.length) {
          return Promise.reject(new Error("all providers failed — " + errors.join("; ")));
        }
        var provider = candidates[i];
        var modelList = FREE_MODELS[provider] || [];
        if (!modelList.length) return tryNext(i + 1);
        var savedId = models[provider];
        var m = (savedId && modelList.filter(function (x) { return x.id === savedId; })[0]) || modelList[0];
        return _callProvider(provider, keys[provider], m.id, systemPrompt, userPrompt, signal)
          .then(function (text) {
            return { text: text, provider: provider, id: m.id, name: m.label };
          })
          .catch(function (err) {
            if (err && err.name === "AbortError") throw err;
            errors.push(provider + ": " + (err && err.message || err));
            return tryNext(i + 1);
          });
      }
      return tryNext(0);
    });
  }

  function _extractJson(text) {
    var cleaned = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
    var start = cleaned.indexOf("[");
    var end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) throw new Error("no JSON array in response");
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function _callOpenAiCompatible(provider, key, model, systemPrompt, userPrompt, signal) {
    return fetch(CHAT_ENDPOINTS[provider], {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2
      }),
      signal: signal
    }).then(function (res) {
      if (!res.ok) throw new Error(provider + " HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new Error(provider + " returned an empty response");
      return text;
    });
  }


  function _callCloudflare(key, model, systemPrompt, userPrompt, signal) {
    var parts = String(key || "").split(":");
    var accountId = parts[0], token = parts[1];
    var url = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/ai/v1/chat/completions";
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ model: model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] }),
      signal: signal
    }).then(function (res) {
      if (!res.ok) throw new Error("cloudflare HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new Error("cloudflare returned an empty response");
      return text;
    });
  }


  function _callProvider(provider, key, model, systemPrompt, userPrompt, signal) {
    if (provider === "cloudflare") return _callCloudflare(key, model, systemPrompt, userPrompt, signal);
    return _callOpenAiCompatible(provider, key, model, systemPrompt, userPrompt, signal);
  }

  var CLASSIFY_SYSTEM_PROMPT =
    "You are a librarian tagging books for a personal library app. Given a JSON array of " +
    "books (title, author, category, comment, and sometimes excerpt — a short plain-text " +
    "sample pulled from the actual file), reply with ONLY a JSON array of the same length, " +
    "in the same order, of objects: {\"theme\": string, \"cecr\": one of " +
    "\"A1\",\"A2\",\"B1\",\"B2\",\"C1\",\"C2\", or null if not applicable (e.g. non-fiction " +
    "reference, or the language level can't reasonably be guessed)}. theme is a short " +
    "1-3 word genre/subject label. When excerpt is present and substantive, weigh it over " +
    "title/category for both theme and CECR level — it's real evidence of the book's actual " +
    "language and content, not just a label. When excerpt is absent, empty, or looks like " +
    "boilerplate (a copyright page, a blank title page) rather than real body text, fall back " +
    "to title/author/category/comment as before. No prose, no markdown fences, just the JSON array.";


  var MAX_EXCERPT_CHARS_FOR_PROMPT = 700;


  function aiClassifyBatch(entries) {
    return loadManualKeys().then(function (keys) {
      keys = keys || {};
      var candidates = PROVIDER_FAILOVER_ORDER.filter(function (p) { return !!keys[p] || KEYLESS_PROVIDERS.indexOf(p) !== -1; });
      if (!candidates.length) return Promise.reject(new Error("no API key available"));

      var trimmedExcerpts = entries.map(function (e) {
        return (e.excerpt || "").slice(0, MAX_EXCERPT_CHARS_FOR_PROMPT);
      });
      var userPrompt = JSON.stringify(entries.map(function (e, i) {
        var out = { title: e.title || "", author: e.author || "", category: e.category || "", comment: e.comment || "" };
        if (trimmedExcerpts[i]) out.excerpt = trimmedExcerpts[i];
        return out;
      }));

      function tryNext(i) {
        if (i >= candidates.length) return Promise.reject(new Error("all providers failed"));
        var provider = candidates[i];
        var models = FREE_MODELS[provider];
        var model = models && models[0] && models[0].id;
        if (!model) return tryNext(i + 1);
        return _callProvider(provider, keys[provider], model, CLASSIFY_SYSTEM_PROMPT, userPrompt)
          .then(function (text) {
            var parsed = _extractJson(text);
            if (!Array.isArray(parsed) || parsed.length !== entries.length) {
              throw new Error(provider + " returned a malformed/mismatched array");
            }
            return parsed.map(function (tag, i) {
              return {
                theme: (tag && tag.theme) || null,
                cecr: (tag && tag.cecr) || null,
                confidence: trimmedExcerpts[i] ? "text-based" : "estimated",
                provider: provider,
                taggedAt: Date.now()
              };
            });
          })
          .catch(function () { return tryNext(i + 1); });
      }
      return tryNext(0);
    });
  }

  /* ---------------- Core Utilities ---------------- */
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"'`=\/]/g, function (s) {
      return {
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;"
      }[s];
    });
  }


  var SORT_KEY_PATHS = {
    name: "title",
    date: "addedAt",
    size: "fileMeta.size",
    opens: "openCount",
    category: "category",
    theme: "aiTags.theme",
    cecr: "aiTags.cecr"
  };

  function getField(obj, path) {
    var parts = path.split(".");
    var val = obj;
    for (var i = 0; i < parts.length; i++) {
      if (val === null || val === undefined) return undefined;
      val = val[parts[i]];
    }
    return val;
  }

  function sortBooks(books, key, dir) {
    if (!books || !Array.isArray(books)) return [];
    var path = SORT_KEY_PATHS[key] || key; // fall back to key itself if an unmapped/flat key is passed
    var sorted = books.slice().sort(function(a, b) {
       var valA = getField(a, path);
       var valB = getField(b, path);
       var aMissing = valA === undefined || valA === null || valA === "";
       var bMissing = valB === undefined || valB === null || valB === "";
       if (aMissing && bMissing) return 0;
       if (aMissing) return 1;  // missing values sort last regardless of asc/desc
       if (bMissing) return -1;
       if (typeof valA === "string" && typeof valB === "string") {
         return valA.localeCompare(valB);
       }
       if (valA < valB) return -1;
       if (valA > valB) return 1;
       return 0;
    });
    if (dir === 'desc') sorted.reverse();
    return sorted.map(function(b) { return b.id; });
  }

  global.OsirisCore = {
    LIB_KEY: LIB_KEY,
    makeBookId: makeBookId,
    loadLibrary: loadLibrary,
    saveLibrary: saveLibrary,
    MSG: MSG,
    send: send,
    listen: listen,
    onVaultKeysReceived: onVaultKeysReceived,
    matchProviderId: matchProviderId,
    PROVIDERS: PROVIDERS,
    FREE_MODELS: FREE_MODELS,
    FREE_KEY_LINKS: FREE_KEY_LINKS,
    KEYLESS_PROVIDERS: KEYLESS_PROVIDERS,
    API_KEY_PATTERNS: API_KEY_PATTERNS,
    validateApiKey: validateApiKey,
    loadManualKeys: loadManualKeys,
    saveManualKeys: saveManualKeys,
    clearManualKeys: clearManualKeys,
    loadManualModels: loadManualModels,
    saveManualModels: saveManualModels,
    escapeHtml: escapeHtml,
    sortBooks: sortBooks,
    fileHandlesSupported: fileHandlesSupported,
    pickFileHandle: pickFileHandle,
    saveFileHandle: saveFileHandle,
    getFileHandle: getFileHandle,
    deleteFileHandle: deleteFileHandle,
    resolveFileHandle: resolveFileHandle,
    openFileHandle: openFileHandle,
    saveFileBlob: saveFileBlob,
    getFileBlob: getFileBlob,
    deleteFileBlob: deleteFileBlob,
    openFileBlob: openFileBlob,
    aiClassifyBatch: aiClassifyBatch,


    callProvider: _callProvider,
    pickActiveModel: pickActiveModel,
    generateWithFailover: generateWithFailover
  };
})(typeof window !== "undefined" ? window : this);
