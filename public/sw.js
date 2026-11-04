// Uygulama kabuğunu önbelleğe alır; veriler her zaman ağdan gelir.
const CACHE = 'loopwear-v2';
const SHELL = ['/', '/style.css', '/app.js', '/core.js', '/admin.js', '/i18n.js', '/vendor/qrcode.js', '/vendor/jsQR.js', '/assets/loopy-hero.png', '/assets/loopy-face.png', '/assets/loopy-wave.png', '/assets/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Önce ağ: güncellemeler hemen görünür, ağ yoksa son kopya açılır
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});
