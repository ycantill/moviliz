// Service worker: guarda la app para que abra sin conexión.
const VERSION = 'moviliz-v7';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/app.js',
  'src/router.js',
  'src/geo.js',
  'src/store.js',
  'data/transmetro.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Datos: primero la red (para tener lo último) y, si falla, la copia guardada.
  if (url.pathname.endsWith('/data/transmetro.json')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
    return;
  }
  // Resto de la app: primero la copia guardada.
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
