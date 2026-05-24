/* QRaku Service Worker — cache-first for static assets, network-first for API */
// [2026-05-24] PG-AUDIT-SW: v2 — fetch handler 의 res.clone() 타이밍 버그 fix.
// version bump 으로 install 된 사용자 브라우저의 옛 SW 즉시 교체.
const CACHE = 'qraku-v2'
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
                    // res.clone() 은 fetch resolve 직후 즉시 실행 — caches.open
                    // promise 가 resolve 될 때까지 기다리면 그 사이 브라우저가
                    // `return res` 의 body 를 read 시작해 clone 이 fail
                    // ("Response body is already used"). e.waitUntil 로 cache
                    // 작업이 SW life cycle 내 완료되도록.
                    const copy = res.clone()
                    e.waitUntil(caches.open(CACHE).then(c => c.put(request, copy)))
                }
                return res
            })
            // キャッシュがあれば即返し、バックグラウンドで更新
            return cached || networkFetch
        }).catch(() => caches.match('/discover'))
    )
})
