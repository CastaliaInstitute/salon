/*
 * Castalia Salon service worker — handwritten, zero dependencies (salon-pwa-shell R2, R3).
 *
 * Versioning: __CACHE_VERSION__ is a placeholder stamped by scripts/sw-version.mjs
 * at build time (ISO build timestamp), so every GitHub Pages deploy installs a
 * fresh cache and sweeps the old one on activate.
 *
 * The precache list is a plain constant. Astro emits content-hashed asset URLs
 * (e.g. /assets/index.<hash>.css) that cannot be guessed at authoring time;
 * the main stylesheet href is injected into the __MAIN_CSS__ placeholder by
 * sw-version.mjs (extracted from dist/index.html). Hashed assets are also
 * covered by the runtime cache-first strategy, so an unresolved placeholder is
 * harmless — install filters it out.
 *
 * `/villa/` precache is the contract point for villa-3day-replay.
 * Errors elsewhere must not turn into SW v2: any failure is logged, never thrown.
 */
const CACHE_VERSION = '__CACHE_VERSION__';
const MAIN_CSS = '__MAIN_CSS__';
const SHELL_CACHE = `salon-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `salon-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/villa/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/favicon.svg',
  MAIN_CSS,
];

function isOwnRuntimeAsset(path) {
  return path === MAIN_CSS ||
    path.startsWith('/assets/') ||
    /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|woff2?|ttf|otf|eot|webmanifest)$/i.test(path);
}

function isCachableKind(request) {
  return (
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'manifest'
  );
}

/*
 * fetch: keep /live/* and third-party (Matrix, supabase, fonts) traffic on the
 * network; navigations are network-first; everything static is cache-first
 * (runtime cache), with stale-then-network revalidation on cache hits.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Matrix / supabase / fonts: network only (R3)
  if (url.pathname === '/sw.js') return; // never intercept our own script

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event, request));
    return;
  }

  if (isOwnRuntimeAsset(url.pathname) || isCachableKind(request)) {
    event.respondWith(handleStatic(event, request));
    return;
  }
  // Same-origin, non-navigation, non-static: network only (e.g. /api probes).
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Drop unresolved __MAIN_CSS__ placeholders (should already be stamped at build).
      await cache.addAll(PRECACHE_URLS.filter((url) => !url.startsWith('__')));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith('salon-shell-') || name.startsWith('salon-runtime-')) && !keep.has(name),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// Navigations: network-first; on network failure, serve the latest cached copy
// of that navigation (precache or runtime), else the branded offline page.
async function handleNavigate(event, request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone())));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

// Static shell assets: cache-first out of the runtime cache; on a cache miss,
// fetch and record; on a cache hit, revalidate behind the response.
async function handleStatic(event, request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    event.waitUntil(
      fetch(request)
        .then((response) => {
          if (response.ok) return cache.put(request, response.clone());
        })
        .catch(() => {}),
    );
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  } catch {
    return Response.error();
  }
}
