/* QRaku Service Worker — cache-first for static assets, network-first for API */
// [2026-05-24] PG-AUDIT-SW2: v3 — e.waitUntil 제거 (cached hit 시 event 종료
// 후 호출되면 InvalidStateError). cache write 는 fire-and-forget + catch.
const CACHE = 'qraku-v3'
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
                    // res.clone() 은 fetch resolve 직후 즉시 실행 — body 가
                    // read 되기 전. cache write 는 fire-and-forget + catch:
                    // e.waitUntil 을 쓰면 cached hit 으로 e.respondWith 가
                    // 일찍 settle 된 후 호출 시 InvalidStateError 발생.
                    // 일반적으로 fetch resolve 직후 cache write 는 마이크로
                    // 태스크 단위라 SW 종료 전 완료. 실패해도 다음 시도에 갱신.
                    const copy = res.clone()
                    caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {})
                }
                return res
            })
            // キャッシュがあれば即返し、バックグラウンドで更新
            return cached || networkFetch
        }).catch(() => caches.match('/discover'))
    )
})
