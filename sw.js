/* Lunchpoäng freshness worker.
   Strategy: network-first for navigations (HTML) with short timeout,
   cached shell as fallback + background revalidation so a slow network
   can never pin an old build. Everything else passes through. */
const VERSION = 'v2';
const CACHE = 'shell-' + VERSION;
const SHELL = '/';
const TIMEOUT_MS = 2500;
const BG_TIMEOUT_MS = 15000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache:'reload' bypasses BOTH browser HTTP cache and any stale edge copy
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

async function navigate(request, event) {
  const cache = await caches.open(CACHE);

  let fresh = null;
  try {
    fresh = await Promise.race([fetch(request), failAfter(TIMEOUT_MS)]);
  } catch { /* timeout or network error -> fallback below */ }

  if (fresh && fresh.ok) {
    const put = cache.put(SHELL, fresh.clone());
    if (event && event.waitUntil) event.waitUntil(put);
    return fresh;
  }

  // Fallback: serve cached shell NOW, but keep downloading the fresh one
  // in the background so the very next visit is up to date.
  if (event && event.waitUntil) {
    event.waitUntil((async () => {
      try {
        const r = await Promise.race([fetch(request), failAfter(BG_TIMEOUT_MS)]);
        if (r && r.ok) await cache.put(SHELL, r.clone());
      } catch {}
    })());
  }

  const cached = (await cache.match(SHELL)) ||
                 (await caches.match(request, { ignoreSearch: true }));
  if (cached) return cached;
  throw (fresh ? new Error('HTTP ' + fresh.status) : new Error('offline'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(navigate(req, event));
});

/* Escape hatches: page posts {type:'UNREGISTER'}, or user opens /?nw=1 */
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') await self.skipWaiting();
  if (event.data && event.data.type === 'UNREGISTER') {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
  }
});
