/* QRaku Service Worker — cache-first for static assets, network-first for API */
const CACHE = 'qraku-v1'
const PRECACHE = ['/discover']

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    )
})

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    )
})

self.addEventListener('fetch', e => {
    const { request } = e
    const url = new URL(request.url)

    // API / WebSocket / cross-origin → ネットワーク優先 (キャッシュしない)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/') || url.origin !== location.origin) return

    // GET のみキャッシュ
    if (request.method !== 'GET') return

    e.respondWith(
        caches.match(request).then(cached => {
            const networkFetch = fetch(request).then(res => {
                if (res.ok) {
                    caches.open(CACHE).then(c => c.put(request, res.clone()))
                }
                return res
            })
            // キャッシュがあれば即返し、バックグラウンドで更新
            return cached || networkFetch
        }).catch(() => caches.match('/discover'))
    )
})
