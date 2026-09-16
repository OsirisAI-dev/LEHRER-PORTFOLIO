/**
 * pwa-install.js
 * Handles the PWA install lifecycle:
 *  - Captures the beforeinstallprompt event
 *  - Exposes window.OSIRIS_PWA.showInstallPrompt()
 *  - Wires up any element with data-pwa-install-btn attribute
 *
 * Usage:
 *   <script type="module" src="/js/utils/pwa-install.js"><\/script>
 *   <button data-pwa-install-btn hidden>App installieren</button>
 */

(function () {
  'use strict';

  let deferredPrompt = null;
  const BTN_SELECTOR = '[data-pwa-install-btn]';

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    _showButtons();
    console.info('[OSIRIS PWA] Install prompt captured — ready to show.');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    _hideButtons();
    console.info('[OSIRIS PWA] App installed successfully.');
  });

  window.OSIRIS_PWA = {
    /**
     * Programmatically trigger the native install dialog.
     * Returns a Promise<'accepted'|'dismissed'|'unavailable'>.
     */
    showInstallPrompt: async function () {
      if (!deferredPrompt) {
        console.warn('[OSIRIS PWA] No install prompt available. Either already installed or not running via HTTPS/localhost.');
        return 'unavailable';
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      _hideButtons();
      return outcome; // 'accepted' | 'dismissed'
    },

    isInstallable: function () {
      return deferredPrompt !== null;
    },
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.info('[OSIRIS SW] Registered. Scope:', reg.scope);
          _checkForUpdate(reg);
        })
        .catch((err) => console.error('[OSIRIS SW] Registration failed:', err));
    });
  }

  function _checkForUpdate(registration) {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          _showUpdateToast();
        }
      });
    });
  }

  function _showUpdateToast() {
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.style.cssText = [
      'position:fixed', 'bottom:1.25rem', 'left:50%', 'transform:translateX(-50%)',
      'background:#007aff', 'color:#fff', 'border-radius:50px',
      'padding:.65rem 1.2rem', 'font-size:.875rem', 'font-weight:600',
      'box-shadow:0 4px 20px rgba(0,0,0,.35)', 'z-index:9999',
      'display:flex', 'gap:.75rem', 'align-items:center', 'white-space:nowrap',
    ].join(';');
    toast.innerHTML = `
      <span>🔄 Update verfügbar</span>
      <button onclick="location.reload()" style="
        background:rgba(255,255,255,.25);border:none;border-radius:50px;
        color:#fff;padding:.3rem .8rem;font-weight:700;cursor:pointer;font-size:.8rem;">
        Jetzt laden
      </button>
    `;
    document.body.appendChild(toast);
  }

  function _showButtons() {
    document.querySelectorAll(BTN_SELECTOR).forEach(btn => {
      btn.hidden = false;
      btn.addEventListener('click', () => window.OSIRIS_PWA.showInstallPrompt(), { once: true });
    });
  }

  function _hideButtons() {
    document.querySelectorAll(BTN_SELECTOR).forEach(btn => btn.hidden = true);
  }
})();
