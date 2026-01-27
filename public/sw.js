// Minimal Service Worker to satisfy PWA requirements
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installed')
    event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activated')
    event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
    // Basic pass-through fetch
    // For a more advanced PWA, we could cache assets here.
    // preserving simple behavior for now to avoid stubborn cache issues during dev.
    // event.respondWith(fetch(event.request))
})
