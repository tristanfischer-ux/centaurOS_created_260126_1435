// Service Worker with cache versioning
const CACHE_VERSION = 'v1'
const CACHE_NAME = `centauros-${CACHE_VERSION}`

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
]

self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...')
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching static assets')
                return cache.addAll(STATIC_ASSETS)
            })
            .then(() => self.skipWaiting())
    )
})

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...')
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('centauros-') && name !== CACHE_NAME)
                        .map((name) => {
                            console.log('Service Worker: Deleting old cache:', name)
                            return caches.delete(name)
                        })
                )
            })
            .then(() => self.clients.claim())
    )
})

self.addEventListener('fetch', (event) => {
    // Network-first strategy for API requests
    if (event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        )
        return
    }

    // Cache-first strategy for static assets
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse
                }
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses or non-GET requests
                        if (!response || response.status !== 200 || event.request.method !== 'GET') {
                            return response
                        }
                        // Clone response for caching
                        const responseToCache = response.clone()
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache)
                            })
                        return response
                    })
            })
    )
})
