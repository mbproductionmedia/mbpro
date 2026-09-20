// MB Production service worker
// Network-first for the app shell so updates appear as soon as they're deployed.
// Bump CACHE_NAME whenever you want to force every device to drop its old cache.
const CACHE_NAME = 'mbpro-v3';
const ASSETS = [
  '/mbpro/',
  '/mbpro/index.html',
  '/mbpro/manifest.json',
  '/mbpro/icon-192.png',
  '/mbpro/icon-512.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS).catch(function(){ /* ignore individual misses */ });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  const req = e.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch Supabase or any cross-origin API traffic.
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('.html');

  if (isPage) {
    // NETWORK FIRST: always try to get the newest page, fall back to cache offline.
    e.respondWith(
      fetch(req).then(function(res) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
        return res;
      }).catch(function() {
        return caches.match(req).then(function(hit) {
          return hit || caches.match('/mbpro/index.html');
        });
      })
    );
    return;
  }

  // CACHE FIRST for static assets (icons, manifest), refreshed in the background.
  e.respondWith(
    caches.match(req).then(function(hit) {
      const network = fetch(req).then(function(res) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
        return res;
      }).catch(function() { return hit; });
      return hit || network;
    })
  );
});

// Lets the page tell the waiting worker to take over immediately.
self.addEventListener('message', function(e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
