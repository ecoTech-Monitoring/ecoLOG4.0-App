/* BS-eco40 service worker — offline app shell + safe updates.
   Basis: sw-bs27f.js aus BlueShell 27F (Build 21.07.2026), korrigiert:
   - SHELL verwies auf manifest-bs26f.webmanifest (existiert nicht) -> richtiger Name
   - SHELL cachte die tote cdnjs-URL fuer jsQR (404) -> funktionierende jsdelivr-URL,
     dadurch geht der QR-Scanner jetzt auch offline
   - Cache-Name und Dateinamen auf BS-eco40 umgestellt
   Strategy:
   - HTML / navigations: NETWORK FIRST (falls back to cache when offline).
     The old cache-first worker could serve a stale app version forever;
     this one always picks up new builds while staying offline-capable.
   - Everything else (icons, CDN css/js/fonts): cache first, refreshed
     in the background (stale-while-revalidate). */
/* BS-eco40 (02.09.2026): v3 — neue Logo-Bildmarke. Der Bump raeumt den v2-Cache
   ab, in dem Bestandsinstallationen sonst EWIG die alten Icons behielten
   (Assets sind cache-first). Die ?v=2-Suffixe an den Icon-URLs erneuern
   zusaetzlich Favicon-Cache und die Icons bereits installierter Apps. */
/* v4 (02.09.): Umbenennung enviLog 4.0 — Manifest/HTML muessen frisch kommen. */
const CACHE = 'bs-eco40-v4';
const SHELL = [
  'BS-eco40.html',
  'blNewStore.js',
  'manifest-bs-eco40.webmanifest',
  'icon.svg?v=2',
  'icon-192.png?v=2',
  'icon-512.png?v=2',
  'icon-512-maskable.png?v=2',
  // Bibliotheken lokal gebuendelt (vendor/) — kein CDN im Precache mehr
  'vendor/bootstrap-icons/bootstrap-icons.min.css',
  'vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'vendor/jsqr/jsQR.min.js',
  'vendor/fonts/barlow-500.woff2',
  'vendor/fonts/barlow-700.woff2'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html') || /\.html?(\?|$)/i.test(req.url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (isHtmlRequest(req)) {
    // Network first: always deliver the newest app version when online.
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then((hit) =>
        hit || caches.match('BS-eco40.html').then((shell) =>
          shell || new Response('Offline — app shell not cached yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          }))
      ))
    );
    return;
  }

  // Assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req).then((res) => {
        try {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
        } catch (e) { /* ignore */ }
        return res;
      }).catch(() => hit || new Response('', { status: 504, statusText: 'Offline, not cached' }));
      return hit || refresh;
    })
  );
});
