/*
 * Offline support when the app is served over http(s) (e.g. GitHub Pages).
 * App files: cache first, refreshed in the background. Everything else
 * (hero portraits, data updates, OCR library) goes to the network as normal.
 */
const CACHE = 'epic7-engine-v6';
const APP_FILES = [
  './', './index.html', './css/styles.css', './manifest.webmanifest', './icon.svg',
  './js/sources/official-heroes.js', './js/sources/fribbels-data.js', './js/roster.js', './js/gear.js', './js/learn.js',
  './js/logic.js', './js/tune.js', './js/vision.js', './js/app.js', './js/auto.js', './js/pip.js',
  './gear.html', './js/gearsort.js', './js/gear-app.js',
  './guild.html', './js/guildwar.js', './js/sync.js', './js/guild-app.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      const fresh = fetch(e.request)
        .then((r) => {
          if (r.ok) c.put(e.request, r.clone());
          return r;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
