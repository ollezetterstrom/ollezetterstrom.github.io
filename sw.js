/* Lunchpoäng freshness worker.
   Strategy: network-first for navigations (HTML) with 3s timeout,
   cached shell as offline fallback. Everything else passes through. */
const VERSION = 'v1';
const CACHE = 'shell-' + VERSION;
const SHELL = '/';
const TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(SHELL, { cache: 'reload' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

function failAfter(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function navigate(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await Promise.race([fetch(request), failAfter(TIMEOUT_MS)]);
    if (fresh.ok) {
      // one canonical entry so ?v= variants share it
      await cache.put(SHELL, fresh.clone());
      return fresh;
    }
    throw new Error('HTTP ' + fresh.status);
  } catch (err) {
    const cached = (await cache.match(SHELL)) ||
                   (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(navigate(req));
});

/* Escape hatches: page posts {type:'UNREGISTER'}, or user opens /?nw=1 */
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') await self.skipWaiting();
  if (event.data && event.data.type === 'UNREGISTER') {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
  }
});
