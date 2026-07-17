const CACHE_NAME = 'csr-v2';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => clients.claim()));
});
self.addEventListener('fetch', e => {
  const freshRequest = new Request(e.request, { cache: 'no-store' });
  e.respondWith(fetch(freshRequest).catch(() => caches.match(e.request)));
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (_) { data = { body: event.data?.text() || '提醒時間到了' }; }
  const notification = data.notification || data;
  event.waitUntil(self.registration.showNotification(notification.title || 'OMNIPLAY 提醒', { body: notification.body || '提醒時間到了', icon: '/OMNIPLAY-CSR-Support/assets/icon-192.png', badge: '/OMNIPLAY-CSR-Support/assets/icon-192.png', tag: notification.tag || 'csr-reminder', requireInteraction: true, data: { url: data.url || data.data?.url || '/OMNIPLAY-CSR-Support/index.html' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close(); const url = event.notification.data?.url || '/OMNIPLAY-CSR-Support/index.html';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => { const existing = windows.find((client) => client.url.includes('/OMNIPLAY-CSR-Support/')); if (existing) { existing.navigate(url); return existing.focus(); } return clients.openWindow(url); }));
});
