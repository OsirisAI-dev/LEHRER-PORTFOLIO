/**
 * sw.js  â€”  OSIRIS Lehrer-Portfolio Service Worker
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Strategies:
 *   /icons/        â†’ Cache-First  (static, never change)
 *   /fonts/        â†’ Cache-First  (large, stable)
 *   /lib/          â†’ Cache-First  (versioned vendor libs)
 *   /screenshots/  â†’ Cache-First  (static)
 *   /js/core/      â†’ Stale-While-Revalidate  (updated regularly)
 *   /js/apps/      â†’ Stale-While-Revalidate
 *   /js/utils/     â†’ Stale-While-Revalidate
 *   /pages/        â†’ Stale-While-Revalidate  (always fresh, works offline)
 *   /shelves/      â†’ Stale-While-Revalidate
 *   offline.html   â†’ Pre-cached, served on any navigation failure
 *   AI API calls   â†’ Network-Only (never cache LLM responses)
 *
 * To bust all caches: bump CACHE_VERSION below.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

const CACHE_VERSION = 'v26';
const CACHE_NAME    = `osiris-pwa-${CACHE_VERSION}`;

const AI_HOSTNAMES = [
  'gen.pollinations.ai',
  'api.cerebras.ai',
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'integrate.api.nvidia.com',
  'models.github.ai',
  'api.cloudflare.com',
  'openrouter.ai',
  'router.huggingface.co',
];

const PRECACHE_URLS = [

  './',
  './index.html',
  './offline.html',
  './manifest.json', 
  './db/default_woerterbuch.json',
  './db/default_fachwoerterbuch.json',
  './db/default_testbank.json',

  './pages/home.html',
  './pages/dashboard.html',
  './pages/test-generator.html',
  './pages/test-bank.html',
  './pages/wiki.html',
  './pages/library.html',
  './pages/edu-hub.html',
  './pages/woerterbuch.html',
  './pages/fachwoerterbuch.html',
  './pages/portfolio-subpage.html',
  './pages/lehrskizze-editor.html',

  './js/core/config.js',
  './js/core/osiris-core.js',
  './js/core/osiris-educore.js',

  './js/utils/pwa-install.js',
  './js/utils/lib-loader.js',

  './lib/chart/v4.5.1/chart.umd.min.js',
  './lib/sqljs/v1.10.3/sql-wasm.js',
  './lib/sqljs/v1.10.3/sql-wasm.wasm',
  './lib/htmldocx/v1/html-docx.js',
  './lib/pdf/v1/pdf.min.js',
  './lib/pdf/v1/pdf.worker.min.js',
  './lib/pdf/v1/pdf-lib.min.js',
  './lib/jszip/v1/jszip.min.js',
  './lib/mammoth/v1/mammoth.browser.js',

  './shelves/classique.html',
  './shelves/the_codex_collection.html',
  './shelves/the_dark_shelf.html',
  './shelves/the_lit_circle.html',
  './shelves/OSIRIS_PDF_READER.html',
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {


        return Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            fetch(url)
              .then((res) => {
                if (res.ok) return cache.put(url, res);
              })
              .catch(() => { /* skip missing files during install */ })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});


self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.info(`[OSIRIS SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});


self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (AI_HOSTNAMES.includes(url.hostname)) {

    return;
  }

  if (
    url.pathname.startsWith('/lib/')       ||
    url.pathname.startsWith('/fonts/')     ||
    url.pathname.startsWith('/icons/')     ||
    url.pathname.startsWith('/screenshots/')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (
    url.pathname.startsWith('/pages/')   ||
    url.pathname.startsWith('/js/')      ||
    url.pathname.startsWith('/shelves/') ||
    url.pathname === '/'                 ||
    url.pathname === '/index.html'       ||
    url.pathname === '/offline.html'     ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  event.respondWith(networkWithCacheFallback(request));
});


/** Cache-First: return cache instantly; fetch+update in background if miss */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    return new Response('Asset offline.', { status: 503 });
  }
}

/** Stale-While-Revalidate: return cache immediately, update cache async */
async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache   = await caches.open(CACHE_NAME);
  const cached  = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkRes) => {
      if (networkRes.ok) cache.put(request, networkRes.clone());
      return networkRes;
    })
    .catch(() => null);

  event.waitUntil(fetchPromise);

  return cached || await fetchPromise || offlineFallback();
}

/** Navigation handler with offline.html fallback */
async function navigationHandler(request) {
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkRes.clone());
      return networkRes;
    }
  } catch { /* offline */ }

  const cached = await caches.match(request);
  if (cached) return cached;

  return offlineFallback();
}

/** Network with cache fallback */
async function networkWithCacheFallback(request) {
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

/** Return the pre-cached offline page */
async function offlineFallback() {
  const cached = await caches.match('/offline.html');
  return cached || new Response(
    '<h1>Offline</h1><p>Die App ist offline und die Seite wurde noch nicht gecacht.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
  );
}
