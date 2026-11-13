/*
 * Retired (DEVLOG #37): the Epic 7 Engine is a desktop app now; the web site only hosts the Guild War page for
 * guildmates. Phones/browsers that installed the old offline web app still have its service worker: this version
 * deletes every cache it made and unregisters itself, so they load the live pages again. Kept for a while, then removed.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((wins) => wins.forEach((w) => w.navigate(w.url).catch(() => {}))),
  );
});
