const CACHE = 'buddy-7';
const ASSETS = ['./','./index.html','./app.css','./tax.js','./reminder-config.js','./reminders.js','./app.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.endsWith('/reminder-config.js')) {
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok) await (await caches.open(CACHE)).put(event.request,response.clone());
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
self.addEventListener('push', event => {
  let body = 'Got a minute? Buddy’s ready for a quick tax check-in.';
  try { const data = event.data?.json(); if (typeof data?.body === 'string') body = data.body.slice(0, 180); } catch { /* Show a safe fallback. */ }
  event.waitUntil(self.registration.showNotification('Buddy', {body, icon:'./icons/icon-192.png', badge:'./icons/icon-192.png', tag:'buddy-reminder', data:{url:self.registration.scope}}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = self.registration.scope;
    const openClients = await clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = openClients.find(client => client.url.startsWith(url));
    if (existing) return existing.focus();
    return clients.openWindow(url);
  })());
});
