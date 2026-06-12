/**
 * GOLNER SPORTS — Service Worker
 * Estrategia:
 *   • HTML / JS / CSS → Network-first (siempre descarga lo nuevo, cache solo si offline)
 *   • Imágenes / iconos → Cache-first (cambian poco, carga rápida)
 */

const CACHE_NAME = 'golner-sports-v9';

const STATIC_ASSETS = [
  '/index.html',
  '/login.html',
  '/css/style.css',
  '/js/parser.js',
  '/js/scoring.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-180.png',
];

// Instalar: pre-cachear assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Omitir Firebase, Google APIs y CDN externos — siempre van a red
  if (
    url.includes('firebaseapp') ||
    url.includes('firestore.googleapis') ||
    url.includes('identitytoolkit') ||
    url.includes('gstatic.com') ||
    url.includes('fonts.googleapis') ||
    url.includes('cdnjs.cloudflare') ||
    url.includes('chrome-extension')
  ) return;

  // Imágenes → cache-first
  if (/\.(png|jpg|jpeg|svg|gif|ico|webp)$/.test(url)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          }
          return res;
        });
      })
    );
    return;
  }

  // HTML / JS / CSS → network-first (siempre intenta la red primero)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('/index.html')))
  );
});
