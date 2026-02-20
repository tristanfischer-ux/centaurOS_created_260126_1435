// INTENT: Self-unregistering service worker. A previous deployment registered
// a caching SW that was later deleted. Users' browsers still run the old SW,
// serving stale JS chunks from past builds. When chunks from different builds
// mix, minified variable names collide, causing ReferenceErrors (e.g.
// "Can't find variable: members"). This file forces the old SW to be replaced
// by one that immediately clears all caches and unregisters itself.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    ).then(() => self.registration.unregister())
  )
})
