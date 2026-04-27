const CACHE = 'kho-chu-thang-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(c => c.match(e.request).then(r => r || fetch(e.request).then(f => { c.put(e.request, f.clone()); return f; })))
  );
});
