// Minimal service worker: network-first for navigations, cache fallback when offline.
// public/ files are copied verbatim, so Vite's `base` is not applied here.
// Derive the app root from the worker's own URL instead of hardcoding '/'.
const ROOT = new URL('./', self.location).href;
const CACHE = 'oneforall-v2';
const OFFLINE_URLS = [ROOT, `${ROOT}manifest.json`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(ROOT, copy));
          return response;
        })
        .catch(() => caches.match(ROOT))
    );
  }
});
