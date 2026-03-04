self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Simple pass-through fetch for PWA installability
  e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});
