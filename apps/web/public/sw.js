/**
 * Service worker — offline shell + shortlist cache.
 *
 * Strategy per resource class:
 *
 *   /api/*                → network only. Listing state changes when a verifier
 *                           acts on it, so serving a stale cache would be worse
 *                           than a failed request.
 *
 *   HTML documents        → network-first with a cached fallback. Online users
 *                           always see fresh pages; offline users see whatever
 *                           they last visited.
 *
 *   Static assets, icons, → cache-first. Fingerprinted by Next.js so cache
 *   images                 hits are always the right build.
 *
 * The cache is versioned by name — bumping `SHELL_CACHE` invalidates the entire
 * shell on the next activation without needing per-URL bookkeeping.
 */

const SHELL_CACHE = 'selleasy24-shell-v1';
const RUNTIME_CACHE = 'selleasy24-runtime-v1';

const SHELL_URLS = ['/', '/saved', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (photos on the API host, fonts, etc.) — pass through untouched.
  // The service worker only owns same-origin traffic in this scope.
  if (url.origin !== self.location.origin) return;

  // API responses must be fresh. Never cache.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML navigations — try the network, fall back to the last-cached version.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets and images — cache-first, revalidate in the background.
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last-ditch fallback: the homepage shell, which is always cached at install.
    const shell = await caches.match('/');
    if (shell) return shell;
    return new Response('You are offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}
