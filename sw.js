// Service worker: permite abrir la app sin conexión.
//
// Con internet siempre se pide la versión más reciente de cada archivo
// (primero la red) y se guarda una copia. Sin internet, o si la red tarda
// demasiado, se usa la copia guardada. Así cada publicación nueva se ve al
// abrir la app, sin tener que borrar la caché.
//
// El despliegue reemplaza __VERSION__ por el commit publicado, así que
// sw.js cambia en cada publicación y el navegador instala la versión nueva.
const VERSION = 'moviliz-__VERSION__';
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
  'fonts/nunito.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const ESPERA_RED_MS = 4000;

self.addEventListener('install', (e) => {
  // cache: 'reload' evita copiar archivos viejos desde la caché HTTP del navegador.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
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
  e.respondWith(primeroLaRed(e.request));
});

async function primeroLaRed(request) {
  const cache = await caches.open(VERSION);
  const red = fetch(request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  const guardada = () => cache.match(request, { ignoreSearch: true });
  try {
    // Si la red tarda mucho (señal débil), se muestra la copia y la red sigue
    // actualizándola en segundo plano.
    const res = await Promise.race([
      red,
      new Promise((resolve) => setTimeout(() => resolve(null), ESPERA_RED_MS)),
    ]);
    if (res) return res;
    return (await guardada()) || (await red);
  } catch {
    const hit = await guardada();
    if (hit) return hit;
    throw new Error('Sin conexión y sin copia guardada');
  }
}
