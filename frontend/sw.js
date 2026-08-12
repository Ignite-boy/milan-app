/* MILAN lightweight service worker */

const CACHE_NAME = 'milan-offline-shell-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept API requests.
  if (url.pathname.startsWith('/api/')) return;

  // Never intercept media/range requests.
  if (
    req.headers.has('range') ||
    /\.(mp4|webm|mov|m4v|3gp|m3u8)$/i.test(url.pathname)
  ) {
    return;
  }

  // Navigation: fresh network first, offline fallback only if network fails.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Let browser handle normal static assets directly.
  // This avoids unnecessary Service Worker latency.
});
