/* ============================================================================
   cahier-sync.js — Hybrid Sync Engine for Cahier de Notes Pro
   Supports:
     1. Offline Direct / Animated Multi-Frame QR Codes (CNQ1, 0 internet)
     2. Instant 1-Scan LAN Wi-Fi Sync (CNQL, Desktop Portable <-> Android APK)
     3. Optional Online Zero-Knowledge E2EE Relay QR (CNQR, AES-256-GCM)
     4. Encrypted (.cahier) & Plain (.json) Database Transfer + Native Share
     5. Conflict-Safe Smart Merge Preview + 1-Click Pre-Sync Rollback
   ============================================================================ */
(function (global) {
  'use strict';

  const ROLLBACK_KEY = 'cahier_sync_rollback_v1';
  const MAGIC_PLAIN = 'CAHIER_SYNC_V1';
  const MAGIC_ENC = 'CAHIER_SYNC_ENC_V1';
  const RELAY_POST = 'https://bytebin.lucko.me/post';
  const RELAY_GET = 'https://bytebin.lucko.me/';
  const FRAME_CHUNK_LEN = 320;
  const MAX_SYNC_FILE_BYTES = 12 * 1024 * 1024;

  let hooks = null;
  let envInfo = { mode: 'web', lanAvailable: false, lanOrigin: '', deviceLabel: 'Navigateur Web' };

  let animTimer = null;
  let animFrames = [];
  let animIdx = 0;
  let animPaused = false;
  let animSpeedMs = 450;
  let lanInboxPollTimer = null;
  let activeLanInboxToken = null;
  let activeLanInboxKey = null;

  let scanStream = null;
  let scanRaf = null;
  let scanActive = false;
  let scanSessionId = null;
  let scanTotalFrames = 0;
  let scanCompFlag = '0';
  let scanExpectedCrc = '';
  let scanChunks = new Map();
  let barcodeDetector = null;
  let lastScanTick = 0;
  let pendingIncoming = null;

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function bytesToB64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64Url(bytes) {
    return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64UrlToBytes(str) {
    let b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return b64ToBytes(b64);
  }

  function utf8ToB64(str) {
    return bytesToB64(new TextEncoder().encode(str));
  }

  function randomBytes(len) {
    const arr = new Uint8Array(len);
    if (global.crypto && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }

  function shortId(len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const b = randomBytes(len || 6);
    let out = '';
    for (let i = 0; i < b.length; i++) out += chars[b[i] % chars.length];
    return out;
  }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32Hex(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
  }

  async function compressText(str) {
    const raw = new TextEncoder().encode(str);
    if (typeof CompressionStream === 'function') {
      try {
        const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const buf = await new Response(stream).arrayBuffer();
        const comp = new Uint8Array(buf);
        if (comp.length < raw.length) {
          return { bytes: comp, flag: '1' };
        }
      } catch (_) {}
    }
    return { bytes: raw, flag: '0' };
  }

  async function decompressText(bytes, flag) {
    if (flag === '1') {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('Ce navigateur ne supporte pas la décompression deflate-raw.');
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const buf = await new Response(stream).arrayBuffer();
      return new TextDecoder().decode(buf);
    }
    return new TextDecoder().decode(bytes);
  }

  function requireSubtleCrypto() {
    if (!global.crypto || !crypto.subtle) {
      throw new Error('Web Crypto indisponible (ouvrez via le lanceur Portable, HTTPS ou l\'APK Android).');
    }
    return crypto.subtle;
  }

  async function encryptRawAes(plainText, rawKeyBytes) {
    const subtle = requireSubtleCrypto();
    const key = await subtle.importKey('raw', rawKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = randomBytes(12);
    const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plainText));
    return {
      iv: bytesToB64Url(iv),
      data: bytesToB64Url(new Uint8Array(cipher))
    };
  }

  async function decryptRawAes(ivB64u, dataB64u, rawKeyBytes) {
    const subtle = requireSubtleCrypto();
    const key = await subtle.importKey('raw', rawKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = b64UrlToBytes(ivB64u);
    const cipher = b64UrlToBytes(dataB64u);
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  }

  async function derivePinKey(pin, salt, iterations) {
    const subtle = requireSubtleCrypto();
    const base = await subtle.importKey('raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: iterations || 100000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptWithPin(plainText, pin, meta) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const iterations = 100000;
    const key = await derivePinKey(pin, salt, iterations);
    const cipher = await requireSubtleCrypto().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plainText));
    return {
      magic: MAGIC_ENC,
      version: 1,
      meta: meta || {},
      salt: bytesToB64(salt),
      iv: bytesToB64(iv),
      iterations,
      ciphertext: bytesToB64(new Uint8Array(cipher))
    };
  }

  async function decryptWithPin(envelope, pin) {
    const salt = b64ToBytes(envelope.salt);
    const iv = b64ToBytes(envelope.iv);
    const cipher = b64ToBytes(envelope.ciphertext);
    const key = await derivePinKey(pin, salt, envelope.iterations || 100000);
    const plain = await requireSubtleCrypto().decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  }

  function isPrivateLanOrigin(originStr) {
    try {
      const u = new URL(originStr);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const h = u.hostname;
      if (h === '127.0.0.1' || h === 'localhost') return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      const m172 = h.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/);
      if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  async function detectEnvironment() {
    if (global.AndroidBridge) {
      let model = 'Android APK';
      try {
        if (typeof global.AndroidBridge.getDeviceInfo === 'function') {
          const info = JSON.parse(global.AndroidBridge.getDeviceInfo() || '{}');
          if (info.model) model = 'Android (' + info.model + ')';
        }
      } catch (_) {}
      envInfo = { mode: 'android-apk', lanAvailable: false, lanOrigin: '', deviceLabel: model };
      return envInfo;
    }
    if (location.protocol === 'http:' && (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.search.includes('standalone=1')) {
      try {
        const res = await fetch('/api/sync/info', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.cahierSyncServer) {
            envInfo = {
              mode: 'portable-desktop',
              lanAvailable: !!data.lanOrigin,
              lanOrigin: data.lanOrigin || '',
              localOrigin: location.origin,
              deviceLabel: data.deviceName ? ('PC Portable (' + data.deviceName + ')') : 'PC Portable Desktop'
            };
            return envInfo;
          }
        }
      } catch (_) {}
    }
    envInfo = {
      mode: location.protocol === 'file:' ? 'standalone-file' : 'web',
      lanAvailable: false,
      lanOrigin: '',
      deviceLabel: location.protocol === 'file:' ? 'Cahier Standalone' : 'Portfolio Web'
    };
    return envInfo;
  }

  function normKey(wb) {
    const s = String(wb?.school || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const c = String(wb?.className || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return s + '||' + c;
  }

  function countStats(state) {
    const wbs = Object.values((state && state.workbooks) || {});
    const schools = new Set(wbs.map(w => w.school).filter(Boolean));
    let students = 0;
    wbs.forEach(w => { students += (Array.isArray(w.students) ? w.students.length : 0); });
    return { classes: wbs.length, schools: schools.size, students };
  }

  function buildPayload(scope) {
    const full = hooks.getState();
    let exportedState = full;
    if (scope === 'active') {
      const wb = hooks.getActiveWorkbook();
      if (wb) {
        const wbCopy = JSON.parse(JSON.stringify(wb));
        exportedState = {
          currentView: 'workbook',
          activeWorkbookId: wbCopy.id,
          activeTab: full.activeTab || '1',
          showCrossPreview: !!full.showCrossPreview,
          bulkEditStudents: false,
          activeMemory: full.activeMemory,
          workbooks: { [wbCopy.id]: wbCopy }
        };
      }
    }
    const stats = countStats(exportedState);
    return {
      magic: MAGIC_PLAIN,
      version: 1,
      scope: scope === 'active' ? 'active' : 'all',
      exportedAt: Date.now(),
      device: envInfo.deviceLabel,
      stats,
      state: exportedState
    };
  }

  function extractStateFromParsed(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('Données de synchronisation invalides.');
    let rawState = null;
    let meta = { device: 'Appareil distant', exportedAt: null, scope: 'all' };
    if (parsed.magic === MAGIC_PLAIN && parsed.state) {
      rawState = parsed.state;
      meta = {
        device: parsed.device || 'Appareil distant',
        exportedAt: parsed.exportedAt || null,
        scope: parsed.scope || 'all',
        stats: parsed.stats || null
      };
    } else if (parsed.workbooks && typeof parsed.workbooks === 'object') {
      const { exportMeta, ...rest } = parsed;
      rawState = rest;
      meta = {
        device: exportMeta?.filename || 'Fichier JSON',
        exportedAt: exportMeta?.exportedAt ? Date.parse(exportMeta.exportedAt) : null,
        scope: 'all'
      };
    } else {
      throw new Error('Format de base Cahier de Notes non reconnu.');
    }
    const clean = hooks.sanitizeState(rawState);
    if (!clean) throw new Error('Structure de données corrompue ou invalide.');
    return { state: clean, meta };
  }

  function computeDiff(localState, incomingState) {
    const localWbs = Object.values(localState.workbooks || {});
    const localById = new Map(localWbs.map(w => [w.id, w]));
    const localByPair = new Map(localWbs.map(w => [normKey(w), w]));

    const added = [];
    const updatedIncomingNewer = [];
    const keptLocalNewer = [];
    const equal = [];

    Object.values(incomingState.workbooks || {}).forEach(inc => {
      const match = localById.get(inc.id) || localByPair.get(normKey(inc)) || null;
      if (!match) {
        added.push(inc);
      } else {
        const incTs = Number(inc.updatedAt) || 0;
        const locTs = Number(match.updatedAt) || 0;
        const sameJson = JSON.stringify({ ...inc, id: '', updatedAt: 0 }) === JSON.stringify({ ...match, id: '', updatedAt: 0 });
        if (sameJson) {
          equal.push({ local: match, incoming: inc });
        } else if (incTs >= locTs) {
          updatedIncomingNewer.push({ local: match, incoming: inc });
        } else {
          keptLocalNewer.push({ local: match, incoming: inc });
        }
      }
    });

    const localOnly = localWbs.filter(loc => {
      const pair = normKey(loc);
      return !Object.values(incomingState.workbooks || {}).some(inc => inc.id === loc.id || normKey(inc) === pair);
    });

    return { added, updatedIncomingNewer, keptLocalNewer, equal, localOnly };
  }

  function mergeMemory(localMem, incMem) {
    const uniq = (a, b) => {
      const out = [];
      const seen = new Set();
      [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(v => {
        const s = String(v || '').trim();
        if (s && !seen.has(s) && out.length < 100) { seen.add(s); out.push(s); }
      });
      return out;
    };
    return {
      schools: uniq(localMem?.schools, incMem?.schools),
      classes: uniq(localMem?.classes, incMem?.classes),
      customEvalTypes: uniq(localMem?.customEvalTypes, incMem?.customEvalTypes),
      evalWeights: Object.assign({}, localMem?.evalWeights || {}, incMem?.evalWeights || {}),
      subtitles: uniq(localMem?.subtitles, incMem?.subtitles)
    };
  }

  function applyIncomingState(incomingState, strategy) {
    const localState = hooks.getState();
    try {
      localStorage.setItem(ROLLBACK_KEY, JSON.stringify({ savedAt: Date.now(), state: localState }));
    } catch (_) {}

    let nextState;
    if (strategy === 'replace') {
      nextState = JSON.parse(JSON.stringify(incomingState));
    } else {
      nextState = JSON.parse(JSON.stringify(localState));
      nextState.workbooks = nextState.workbooks || {};
      const pairToLocalId = new Map();
      Object.values(nextState.workbooks).forEach(w => pairToLocalId.set(normKey(w), w.id));

      Object.values(incomingState.workbooks || {}).forEach(inc => {
        const matchId = nextState.workbooks[inc.id] ? inc.id : (pairToLocalId.get(normKey(inc)) || null);
        if (!matchId) {
          nextState.workbooks[inc.id] = JSON.parse(JSON.stringify(inc));
        } else {
          const loc = nextState.workbooks[matchId];
          const incTs = Number(inc.updatedAt) || 0;
          const locTs = Number(loc.updatedAt) || 0;
          if (strategy === 'incoming-wins' || incTs >= locTs) {
            const merged = JSON.parse(JSON.stringify(inc));
            merged.id = matchId;
            nextState.workbooks[matchId] = merged;
          }
        }
      });
      nextState.activeMemory = mergeMemory(nextState.activeMemory, incomingState.activeMemory);
    }

    const sanitized = hooks.sanitizeState(nextState);
    if (!sanitized) throw new Error('Échec de la validation après fusion.');
    hooks.setState(sanitized);
    if (typeof hooks.onAfterApply === 'function') hooks.onAfterApply();
    triggerPortableAutoBackup();
  }

  function rollbackLastSync() {
    try {
      const raw = localStorage.getItem(ROLLBACK_KEY);
      if (!raw) {
        hooks.showToast('Aucun point de restauration disponible.', 'info');
        return;
      }
      const snap = JSON.parse(raw);
      const clean = hooks.sanitizeState(snap && snap.state);
      if (!clean) throw new Error('Instantané invalide.');
      hooks.setState(clean);
      localStorage.removeItem(ROLLBACK_KEY);
      if (typeof hooks.onAfterApply === 'function') hooks.onAfterApply();
      updateRollbackVisibility();
      hooks.showToast('Synchronisation annulée — état précédent restauré.', 'success');
    } catch (e) {
      hooks.showToast('Impossible de restaurer : ' + e.message, 'error');
    }
  }

  async function triggerPortableAutoBackup() {
    if (envInfo.mode !== 'portable-desktop') return;
    try {
      const payload = buildPayload('all');
      await fetch('/api/sync/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (_) {}
  }

  async function deliverTextFile(text, filename, mime, preferShare) {
    if (global.AndroidBridge) {
      const b64 = utf8ToB64(text);
      if (preferShare && typeof global.AndroidBridge.shareFileBase64 === 'function') {
        global.AndroidBridge.shareFileBase64(b64, filename, mime);
        return 'android-share';
      }
      if (typeof global.AndroidBridge.saveFileBase64 === 'function') {
        global.AndroidBridge.saveFileBase64(b64, filename, mime);
        return 'android-save';
      }
    }

    const blob = new Blob([text], { type: mime });
    if (preferShare && navigator.canShare && typeof File !== 'undefined') {
      try {
        const f = new File([blob], filename, { type: mime });
        if (navigator.canShare({ files: [f] })) {
          await navigator.share({
            files: [f],
            title: 'Cahier de Notes Pro — Sauvegarde',
            text: 'Sauvegarde de votre Cahier de Notes.'
          });
          return 'web-share';
        }
      } catch (_) {}
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
    return 'download';
  }

  function stopQrAnimation() {
    if (animTimer) { clearInterval(animTimer); animTimer = null; }
  }

  function stopLanInboxPoll() {
    if (lanInboxPollTimer) { clearInterval(lanInboxPollTimer); lanInboxPollTimer = null; }
    activeLanInboxToken = null;
    activeLanInboxKey = null;
  }

  function renderQrCanvas(text) {
    const box = document.getElementById('csync-qr-canvas-box');
    if (!box) return;
    box.innerHTML = '';
    if (typeof global.QRCode === 'undefined') {
      box.innerHTML = '<div style="padding:18px;color:#b91c1c;font-size:12px;">Librairie QR indisponible.</div>';
      return;
    }
    const internalSize = 360;
    const displaySize = Math.min(228, Math.max(184, window.innerWidth - 110));
    new global.QRCode(box, {
      text,
      width: internalSize,
      height: internalSize,
      colorDark: '#0f172a',
      colorLight: '#ffffff',
      correctLevel: global.QRCode.CorrectLevel.L
    });
    box.querySelectorAll('canvas, img').forEach(el => {
      el.style.width = displaySize + 'px';
      el.style.height = displaySize + 'px';
      el.style.imageRendering = 'pixelated';
    });
  }

  function showAnimFrame(idx) {
    if (!animFrames.length) return;
    animIdx = ((idx % animFrames.length) + animFrames.length) % animFrames.length;
    renderQrCanvas(animFrames[animIdx]);
    const counter = document.getElementById('csync-anim-counter');
    if (counter) counter.textContent = `Trame ${animIdx + 1} / ${animFrames.length}`;
  }

  function startAnimLoop() {
    stopQrAnimation();
    if (animFrames.length <= 1) return;
    animTimer = setInterval(() => {
      if (!animPaused) showAnimFrame(animIdx + 1);
    }, animSpeedMs);
  }

  async function generateOfflineQr(scope) {
    stopQrAnimation();
    stopLanInboxPoll();
    const statusEl = document.getElementById('csync-send-status');
    const controlsEl = document.getElementById('csync-anim-controls');
    const copyBtn = document.getElementById('csync-copy-code-btn');
    if (statusEl) statusEl.textContent = 'Compression des données...';

    const payload = buildPayload(scope);
    const json = JSON.stringify(payload);
    const { bytes, flag } = await compressText(json);
    const crc = crc32Hex(bytes);
    const b64u = bytesToB64Url(bytes);
    const sid = shortId(5);

    const chunks = [];
    for (let i = 0; i < b64u.length; i += FRAME_CHUNK_LEN) {
      chunks.push(b64u.slice(i, i + FRAME_CHUNK_LEN));
    }
    const total = Math.max(1, chunks.length);
    animFrames = chunks.map((ch, i) => `CNQ1|${sid}|${i + 1}/${total}|${flag}|${crc}|${ch}`);
    animIdx = 0;
    animPaused = false;

    showAnimFrame(0);
    if (controlsEl) controlsEl.classList.toggle('hidden', total <= 1);
    if (copyBtn) {
      copyBtn.classList.remove('hidden');
      copyBtn.dataset.code = animFrames.join('\n');
    }

    const kb = (bytes.length / 1024).toFixed(1);
    if (total === 1) {
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge ok">1 QR statique • ${kb} Ko</span> Scannez une seule fois avec l'APK ou le PC (100 % hors-ligne).`;
    } else {
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge info">${total} trames QR animées • ${kb} Ko</span> Gardez la caméra pointée jusqu'à 100 % (100 % hors-ligne).`;
      startAnimLoop();
    }
  }

  async function generateLanPushQr(scope) {
    stopQrAnimation();
    stopLanInboxPoll();
    const statusEl = document.getElementById('csync-send-status');
    const controlsEl = document.getElementById('csync-anim-controls');
    if (controlsEl) controlsEl.classList.add('hidden');
    if (!envInfo.lanAvailable) {
      if (statusEl) statusEl.innerHTML = '<span class="csync-badge warn">Serveur LAN non actif</span> Lancez via <b>Lancer_Cahier_de_Notes.bat</b> pour le Wi-Fi local instantané.';
      return;
    }
    try {
      if (statusEl) statusEl.textContent = 'Chiffrement AES-256-GCM pour transfert Wi-Fi local...';
      const payload = buildPayload(scope);
      const rawKey = randomBytes(32);
      const enc = await encryptRawAes(JSON.stringify(payload), rawKey);
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iv: enc.iv, data: enc.data })
      });
      if (!res.ok) throw new Error('Le serveur LAN local a refusé la session.');
      const out = await res.json();
      const qrStr = `CNQL|pull|${envInfo.lanOrigin}|${out.token}|${bytesToB64Url(rawKey)}`;
      animFrames = [qrStr];
      renderQrCanvas(qrStr);
      const copyBtn = document.getElementById('csync-copy-code-btn');
      if (copyBtn) { copyBtn.classList.remove('hidden'); copyBtn.dataset.code = qrStr; }
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge ok">Wi-Fi Local Chiffré • 1 Scan</span> Scannez avec l'APK Android connecté au même Wi-Fi / partage de connexion (${esc(envInfo.lanOrigin)}).`;
    } catch (err) {
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Erreur LAN</span> ${esc(err.message)}`;
    }
  }

  async function generateLanReceiveQr() {
    stopQrAnimation();
    stopLanInboxPoll();
    const statusEl = document.getElementById('csync-send-status');
    const controlsEl = document.getElementById('csync-anim-controls');
    if (controlsEl) controlsEl.classList.add('hidden');
    if (!envInfo.lanAvailable) {
      if (statusEl) statusEl.innerHTML = '<span class="csync-badge warn">Serveur LAN non actif</span> Lancez via <b>Lancer_Cahier_de_Notes.bat</b>.';
      return;
    }
    try {
      if (statusEl) statusEl.textContent = 'Ouverture de la boîte de réception Wi-Fi chiffrée...';
      const rawKey = randomBytes(32);
      const res = await fetch('/api/sync/inbox/create', { method: 'POST' });
      if (!res.ok) throw new Error('Impossible de créer la session de réception LAN.');
      const out = await res.json();
      activeLanInboxToken = out.token;
      activeLanInboxKey = rawKey;

      const qrStr = `CNQL|push|${envInfo.lanOrigin}|${out.token}|${bytesToB64Url(rawKey)}`;
      animFrames = [qrStr];
      renderQrCanvas(qrStr);
      const copyBtn = document.getElementById('csync-copy-code-btn');
      if (copyBtn) { copyBtn.classList.remove('hidden'); copyBtn.dataset.code = qrStr; }
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge info">En attente de l'APK Android...</span> Scannez ce QR depuis l'APK (onglet Scanner) pour envoyer ses notes vers ce PC !`;

      lanInboxPollTimer = setInterval(async () => {
        if (!activeLanInboxToken) return;
        try {
          const pr = await fetch(`/api/sync/inbox/poll/${encodeURIComponent(activeLanInboxToken)}`, { cache: 'no-store' });
          if (!pr.ok) return;
          const pdata = await pr.json();
          if (pdata && pdata.ready && pdata.iv && pdata.data) {
            const key = activeLanInboxKey;
            stopLanInboxPoll();
            const plain = await decryptRawAes(pdata.iv, pdata.data, key);
            const parsed = JSON.parse(plain);
            const extracted = extractStateFromParsed(parsed);
            showMergePreview(extracted.state, extracted.meta, 'Wi-Fi Local (APK → PC)');
          }
        } catch (_) {}
      }, 1200);
    } catch (err) {
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Erreur</span> ${esc(err.message)}`;
    }
  }

  async function generateOnlineRelayQr(scope) {
    stopQrAnimation();
    stopLanInboxPoll();
    const statusEl = document.getElementById('csync-send-status');
    const controlsEl = document.getElementById('csync-anim-controls');
    if (controlsEl) controlsEl.classList.add('hidden');
    try {
      if (statusEl) statusEl.textContent = 'Chiffrement AES-256-GCM et envoi vers le relais éphémère...';
      const payload = buildPayload(scope);
      const rawKey = randomBytes(32);
      const enc = await encryptRawAes(JSON.stringify(payload), rawKey);
      const res = await fetch(RELAY_POST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: 1, iv: enc.iv, data: enc.data })
      });
      if (!res.ok) throw new Error('Relais inaccessible (vérifiez la connexion Internet).');
      const data = await res.json();
      if (!data || !data.key) throw new Error('Clé de relais manquante.');
      const qrStr = `CNQR|${data.key}|${bytesToB64Url(rawKey)}`;
      animFrames = [qrStr];
      renderQrCanvas(qrStr);
      const copyBtn = document.getElementById('csync-copy-code-btn');
      if (copyBtn) { copyBtn.classList.remove('hidden'); copyBtn.dataset.code = qrStr; }
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge ok">Relais E2EE Zero-Knowledge • 1 Scan</span> La clé AES reste uniquement dans ce QR Code.`;
    } catch (err) {
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Hors-ligne ?</span> ${esc(err.message)} — utilisez le mode <b>QR Hors-Ligne</b>.`;
    }
  }

  function resetScanProgress() {
    scanSessionId = null;
    scanTotalFrames = 0;
    scanCompFlag = '0';
    scanExpectedCrc = '';
    scanChunks = new Map();
    renderScanPills();
  }

  function renderScanPills() {
    const wrap = document.getElementById('csync-scan-progress');
    if (!wrap) return;
    if (!scanTotalFrames) {
      wrap.innerHTML = '';
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    let pills = '';
    for (let i = 1; i <= scanTotalFrames; i++) {
      const done = scanChunks.has(i);
      pills += `<span class="csync-pill ${done ? 'done' : ''}">${i}</span>`;
    }
    wrap.innerHTML = `<div class="csync-progress-label">Trames capturées : <b>${scanChunks.size} / ${scanTotalFrames}</b></div><div class="csync-pills">${pills}</div>`;
  }

  function stopCameraScanner() {
    scanActive = false;
    if (scanRaf) { cancelAnimationFrame(scanRaf); scanRaf = null; }
    if (scanStream) {
      scanStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      scanStream = null;
    }
    const video = document.getElementById('csync-scan-video');
    if (video) { video.srcObject = null; video.classList.add('hidden'); }
    const startBtn = document.getElementById('csync-cam-start-btn');
    const stopBtn = document.getElementById('csync-cam-stop-btn');
    if (startBtn) startBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
  }

  async function startCameraScanner() {
    const statusEl = document.getElementById('csync-scan-status');
    const video = document.getElementById('csync-scan-video');
    const startBtn = document.getElementById('csync-cam-start-btn');
    const stopBtn = document.getElementById('csync-cam-stop-btn');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (statusEl) statusEl.innerHTML = '<span class="csync-badge warn">Caméra indisponible</span> Utilisez <b>Scanner une image</b> ou <b>Coller un code</b>.';
      return;
    }
    try {
      resetScanProgress();
      if (statusEl) statusEl.textContent = 'Activation de la caméra...';
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = scanStream;
      video.setAttribute('playsinline', 'true');
      video.classList.remove('hidden');
      await video.play();
      if (startBtn) startBtn.classList.add('hidden');
      if (stopBtn) stopBtn.classList.remove('hidden');
      if (statusEl) statusEl.innerHTML = '<span class="csync-badge info">Caméra active</span> Pointez vers un QR Code Cahier de Notes...';

      if (typeof global.BarcodeDetector === 'function' && !barcodeDetector) {
        try { barcodeDetector = new global.BarcodeDetector({ formats: ['qr_code'] }); } catch (_) { barcodeDetector = null; }
      }

      const offCanvas = document.createElement('canvas');
      const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      scanActive = true;

      const loop = async (ts) => {
        if (!scanActive) return;
        if (ts - lastScanTick >= 110 && video.readyState >= 2 && video.videoWidth > 0) {
          lastScanTick = ts;
          try {
            let decoded = null;
            if (barcodeDetector) {
              const codes = await barcodeDetector.detect(video);
              if (codes && codes.length && codes[0].rawValue) decoded = codes[0].rawValue;
            }
            if (!decoded && typeof global.jsQR === 'function') {
              const w = Math.min(640, video.videoWidth);
              const h = Math.round(video.videoHeight * (w / video.videoWidth));
              offCanvas.width = w;
              offCanvas.height = h;
              offCtx.drawImage(video, 0, 0, w, h);
              const imgData = offCtx.getImageData(0, 0, w, h);
              const res = global.jsQR(imgData.data, w, h, { inversionAttempts: 'dontInvert' });
              if (res && res.data) decoded = res.data;
            }
            if (decoded) {
              await handleScannedText(decoded);
            }
          } catch (_) {}
        }
        if (scanActive) scanRaf = requestAnimationFrame(loop);
      };
      scanRaf = requestAnimationFrame(loop);
    } catch (err) {
      stopCameraScanner();
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Caméra refusée</span> ${esc(err.message)}`;
    }
  }

  async function scanQrFromImageFile(file) {
    const statusEl = document.getElementById('csync-scan-status');
    if (!file) return;
    if (typeof global.jsQR !== 'function') {
      if (statusEl) statusEl.innerHTML = '<span class="csync-badge err">Décodeur absent</span>';
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Image illisible.'));
        img.src = url;
      });
      URL.revokeObjectURL(url);
      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const pad = 24;
      const canvas = document.createElement('canvas');
      canvas.width = w + pad * 2;
      canvas.height = h + pad * 2;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, w, h);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const res = global.jsQR(imgData.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (!res || !res.data) {
        if (statusEl) statusEl.innerHTML = '<span class="csync-badge warn">Aucun QR détecté</span> Assurez-vous que le QR est net et bien cadré.';
        return;
      }
      await handleScannedText(res.data);
    } catch (err) {
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Erreur</span> ${esc(err.message)}`;
    }
  }

  async function handleScannedText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return;
    const statusEl = document.getElementById('csync-scan-status');

    if (text.includes('\n') && text.startsWith('CNQ1|')) {
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        await handleScannedText(line);
      }
      return;
    }

    if (text.startsWith('CNQ1|')) {
      const parts = text.split('|');
      if (parts.length < 6) return;
      const sid = parts[1];
      const [idxStr, totStr] = parts[2].split('/');
      const idx = parseInt(idxStr, 10);
      const tot = parseInt(totStr, 10);
      const flag = parts[3];
      const crc = parts[4];
      const chunk = parts.slice(5).join('|');
      if (!sid || !Number.isInteger(idx) || !Number.isInteger(tot) || idx < 1 || idx > tot || tot > 200) return;

      if (scanSessionId !== sid) {
        scanSessionId = sid;
        scanTotalFrames = tot;
        scanCompFlag = flag;
        scanExpectedCrc = crc;
        scanChunks = new Map();
      }
      if (!scanChunks.has(idx)) {
        scanChunks.set(idx, chunk);
        renderScanPills();
        if (statusEl) statusEl.innerHTML = `<span class="csync-badge info">Capture QR Hors-Ligne</span> Trame ${scanChunks.size}/${scanTotalFrames} reçue...`;
      }

      if (scanChunks.size === scanTotalFrames) {
        stopCameraScanner();
        try {
          let fullB64u = '';
          for (let i = 1; i <= scanTotalFrames; i++) fullB64u += scanChunks.get(i);
          const bytes = b64UrlToBytes(fullB64u);
          if (crc32Hex(bytes) !== scanExpectedCrc) {
            throw new Error('Somme de contrôle CRC32 invalide — réessayez le scan.');
          }
          const jsonText = await decompressText(bytes, scanCompFlag);
          const parsed = JSON.parse(jsonText);
          const extracted = extractStateFromParsed(parsed);
          const isSingleFrame = tot === 1;
          resetScanProgress();
          showMergePreview(extracted.state, extracted.meta, isSingleFrame ? 'QR Code Hors-Ligne' : `QR Animé (${tot} trames)`);
        } catch (err) {
          resetScanProgress();
          if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Erreur QR</span> ${esc(err.message)}`;
        }
      }
      return;
    }

    if (text.startsWith('CNQL|')) {
      stopCameraScanner();
      const parts = text.split('|');
      if (parts.length < 5) {
        if (statusEl) statusEl.innerHTML = '<span class="csync-badge err">Code LAN incomplet</span>';
        return;
      }
      const mode = parts[1];
      const lanOrigin = parts[2];
      const token = parts[3];
      const keyB64u = parts[4];
      if (!isPrivateLanOrigin(lanOrigin)) {
        if (statusEl) statusEl.innerHTML = '<span class="csync-badge err">Bloqué (sécurité)</span> Adresse LAN non privée refusée.';
        return;
      }
      try {
        const rawKey = b64UrlToBytes(keyB64u);
        if (mode === 'pull') {
          if (statusEl) statusEl.textContent = 'Réception chiffrée depuis le PC en Wi-Fi local...';
          const res = await fetch(`${lanOrigin}/api/sync/pull/${encodeURIComponent(token)}`, { cache: 'no-store' });
          if (!res.ok) throw new Error('Session Wi-Fi expirée ou PC inaccessible sur ce réseau.');
          const env = await res.json();
          const plain = await decryptRawAes(env.iv, env.data, rawKey);
          const extracted = extractStateFromParsed(JSON.parse(plain));
          showMergePreview(extracted.state, extracted.meta, 'Wi-Fi Local (PC → Mobile)');
        } else if (mode === 'push') {
          if (statusEl) statusEl.textContent = 'Chiffrement et envoi de vos notes vers le PC en Wi-Fi local...';
          const payload = buildPayload('all');
          const enc = await encryptRawAes(JSON.stringify(payload), rawKey);
          const res = await fetch(`${lanOrigin}/api/sync/inbox/upload/${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ iv: enc.iv, data: enc.data })
          });
          if (!res.ok) throw new Error('Envoi Wi-Fi refusé ou session expirée.');
          if (statusEl) statusEl.innerHTML = '<span class="csync-badge ok">Envoyé au PC !</span> Confirmez la fusion sur l\'écran de votre ordinateur.';
          hooks.showToast('Données transmises au PC via Wi-Fi local !', 'success');
        }
      } catch (err) {
        if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Erreur Wi-Fi Local</span> ${esc(err.message)}`;
      }
      return;
    }

    if (text.startsWith('CNQR|')) {
      stopCameraScanner();
      const parts = text.split('|');
      if (parts.length < 3) return;
      const relayKey = parts[1];
      const keyB64u = parts[2];
      try {
        if (statusEl) statusEl.textContent = 'Téléchargement chiffré depuis le relais éphémère...';
        const res = await fetch(RELAY_GET + encodeURIComponent(relayKey), { cache: 'no-store' });
        if (!res.ok) throw new Error('Session expirée ou introuvable sur le relais.');
        const env = await res.json();
        const plain = await decryptRawAes(env.iv, env.data, b64UrlToBytes(keyB64u));
        const extracted = extractStateFromParsed(JSON.parse(plain));
        showMergePreview(extracted.state, extracted.meta, 'Relais Internet Chiffré E2EE');
      } catch (err) {
        if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Erreur Relais</span> ${esc(err.message)}`;
      }
      return;
    }

    if (statusEl) statusEl.innerHTML = '<span class="csync-badge warn">QR non reconnu</span> Ce code ne provient pas de Cahier de Notes Pro.';
  }

  function showMergePreview(incomingState, meta, sourceLabel) {
    pendingIncoming = { state: incomingState, meta, sourceLabel };
    const diff = computeDiff(hooks.getState(), incomingState);
    const incStats = countStats(incomingState);
    const dateTxt = meta?.exportedAt ? new Date(meta.exportedAt).toLocaleString('fr-FR') : 'Maintenant';

    const previewEl = document.getElementById('csync-merge-preview');
    const tabsBody = document.getElementById('csync-tabs-body');
    if (tabsBody) tabsBody.classList.add('hidden');
    if (!previewEl) return;

    const listAdded = diff.added.map(w => `<li><span class="csync-dot add"></span><b>${esc(w.className)}</b> (${esc(w.school)}) — ${(w.students || []).length} élèves</li>`).join('');
    const listUpd = diff.updatedIncomingNewer.map(x => `<li><span class="csync-dot upd"></span><b>${esc(x.incoming.className)}</b> (${esc(x.incoming.school)}) — version entrante plus récente</li>`).join('');
    const listKept = diff.keptLocalNewer.map(x => `<li><span class="csync-dot keep"></span><b>${esc(x.local.className)}</b> (${esc(x.local.school)}) — version locale plus récente (protégée en fusion)</li>`).join('');

    previewEl.innerHTML = `
      <div class="csync-preview-card">
        <div class="csync-preview-head">
          <div>
            <div class="csync-preview-title">Données de synchronisation reçues</div>
            <div class="csync-preview-sub">${esc(sourceLabel)} • ${esc(meta?.device || 'Appareil distant')} • ${esc(dateTxt)}</div>
          </div>
          <span class="csync-badge ok">${incStats.classes} classe(s) • ${incStats.students} élève(s)</span>
        </div>

        <div class="csync-diff-grid">
          <div class="csync-diff-box add"><div class="num">+${diff.added.length}</div><div class="lbl">Nouvelles</div></div>
          <div class="csync-diff-box upd"><div class="num">${diff.updatedIncomingNewer.length}</div><div class="lbl">Mises à jour</div></div>
          <div class="csync-diff-box keep"><div class="num">${diff.keptLocalNewer.length + diff.localOnly.length}</div><div class="lbl">Protégées</div></div>
          <div class="csync-diff-box eq"><div class="num">${diff.equal.length}</div><div class="lbl">Identiques</div></div>
        </div>

        ${(listAdded || listUpd || listKept) ? `<ul class="csync-diff-list">${listAdded}${listUpd}${listKept}</ul>` : '<p class="csync-muted">Toutes les classes entrantes sont déjà identiques à votre base locale.</p>'}

        <div class="csync-strategy-box">
          <label class="csync-radio-opt">
            <input type="radio" name="csync-strategy" value="smart" checked />
            <div><b>Fusion Intelligente (Recommandé)</b><span>Ajoute les nouvelles classes, met à jour les plus anciennes et garde vos modifications locales plus récentes.</span></div>
          </label>
          <label class="csync-radio-opt">
            <input type="radio" name="csync-strategy" value="incoming-wins" />
            <div><b>Fusion (Priorité entrant)</b><span>Garde vos autres classes locales, mais remplace chaque classe commune par la version reçue.</span></div>
          </label>
          <label class="csync-radio-opt">
            <input type="radio" name="csync-strategy" value="replace" />
            <div><b>Remplacement Complet</b><span>Remplace intégralement la base locale par celle reçue (annulable en 1 clic).</span></div>
          </label>
        </div>

        <div class="csync-preview-actions">
          <button type="button" id="csync-cancel-preview-btn" class="csync-btn ghost">Annuler</button>
          <button type="button" id="csync-apply-preview-btn" class="csync-btn primary">Appliquer la synchronisation</button>
        </div>
      </div>
    `;
    previewEl.classList.remove('hidden');

    document.getElementById('csync-cancel-preview-btn').onclick = () => {
      pendingIncoming = null;
      previewEl.classList.add('hidden');
      if (tabsBody) tabsBody.classList.remove('hidden');
    };
    document.getElementById('csync-apply-preview-btn').onclick = () => {
      const checked = previewEl.querySelector('input[name="csync-strategy"]:checked');
      const strat = checked ? checked.value : 'smart';
      try {
        applyIncomingState(pendingIncoming.state, strat);
        pendingIncoming = null;
        closeModal();
        hooks.showToast('Synchronisation appliquée avec succès !', 'success');
      } catch (err) {
        hooks.showToast('Erreur d\'application : ' + err.message, 'error');
      }
    };
  }

  async function handleFileExport(preferShare) {
    const pinInput = document.getElementById('csync-file-pin');
    const scopeSel = document.getElementById('csync-file-scope');
    const pin = String(pinInput?.value || '').trim();
    const scope = scopeSel ? scopeSel.value : 'all';

    try {
      const payload = buildPayload(scope);
      const info = hooks.buildExportInfo(scope === 'active' ? hooks.getActiveWorkbook() : null);
      let fileText, filename, mime;

      if (pin.length > 0) {
        const enc = await encryptWithPin(JSON.stringify(payload), pin, {
          device: envInfo.deviceLabel,
          exportedAt: payload.exportedAt,
          stats: payload.stats
        });
        fileText = JSON.stringify(enc, null, 2);
        filename = info.filename.replace(/\.json$/i, '.cahier');
        mime = 'application/octet-stream';
      } else {
        const plainPayload = Object.assign({ exportMeta: info.exportMeta }, payload.state);
        fileText = JSON.stringify(plainPayload, null, 2);
        filename = info.filename;
        mime = 'application/json';
      }

      const via = await deliverTextFile(fileText, filename, mime, preferShare);
      if (via === 'download') {
        hooks.showToast(`Fichier exporté : ${filename}`, 'success');
      } else if (via === 'web-share') {
        hooks.showToast('Partage natif lancé.', 'success');
      }
      if (pinInput) pinInput.value = '';
    } catch (err) {
      hooks.showToast('Erreur d\'export : ' + err.message, 'error');
    }
  }

  async function handleFileImport(file) {
    if (!file) return;
    if (file.size > MAX_SYNC_FILE_BYTES) {
      hooks.showToast('Fichier trop volumineux (max 12 Mo).', 'error');
      return;
    }
    const statusEl = document.getElementById('csync-file-status');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && parsed.magic === MAGIC_ENC) {
        const pin = window.prompt('Ce fichier .cahier est chiffré. Entrez le code PIN / mot de passe :');
        if (!pin) return;
        const plain = await decryptWithPin(parsed, pin.trim());
        const extracted = extractStateFromParsed(JSON.parse(plain));
        showMergePreview(extracted.state, extracted.meta, `Fichier chiffré (${file.name})`);
      } else {
        const extracted = extractStateFromParsed(parsed);
        showMergePreview(extracted.state, extracted.meta, `Fichier base (${file.name})`);
      }
      if (statusEl) statusEl.textContent = '';
    } catch (err) {
      if (statusEl) statusEl.innerHTML = `<span class="csync-badge err">Échec d'import</span> ${esc(err.message || 'PIN incorrect ou fichier invalide.')}`;
    }
  }

  function injectStyles() {
    if (document.getElementById('cahier-sync-styles')) return;
    const style = document.createElement('style');
    style.id = 'cahier-sync-styles';
    style.textContent = `
      .csync-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.62); backdrop-filter: blur(4px); z-index: 120; display: flex; align-items: center; justify-content: center; padding: 14px; }
      .csync-overlay.hidden { display: none !important; }
      .csync-modal { width: 100%; max-width: 560px; max-height: 92vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(15,23,42,.32); display: flex; flex-direction: column; overflow: hidden; color: #0f172a; font-family: inherit; }
      .csync-head { background: linear-gradient(135deg, #0e7490 0%, #1e40af 100%); color: #fff; padding: 15px 18px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .csync-head-title { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 16px; }
      .csync-head-sub { font-size: 11px; opacity: .88; font-weight: 500; }
      .csync-close { background: rgba(255,255,255,.16); border: none; color: #fff; width: 32px; height: 32px; border-radius: 9px; font-size: 20px; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
      .csync-close:hover { background: rgba(255,255,255,.28); }
      .csync-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
      .csync-tab { border: 1px solid #cbd5e1; background: #fff; color: #334155; border-radius: 10px; padding: 8px 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; transition: all .15s; }
      .csync-tab.active { background: #0e7490; color: #fff; border-color: #0e7490; box-shadow: 0 2px 8px rgba(14,116,144,.28); }
      .csync-body { padding: 16px; overflow-y: auto; flex: 1; }
      .csync-panel.hidden, .csync-hidden, .hidden { display: none !important; }
      .csync-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
      .csync-select, .csync-input { border: 1px solid #cbd5e1; border-radius: 9px; padding: 8px 10px; font-size: 13px; background: #fff; color: #0f172a; font-family: inherit; }
      .csync-input { width: 100%; box-sizing: border-box; }
      .csync-btn { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 10px; padding: 9px 13px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: all .15s; }
      .csync-btn:hover { background: #f1f5f9; }
      .csync-btn.primary { background: #0e7490; border-color: #0e7490; color: #fff; }
      .csync-btn.primary:hover { background: #155e75; }
      .csync-btn.emerald { background: #059669; border-color: #059669; color: #fff; }
      .csync-btn.emerald:hover { background: #047857; }
      .csync-btn.ghost { background: #f8fafc; color: #475569; }
      .csync-btn.sm { padding: 6px 10px; font-size: 11.5px; }
      .csync-mode-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-bottom: 10px; }
      .csync-mode-btn { border: 1.5px solid #e2e8f0; background: #f8fafc; border-radius: 11px; padding: 9px 10px; text-align: left; cursor: pointer; transition: all .15s; }
      .csync-mode-btn b { display: block; font-size: 12px; color: #0f172a; }
      .csync-mode-btn span { display: block; font-size: 10.5px; color: #64748b; margin-top: 2px; }
      .csync-mode-btn.active { border-color: #0e7490; background: #ecfeff; }
      .csync-qr-stage { background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 10px; min-height: 240px; justify-content: center; }
      #csync-qr-canvas-box { background: #fff; padding: 14px; border-radius: 12px; box-shadow: 0 4px 16px rgba(15,23,42,.08); display: inline-flex; align-items: center; justify-content: center; }
      #csync-qr-canvas-box img, #csync-qr-canvas-box canvas { display: block; max-width: 100%; height: auto; }
      .csync-status { font-size: 12px; color: #334155; text-align: center; line-height: 1.45; }
      .csync-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; margin-right: 4px; }
      .csync-badge.ok { background: #dcfce7; color: #166534; }
      .csync-badge.info { background: #e0f2fe; color: #075985; }
      .csync-badge.warn { background: #fef3c7; color: #92400e; }
      .csync-badge.err { background: #fee2e2; color: #991b1b; }
      .csync-anim-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; width: 100%; }
      .csync-video { width: 100%; max-height: 270px; background: #0f172a; border-radius: 12px; object-fit: cover; }
      .csync-progress-box { width: 100%; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 10px; margin-top: 10px; }
      .csync-progress-label { font-size: 12px; color: #0c4a6e; margin-bottom: 6px; }
      .csync-pills { display: flex; flex-wrap: wrap; gap: 5px; }
      .csync-pill { min-width: 24px; height: 24px; border-radius: 6px; background: #e2e8f0; color: #475569; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; }
      .csync-pill.done { background: #10b981; color: #fff; }
      .csync-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 13px; margin-bottom: 12px; }
      .csync-card h4 { margin: 0 0 6px; font-size: 13.5px; color: #0f172a; }
      .csync-card p { margin: 0 0 10px; font-size: 12px; color: #475569; line-height: 1.4; }
      .csync-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 2px dashed #94a3b8; border-radius: 12px; padding: 18px 12px; background: #fff; cursor: pointer; text-align: center; font-size: 12.5px; font-weight: 700; color: #1e293b; }
      .csync-drop:hover { border-color: #0e7490; background: #ecfeff; }
      .csync-drop span { font-size: 11px; font-weight: 500; color: #64748b; }
      .csync-preview-card { display: flex; flex-direction: column; gap: 12px; }
      .csync-preview-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .csync-preview-title { font-size: 15px; font-weight: 800; color: #0f172a; }
      .csync-preview-sub { font-size: 11.5px; color: #64748b; margin-top: 2px; }
      .csync-diff-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .csync-diff-box { border-radius: 10px; padding: 8px 6px; text-align: center; border: 1px solid #e2e8f0; background: #f8fafc; }
      .csync-diff-box .num { font-size: 17px; font-weight: 800; }
      .csync-diff-box .lbl { font-size: 10.5px; color: #475569; }
      .csync-diff-box.add { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
      .csync-diff-box.upd { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
      .csync-diff-box.keep { background: #fefce8; border-color: #fde68a; color: #854d0e; }
      .csync-diff-list { list-style: none; margin: 0; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; max-height: 140px; overflow-y: auto; font-size: 12px; display: flex; flex-direction: column; gap: 5px; }
      .csync-diff-list li { display: flex; align-items: center; gap: 6px; }
      .csync-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .csync-dot.add { background: #10b981; }
      .csync-dot.upd { background: #2563eb; }
      .csync-dot.keep { background: #d97706; }
      .csync-strategy-box { display: flex; flex-direction: column; gap: 8px; }
      .csync-radio-opt { display: flex; align-items: flex-start; gap: 8px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 10px; cursor: pointer; background: #fff; }
      .csync-radio-opt b { display: block; font-size: 12.5px; }
      .csync-radio-opt span { display: block; font-size: 11px; color: #64748b; margin-top: 2px; }
      .csync-preview-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
      .csync-footer { padding: 10px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 11px; color: #64748b; }
      .csync-muted { font-size: 12px; color: #64748b; margin: 0; }
      @media (max-width: 480px) {
        .csync-modal { max-height: 95vh; border-radius: 14px; }
        .csync-tabs { padding: 8px 10px; gap: 4px; }
        .csync-tab { font-size: 11px; padding: 7px 4px; }
        .csync-diff-grid { grid-template-columns: repeat(2, 1fr); }
        .csync-body { padding: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectModalDom() {
    if (document.getElementById('cahier-sync-modal')) return;
    const div = document.createElement('div');
    div.id = 'cahier-sync-modal';
    div.className = 'csync-overlay hidden no-print';
    div.innerHTML = `
      <div class="csync-modal" role="dialog" aria-modal="true" aria-labelledby="csync-modal-title">
        <div class="csync-head">
          <div>
            <div class="csync-head-title" id="csync-modal-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
              Synchronisation — APK &amp; Desktop
            </div>
            <div class="csync-head-sub" id="csync-env-badge">Mode hybride QR Code &amp; Transfert de Base</div>
          </div>
          <button type="button" class="csync-close" id="csync-close-btn" aria-label="Fermer">&times;</button>
        </div>

        <div id="csync-tabs-body">
          <div class="csync-tabs">
            <button type="button" class="csync-tab active" data-csync-tab="send">QR Envoyer</button>
            <button type="button" class="csync-tab" data-csync-tab="scan">QR Scanner</button>
            <button type="button" class="csync-tab" data-csync-tab="file">Base / Fichier</button>
          </div>

          <div class="csync-body">
            <div id="csync-panel-send" class="csync-panel">
              <div class="csync-row">
                <select id="csync-send-scope" class="csync-select" style="flex:1;">
                  <option value="all">Toute la base (toutes les classes)</option>
                  <option value="active">Classe active uniquement (QR ultra-compact)</option>
                </select>
              </div>
              <div class="csync-mode-grid">
                <button type="button" class="csync-mode-btn active" data-csync-mode="offline">
                  <b>QR Hors-Ligne</b>
                  <span>0 Internet • Statique / Animé</span>
                </button>
                <button type="button" class="csync-mode-btn" data-csync-mode="lan-push" id="csync-mode-lan-push">
                  <b>Wi-Fi PC → APK</b>
                  <span>1 scan • Chiffré local</span>
                </button>
                <button type="button" class="csync-mode-btn" data-csync-mode="lan-recv" id="csync-mode-lan-recv">
                  <b>Wi-Fi APK → PC</b>
                  <span>1 scan • Recevoir du mobile</span>
                </button>
                <button type="button" class="csync-mode-btn" data-csync-mode="online">
                  <b>Internet E2EE</b>
                  <span>1 scan • Relais chiffré</span>
                </button>
              </div>
              <div class="csync-qr-stage">
                <div id="csync-qr-canvas-box"></div>
                <div id="csync-send-status" class="csync-status">Préparation du QR Code...</div>
                <div id="csync-anim-controls" class="csync-anim-bar hidden">
                  <button type="button" id="csync-anim-prev" class="csync-btn sm">◀</button>
                  <button type="button" id="csync-anim-toggle" class="csync-btn sm">Pause</button>
                  <button type="button" id="csync-anim-next" class="csync-btn sm">▶</button>
                  <span id="csync-anim-counter" style="font-size:11.5px;font-weight:700;color:#334155;padding:0 4px;"></span>
                  <select id="csync-anim-speed" class="csync-select" style="padding:4px 6px;font-size:11px;">
                    <option value="750">Lent</option>
                    <option value="450" selected>Normal</option>
                    <option value="260">Rapide</option>
                  </select>
                </div>
                <button type="button" id="csync-copy-code-btn" class="csync-btn sm ghost hidden">Copier le code texte de synchro</button>
              </div>
            </div>

            <div id="csync-panel-scan" class="csync-panel hidden">
              <div class="csync-row" style="justify-content:center;">
                <button type="button" id="csync-cam-start-btn" class="csync-btn primary">Ouvrir la caméra QR</button>
                <button type="button" id="csync-cam-stop-btn" class="csync-btn ghost hidden">Arrêter la caméra</button>
                <label class="csync-btn emerald" style="cursor:pointer;">
                  Scanner une image
                  <input type="file" id="csync-qr-img-input" accept="image/*" class="hidden" />
                </label>
              </div>
              <video id="csync-scan-video" class="csync-video hidden" muted playsinline></video>
              <div id="csync-scan-status" class="csync-status" style="margin-top:8px;">
                Scannez un QR <b>Hors-Ligne</b>, <b>Wi-Fi Local (PC ↔ APK)</b> ou <b>Internet E2EE</b>.
              </div>
              <div id="csync-scan-progress" class="csync-progress-box hidden"></div>

              <div class="csync-card" style="margin-top:12px;">
                <h4>Ou coller un code texte de synchronisation</h4>
                <div class="csync-row" style="margin-bottom:0;">
                  <input type="text" id="csync-paste-input" class="csync-input" style="flex:1;" placeholder="CNQ1|... ou CNQL|... ou CNQR|..." />
                  <button type="button" id="csync-paste-apply-btn" class="csync-btn primary sm">Décoder</button>
                </div>
              </div>
            </div>

            <div id="csync-panel-file" class="csync-panel hidden">
              <div class="csync-card">
                <h4>1. Exporter / Partager la base</h4>
                <p>Créez un fichier chiffré <b>.cahier</b> (AES-256-GCM avec PIN) ou <b>.json</b> standard, partageable via QuickShare, Bluetooth, WhatsApp ou clé USB.</p>
                <div class="csync-row">
                  <select id="csync-file-scope" class="csync-select" style="flex:1;">
                    <option value="all">Base complète (toutes les classes)</option>
                    <option value="active">Classe active uniquement</option>
                  </select>
                </div>
                <div class="csync-row">
                  <input type="password" id="csync-file-pin" class="csync-input" placeholder="Code PIN / mot de passe (facultatif — si renseigné : .cahier chiffré)" autocomplete="new-password" />
                </div>
                <div class="csync-row" style="margin-bottom:0;">
                  <button type="button" id="csync-file-save-btn" class="csync-btn primary" style="flex:1;">Enregistrer le fichier</button>
                  <button type="button" id="csync-file-share-btn" class="csync-btn emerald" style="flex:1;">Partager (Mobile / PC)</button>
                </div>
              </div>

              <div class="csync-card" style="margin-bottom:0;">
                <h4>2. Importer &amp; Fusionner une base (.cahier / .json)</h4>
                <p>Ouvre l'aperçu de fusion intelligente avant d'appliquer — vos autres classes restent en sécurité.</p>
                <label class="csync-drop" id="csync-file-drop">
                  Choisir ou déposer un fichier .cahier / .json
                  <span>Compatible entre APK Android, PC Portable et Portfolio Web</span>
                  <input type="file" id="csync-file-import-input" accept=".cahier,.json,application/json,application/octet-stream" class="hidden" />
                </label>
                <div id="csync-file-status" class="csync-status" style="margin-top:8px;"></div>
              </div>
            </div>
          </div>
        </div>

        <div id="csync-merge-preview" class="csync-body hidden"></div>

        <div class="csync-footer">
          <span id="csync-footer-device">Appareil : détection...</span>
          <button type="button" id="csync-rollback-btn" class="csync-btn sm ghost hidden">Annuler la dernière synchro</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    wireEvents();
  }

  function updateRollbackVisibility() {
    const btn = document.getElementById('csync-rollback-btn');
    if (!btn) return;
    let has = false;
    try { has = !!localStorage.getItem(ROLLBACK_KEY); } catch (_) {}
    btn.classList.toggle('hidden', !has);
  }

  function switchTab(tabName) {
    stopCameraScanner();
    if (tabName !== 'send') { stopQrAnimation(); stopLanInboxPoll(); }
    document.querySelectorAll('.csync-tab').forEach(b => b.classList.toggle('active', b.dataset.csyncTab === tabName));
    ['send', 'scan', 'file'].forEach(t => {
      const p = document.getElementById('csync-panel-' + t);
      if (p) p.classList.toggle('hidden', t !== tabName);
    });
    if (tabName === 'send') triggerActiveSendMode();
  }

  function getActiveSendMode() {
    const active = document.querySelector('.csync-mode-btn.active');
    return active ? active.dataset.csyncMode : 'offline';
  }

  function triggerActiveSendMode() {
    const mode = getActiveSendMode();
    const scope = document.getElementById('csync-send-scope')?.value || 'all';
    if (mode === 'offline') generateOfflineQr(scope);
    else if (mode === 'lan-push') generateLanPushQr(scope);
    else if (mode === 'lan-recv') generateLanReceiveQr();
    else if (mode === 'online') generateOnlineRelayQr(scope);
  }

  function wireEvents() {
    const overlay = document.getElementById('cahier-sync-modal');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById('csync-close-btn').onclick = closeModal;

    document.querySelectorAll('.csync-tab').forEach(btn => {
      btn.onclick = () => switchTab(btn.dataset.csyncTab);
    });

    document.querySelectorAll('.csync-mode-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.csync-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        triggerActiveSendMode();
      };
    });

    document.getElementById('csync-send-scope').onchange = triggerActiveSendMode;
    document.getElementById('csync-anim-prev').onclick = () => { animPaused = true; document.getElementById('csync-anim-toggle').textContent = 'Reprendre'; showAnimFrame(animIdx - 1); };
    document.getElementById('csync-anim-next').onclick = () => { animPaused = true; document.getElementById('csync-anim-toggle').textContent = 'Reprendre'; showAnimFrame(animIdx + 1); };
    document.getElementById('csync-anim-toggle').onclick = (e) => {
      animPaused = !animPaused;
      e.target.textContent = animPaused ? 'Reprendre' : 'Pause';
    };
    document.getElementById('csync-anim-speed').onchange = (e) => {
      animSpeedMs = parseInt(e.target.value, 10) || 450;
      startAnimLoop();
    };
    document.getElementById('csync-copy-code-btn').onclick = async (e) => {
      const code = e.currentTarget.dataset.code || '';
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        hooks.showToast('Code de synchronisation copié !', 'success');
      } catch (_) {
        hooks.showToast('Copie bloquée par le navigateur.', 'error');
      }
    };

    document.getElementById('csync-cam-start-btn').onclick = startCameraScanner;
    document.getElementById('csync-cam-stop-btn').onclick = stopCameraScanner;
    document.getElementById('csync-qr-img-input').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) scanQrFromImageFile(f);
    };
    document.getElementById('csync-paste-apply-btn').onclick = () => {
      const inp = document.getElementById('csync-paste-input');
      const v = inp.value.trim();
      if (!v) return;
      handleScannedText(v);
      inp.value = '';
    };

    document.getElementById('csync-file-save-btn').onclick = () => handleFileExport(false);
    document.getElementById('csync-file-share-btn').onclick = () => handleFileExport(true);
    document.getElementById('csync-file-import-input').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) handleFileImport(f);
    };
    const drop = document.getElementById('csync-file-drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = '#0e7490'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = '#94a3b8'; });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.style.borderColor = '#94a3b8';
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFileImport(f);
    });

    document.getElementById('csync-rollback-btn').onclick = rollbackLastSync;
  }

  async function openModal(defaultTab) {
    injectStyles();
    injectModalDom();
    await detectEnvironment();

    const envBadge = document.getElementById('csync-env-badge');
    const footerDev = document.getElementById('csync-footer-device');
    if (footerDev) footerDev.textContent = 'Appareil : ' + envInfo.deviceLabel;
    if (envBadge) {
      envBadge.textContent = envInfo.lanAvailable
        ? `Wi-Fi Local Actif (${envInfo.lanOrigin}) • QR & Fichiers prêts`
        : (envInfo.mode === 'android-apk'
            ? 'Application Android APK • QR Hors-Ligne, Wi-Fi LAN & Partage natif'
            : 'Mode Hybride • QR Hors-Ligne, Internet E2EE & Fichiers .cahier/.json');
    }

    const lanPushBtn = document.getElementById('csync-mode-lan-push');
    const lanRecvBtn = document.getElementById('csync-mode-lan-recv');
    if (lanPushBtn) lanPushBtn.classList.toggle('hidden', !envInfo.lanAvailable);
    if (lanRecvBtn) lanRecvBtn.classList.toggle('hidden', !envInfo.lanAvailable);

    const hasActive = !!hooks.getActiveWorkbook();
    ['csync-send-scope', 'csync-file-scope'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel && sel.options[1]) {
        sel.options[1].disabled = !hasActive;
        if (!hasActive) sel.value = 'all';
      }
    });

    pendingIncoming = null;
    document.getElementById('csync-merge-preview').classList.add('hidden');
    document.getElementById('csync-tabs-body').classList.remove('hidden');
    updateRollbackVisibility();

    document.getElementById('cahier-sync-modal').classList.remove('hidden');
    switchTab(defaultTab || (envInfo.mode === 'android-apk' ? 'scan' : 'send'));
  }

  function closeModal() {
    stopCameraScanner();
    stopQrAnimation();
    stopLanInboxPoll();
    const el = document.getElementById('cahier-sync-modal');
    if (el) el.classList.add('hidden');
  }

  function isOpen() {
    const el = document.getElementById('cahier-sync-modal');
    return !!(el && !el.classList.contains('hidden'));
  }

  global.CahierSync = {
    init(configHooks) {
      hooks = configHooks;
      detectEnvironment();
    },
    open: openModal,
    close: closeModal,
    isOpen,
    deliverTextFile,
    _internal: {
      compressText,
      decompressText,
      crc32Hex,
      encryptWithPin,
      decryptWithPin,
      computeDiff,
      applyIncomingState,
      extractStateFromParsed,
      handleScannedText,
      buildPayload
    }
  };
})(window);
