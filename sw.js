const CACHE = 'rekenen-v2';
const ASSETS = [
  '.', 'index.html', 'style.css', 'icon.svg', 'manifest.json',
  'app.js', 'facts.js', 'state.js', 'session.js', 'flow.js', 'keypad.js', 'visuals.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
