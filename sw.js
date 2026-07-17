const CACHE_NAME = 'csr-v2';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => clients.claim()));
});
self.addEventListener('fetch', e => {
  const freshRequest = new Request(e.request, { cache: 'no-store' });
  e.respondWith(fetch(freshRequest).catch(() => caches.match(e.request)));
});
