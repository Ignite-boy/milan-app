/* MILAN service worker: offline fallback + safe static asset warm cache. */

const SHELL_CACHE = 'milan-offline-shell-v3';
const STATIC_CACHE = 'milan-static-v1';
const OFFLINE_URL = '/offline.html';

function isCacheableStaticAsset(request, url) {
  return request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname.startsWith('/assets/');
}

async function putStatic(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return response;
  const cache = await caches.open(STATIC_CACHE);
  await cache.put(request, response.clone());
  return response;
}

async function warmUrls(urls) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(urls.slice(0, 12).map(async (rawUrl) => {
    try {
      const url = new URL(rawUrl, self.location.origin);
      if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
      const request = new Request(url.href, { credentials: 'same-origin' });
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    } catch (_) {
      // Prefetching is opportunistic: a failed warmup must never affect navigation.
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.navigationPreload.enable().catch(() => {}),
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, STATIC_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'milan:prefetch' || !Array.isArray(event.data.urls)) return;
  event.waitUntil(warmUrls(event.data.urls));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.headers.has('range') || /\.(mp4|webm|mov|m4v|3gp|m3u8)$/i.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await event.preloadResponse || await fetch(request);
      } catch (_) {
        return await caches.match(OFFLINE_URL);
      }
    })());
    return;
  }

  if (!isCacheableStaticAsset(request, url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    const refresh = fetch(request)
      .then((response) => putStatic(request, response))
      .catch(() => null);

    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    return await refresh || Response.error();
  })());
});