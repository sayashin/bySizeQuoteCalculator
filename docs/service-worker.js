// service-worker.js
// Offline-first for app assets, network-first for navigation HTML.

const CACHE_NAME = 'price-calc-v3';

const CORE_ASSETS = [
  '/',              // important: works when hosted at domain root
  '/index.html',
  '/settings.html',
  '/estimates.html',

  '/app.js',
  '/settings.js',
  '/estimates.js',

  '/prices.json',
  '/manifest.json',

  // ✅ local vendor libs (no CDN)
  '/vendor/html2canvas.min.js',
  '/vendor/jspdf.umd.min.js',
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => (n === CACHE_NAME ? null : caches.delete(n))))
    )
  );
  self.clients.claim();
});

// Helpers
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // navigation offline fallback
    if (request.mode === 'navigate') return cache.match('/index.html');
    return new Response('Offline - content not available', { status: 503 });
  }
}

// Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin (your app). Skip cross-origin/CDNs.
  if (url.origin !== self.location.origin) return;

  // Network-first for top-level page navigation so updates apply
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets + API-like JSON files
  event.respondWith(cacheFirst(request));
});