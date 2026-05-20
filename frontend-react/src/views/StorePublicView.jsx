import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import {
    MapPin, Phone, Clock, QrCode, ExternalLink, ChevronDown, ChevronUp, ShoppingBag,
    Sparkles, Star, Globe, Camera, Image as ImageIcon, Menu as MenuIcon, X, CheckCircle,
    Timer, Briefcase, Plus
} from 'lucide-react'
import { useLiff } from '../hooks/useLiff'

const DAY_LABELS = {
    monday: '月', tuesday: '火', wednesday: '水', thursday: '木',
    friday: '金', saturday: '土', sunday: '日',
}
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function parseJSON(raw) {
    if (!raw) return null
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return null }
}

function parseList(raw) {
    const v = parseJSON(raw)
    return Array.isArray(v) ? v : []
}

function BusinessHoursTable({ raw }) {
    const hours = parseJSON(raw)
    if (!hours) return raw ? <p className="text-sm text-gray-600">{raw}</p> : null
    return (
        <div className="grid grid-cols-1 gap-0.5">
            {DAY_ORDER.map(day => {
                const info = hours[day]
                if (!info) return null
                const isClosed = info.closed || !info.open
                return (
                    <div key={day} className="flex items-center gap-3 text-sm py-0.5">
                        <span className="w-5 text-center font-medium text-gray-500">{DAY_LABELS[day]}</span>
                        {isClosed
                            ? <span className="text-red-400 text-xs">定休日</span>
                            : <span className="text-gray-700">{info.open} – {info.close || '—'}</span>}
                    </div>
                )
            })}
        </div>
    )
}

function MenuCard({ item }) {
    const name = item.name_jp || item.name_en || item.name_ko || '—'
    const price = item.is_daily_special && item.special_price ? item.special_price : item.price
    return (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                <img src={item.image_url || 'https://via.placeholder.com/400x300.webp?text=No+Image'}
                    alt={name} className="w-full h-full object-cover" loading="lazy"
                    onError={e => { e.target.src = 'https://via.placeholder.com/400x300.webp?text=No+Image' }} />
            </div>
            <div className="p-3">
                <p className="font-medium text-gray-800 text-sm line-clamp-2 leading-snug">{name}</p>
                {item.description_jp && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.description_jp}</p>}
                <div className="flex items-center justify-between mt-2 flex-wrap gap-1">
                    <span className="font-bold text-amber-600 text-sm">¥{(price || 0).toLocaleString()}</span>
                    {item.is_daily_special && (
                        <span className="text-[10px] bg-red-50 text-red-500 border border-red-200 rounded-full px-2 py-0.5">本日特価</span>
                    )}
                </div>
            </div>
        </div>
    )
}

// ────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────
export default function StorePublicView() {
    const { shop_id } = useParams()
    const [store, setStore] = useState(null)
    const [menus, setMenus] = useState([])
    const [groups, setGroups] = useState([])  // 활성 메뉴 그룹 (TIME_WINDOW + MANUAL + COURSE)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)
    const [hoursOpen, setHoursOpen] = useState(false)
    const [activeSection, setActiveSection] = useState('hero')
    const [navOpen, setNavOpen] = useState(false)
    const [lineLinked, setLineLinked] = useState(false)

    // Photo Review Contest
    const [photoReviews, setPhotoReviews] = useState([])
    const [uploadModalOpen, setUploadModalOpen] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [reviewComment, setReviewComment] = useState('')
    const [reviewFile, setReviewFile] = useState(null)

    // LIFF 연동
    const { liff, isInitialized } = useLiff(import.meta.env.VITE_LINE_LIFF_ID)

    useEffect(() => {
        if (isInitialized && liff) {
            if (liff.isInClient() || liff.isLoggedIn()) {
                liff.getProfile().then(profile => {
                    const guestUuid = `line:${profile.userId}`
                    localStorage.setItem(`guest_uuid_${shop_id}`, guestUuid)
                    setLineLinked(true)
                }).catch(err => {
                    console.error('Failed to get LINE profile:', err)
                })
            }
        }
    }, [isInitialized, liff, shop_id])

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [storeRes, menuRes, groupRes, reviewRes] = await Promise.all([
                    axios.get(`/api/stores/${shop_id}`),
                    axios.get(`/api/menus/${shop_id}`),
                    axios.get(`/api/menu-groups/${shop_id}/public/homepage`).catch(() => ({ data: [] })),
                    axios.get(`/api/stores/${shop_id}/photo-reviews/public`).catch(() => ({ data: [] }))
                ])
                if (!storeRes.data.allow_public_listing) {
                    setNotFound(true); return
                }
                setStore(storeRes.data)
                setMenus(menuRes.data.filter(m => m.is_active && m.is_available))
                setGroups(Array.isArray(groupRes.data) ? groupRes.data : [])
                setPhotoReviews(Array.isArray(reviewRes.data) ? reviewRes.data : [])
            } catch {
                setNotFound(true)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [shop_id])

    // Food Rescue 표시 여부 판단 (auto/manual 모드 대응)
    const isFoodRescueVisible = (() => {
        if (!store?.food_rescue_active) return false
        // 수동 ON 중이면 항상 표시
        if (store.food_rescue_manual_active) return true
        // 자동 모드: 오늘 영업종료 N분 전 이내인지 확인
        if (store.food_rescue_mode === 'auto' && store.business_hours) {
            try {
                const hours = JSON.parse(store.business_hours)
                const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()]
                const dayData = hours[dayKey]
                if (dayData && !dayData.closed && dayData.close) {
                    const [closeH, closeM] = dayData.close.split(':').map(Number)
                    const now = new Date()
                    const closeTime = new Date(now)
                    closeTime.setHours(closeH, closeM, 0, 0)
                    const diffMs = closeTime.getTime() - now.getTime()
                    const autoMs = (store.food_rescue_auto_minutes || 60) * 60 * 1000
                    return diffMs > 0 && diffMs <= autoMs
                }
            } catch {}
        }
        return false
    })()

    // Food Rescue 카운트다운 — 자동/수동 모두 오늘 영업 마감시간까지
    const [timeLeft, setTimeLeft] = useState(0)
    useEffect(() => {
        if (!isFoodRescueVisible) { setTimeLeft(0); return }
        const getClosingTarget = () => {
            // 영업시간에서 오늘 마감 시간 읽기 (자동/수동 공통)
            if (store?.business_hours) {
                try {
                    const hours = JSON.parse(store.business_hours)
                    const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()]
                    const dayData = hours[dayKey]
                    if (dayData && !dayData.closed && dayData.close) {
                        const [h, m] = dayData.close.split(':').map(Number)
                        const t = new Date(); t.setHours(h, m, 0, 0)
                        // 이미 지난 경우(마감 후 수동 ON) → 자정 폴백
                        if (t.getTime() > Date.now()) return t.getTime()
                    }
                } catch {}
            }
            // 영업시간 미설정 시: 자정 기준
            const now = new Date()
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime()
        }
        setTimeLeft(Math.max(0, getClosingTarget() - Date.now()))
        const timer = setInterval(() => {
            setTimeLeft(Math.max(0, getClosingTarget() - Date.now()))
        }, 1000)
        return () => clearInterval(timer)
    }, [isFoodRescueVisible, store?.business_hours])

    const frHours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24)
    const frMinutes = Math.floor((timeLeft / 1000 / 60) % 60)
    const frSeconds = Math.floor((timeLeft / 1000) % 60)

    // SPC-05: document head SEO — title / meta / og / JSON-LD (Restaurant schema)
    useEffect(() => {
        if (!store) return
        const origin = window.location.origin
        const storeUrl = `${origin}/${store.slug || shop_id}`
        const desc = store.about_description || store.specialty
            || `${store.name}${store.city ? ` — ${store.city}` : ''}`

        document.title = `${store.name} | QRaku`
        document.documentElement.lang = 'ja'

        const upsert = (attr, value, content) => {
            let el = document.querySelector(`meta[${attr}="${value}"]`)
            if (!el) { el = document.createElement('meta'); el.setAttribute(attr, value); document.head.appendChild(el) }
            el.content = content
        }
        upsert('name', 'description', desc)
        upsert('property', 'og:title', store.name)
        upsert('property', 'og:description', desc)
        upsert('property', 'og:type', 'restaurant.restaurant')
        upsert('property', 'og:url', storeUrl)
        upsert('property', 'og:locale', 'ja_JP')

        const ld = {
            '@context': 'https://schema.org',
            '@type': 'Restaurant',
            name: store.name,
            description: desc,
            url: storeUrl,
            ...(store.category && { servesCuisine: store.category }),
            ...(store.address && {
                address: {
                    '@type': 'PostalAddress',
                    streetAddress: store.address,
                    addressLocality: store.city || '',
                    addressRegion: store.prefecture || '',
                    addressCountry: 'JP',
                },
            }),
            ...(store.phone && { telephone: store.phone }),
            ...(store.latitude && store.longitude && {
                geo: { '@type': 'GeoCoordinates', latitude: store.latitude, longitude: store.longitude },
            }),
        }
        let ldEl = document.getElementById('ld-json-store')
        if (!ldEl) {
            ldEl = document.createElement('script')
            ldEl.id = 'ld-json-store'
            ldEl.type = 'application/ld+json'
            document.head.appendChild(ldEl)
        }
        ldEl.textContent = JSON.stringify(ld)

        return () => {
            document.title = 'QRaku'
            document.getElementById('ld-json-store')?.remove()
        }
    }, [store, shop_id])

    const toggleGroup = (groupId) => {}

    // Photo Review Upload — LIFF 로그인 필수 (line: 접두사 guest_uuid 만 허용)
    const handlePhotoSubmit = async () => {
        if (!reviewFile) { alert('写真を選択してください。'); return; }

        const uuid = localStorage.getItem(`guest_uuid_${shop_id}`) || ''
        if (!uuid.startsWith('line:')) {
            // LIFF 미로그인 → 로그인 유도
            if (liff && !liff.isLoggedIn()) {
                liff.login()
                return
            }
            alert('LINEログインが必要です。LINEアプリ内で開くか、LINE連携を完了してください。')
            return
        }

        // 파일 크기 사전 체크 (8MB)
        if (reviewFile.size > 8 * 1024 * 1024) {
            alert('ファイルサイズは8MB以下にしてください。')
            return
        }

        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', reviewFile)
            fd.append('guest_uuid', uuid)
            if (reviewComment) fd.append('comment', reviewComment.slice(0, 500))

            await axios.post(`/api/stores/${store.id}/photo-reviews`, fd)
            alert('写真の投稿が完了しました！お店の承認後、公開されます。')
            setUploadModalOpen(false)
            setReviewFile(null)
            setReviewComment('')
        } catch (e) {
            const detail = e.response?.data?.detail
            alert(typeof detail === 'string' ? detail : 'アップロードに失敗しました。')
        } finally {
            setUploading(false)
        }
    }

    // 카테고리별 메뉴
    const menuByCategory = useMemo(() => {
        const map = {}
        menus.forEach(m => {
            const cat = m.category || 'その他'
            if (!map[cat]) map[cat] = []
            map[cat].push(m)
        })
        return map
    }, [menus])

    // 그룹별 메뉴 (런치/디너/타베호다이/노미호다이)
    const menuByGroup = useMemo(() => {
        const map = {}
        const menuMap = Object.fromEntries(menus.map(m => [m.id, m]))
        groups.forEach(g => {
            const groupMenus = (g.menu_ids || []).map(id => menuMap[id]).filter(Boolean)
            if (groupMenus.length > 0) {
                map[g.id] = { group: g, menus: groupMenus }
            }
        })
        return map
    }, [groups, menus])

    const interiorPhotos = parseList(store?.interior_photos)
    const exteriorPhotos = parseList(store?.exterior_photos)
    const attractions = parseList(store?.nearby_attractions)

    // 상단 네비게이션 섹션 정의
    const navSections = useMemo(() => {
        const sections = [{ id: 'about', label: 'お店紹介' }]
        if (store?.business_hours) sections.push({ id: 'hours', label: '営業時間' })
        // 그룹 (런치/디너/타베호다이)
        Object.values(menuByGroup).forEach(({ group }) => {
            sections.push({ id: `group-${group.id}`, label: group.name, isGroup: true })
        })
        // 카테고리
        Object.keys(menuByCategory).forEach(cat => {
            sections.push({ id: `cat-${cat}`, label: cat })
        })
        if (interiorPhotos.length > 0 || exteriorPhotos.length > 0) sections.push({ id: 'gallery', label: 'ギャラリー' })
        if (attractions.length > 0) sections.push({ id: 'around', label: '周辺案内' })
        sections.push({ id: 'access', label: 'アクセス' })
        return sections
    }, [menuByGroup, menuByCategory, interiorPhotos.length, exteriorPhotos.length, attractions.length])

    // 스크롤 이벤트로 active section 추적
    useEffect(() => {
        const handler = () => {
            const offsets = navSections.map(s => {
                const el = document.getElementById(s.id)
                if (!el) return { id: s.id, top: Infinity }
                return { id: s.id, top: Math.abs(el.getBoundingClientRect().top - 100) }
            })
            const closest = offsets.reduce((a, b) => a.top < b.top ? a : b)
            setActiveSection(closest.id)
        }
        window.addEventListener('scroll', handler, { passive: true })
        return () => window.removeEventListener('scroll', handler)
    }, [navSections])

    const scrollTo = (id) => {
        setNavOpen(false)
        const el = document.getElementById(id)
        if (el) {
            const y = el.getBoundingClientRect().top + window.pageYOffset - 80
            window.scrollTo({ top: y, behavior: 'smooth' })
        }
    }

    const takeoutUrl = `${window.location.origin}/${shop_id}/takeout`
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(takeoutUrl)}`
    const mapQuery = store?.latitude && store?.longitude
        ? `${store.latitude},${store.longitude}`
        : encodeURIComponent(store?.address || store?.name || '')

    if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
    if (notFound) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 text-center px-6">
                <p className="text-5xl">🍽️</p>
                <h1 className="text-xl font-bold text-gray-700">このお店のページは公開されていません</h1>
                <Link to="/discover" className="text-amber-600 text-sm underline">お店を探す</Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            
            {/* ── Food Rescue Banner ────────────────────────────── */}
            {isFoodRescueVisible && (
                <div className="bg-rose-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between relative overflow-hidden shrink-0 z-40">
                    <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[slide_1s_linear_infinite]"></div>
                    <div className="max-w-5xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-2 relative z-10">
                        <div className="flex items-center gap-2">
                            <Timer className="w-5 h-5 animate-pulse text-rose-200" />
                            <span className="font-bold text-sm sm:text-base tracking-wide">
                                {store.food_rescue_msg || '閉店前タイムセール開催中！'}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 font-mono font-bold text-lg bg-black/20 px-3 py-1 rounded-lg backdrop-blur-sm shadow-inner">
                                <span>{String(frHours).padStart(2, '0')}</span><span className="opacity-50 animate-pulse">:</span>
                                <span>{String(frMinutes).padStart(2, '0')}</span><span className="opacity-50 animate-pulse">:</span>
                                <span className="text-rose-200">{String(frSeconds).padStart(2, '0')}</span>
                            </div>
                            <a href={takeoutUrl} className="bg-white text-rose-600 text-xs font-black px-3 py-1.5 rounded-lg shadow-sm hover:bg-rose-50 transition-colors whitespace-nowrap">
                                注文へ
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 상단 sticky 네비 ────────────────────────────── */}
            <header className="bg-white/95 backdrop-blur-md shadow-sm sticky top-0 z-30 border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
                    {/* 로고 */}
                    <button onClick={() => scrollTo('hero')} className="flex items-center gap-2 shrink-0">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                            <span className="text-amber-600 font-black text-sm">{store.name?.[0] || '🍽'}</span>
                        </div>
                        <span className="font-bold text-gray-800 text-sm hidden sm:inline">{store.name}</span>
                    </button>

                    {/* 데스크탑 메뉴 */}
                    <nav className="hidden md:flex items-center gap-1 ml-auto overflow-x-auto hide-scrollbar">
                        {navSections.map(s => (
                            <button key={s.id} onClick={() => scrollTo(s.id)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                                    activeSection === s.id
                                        ? 'bg-amber-500 text-white'
                                        : s.isGroup
                                            ? 'text-rose-600 hover:bg-rose-50'
                                            : 'text-gray-600 hover:bg-gray-100'
                                }`}>
                                {s.label}
                            </button>
                        ))}
                    </nav>

                    {/* 모바일 햄버거 */}
                    <button onClick={() => setNavOpen(true)} className="md:hidden ml-auto p-2 hover:bg-gray-100 rounded-lg">
                        <MenuIcon className="w-5 h-5 text-gray-600" />
                    </button>
                </div>

                {/* 모바일 드로어 */}
                {navOpen && (
                    <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setNavOpen(false)}>
                        <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-xl p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-bold text-gray-800">メニュー</h3>
                                <button onClick={() => setNavOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
                            </div>
                            <div className="space-y-1">
                                {navSections.map(s => (
                                    <button key={s.id} onClick={() => scrollTo(s.id)}
                                        className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-bold ${
                                            activeSection === s.id ? 'bg-amber-500 text-white' :
                                            s.isGroup ? 'text-rose-600 hover:bg-rose-50' :
                                            'text-gray-600 hover:bg-gray-100'
                                        }`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </header>

            <div className="max-w-5xl mx-auto px-4 pb-16">

                {/* ── Hero ───────────────────────── */}
                <section id="hero" className="py-10 text-center">
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full ${
                            store.is_open ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-500 border border-red-200'
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${store.is_open ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
                            {store.is_open ? '営業中' : '準備中'}
                        </span>
                    </div>
                    <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{store.name}</h1>
                    {store.category && <p className="text-gray-400 text-sm mt-1">{store.category}</p>}
                    {store.specialty && (
                        <p className="text-amber-700 italic text-sm max-w-xl mx-auto mt-4 leading-relaxed">"{store.specialty}"</p>
                    )}
                </section>

                {/* ── 외관 사진 (히어로 직후, 있다면) ─────────────── */}
                {exteriorPhotos.length > 0 && (
                    <section className="mb-8 -mx-4">
                        <div className="aspect-[16/7] sm:aspect-[16/6] bg-gray-200 overflow-hidden sm:rounded-3xl">
                            <img src={exteriorPhotos[0]} alt="外観" className="w-full h-full object-cover" />
                        </div>
                    </section>
                )}

                {/* ── 매장 소개 (about) ─────────────────── */}
                <section id="about" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-500" /> お店紹介
                    </h2>
                    {store.about_description && (
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{store.about_description}</p>
                    )}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                        {store.address && (
                            <div className="flex items-start gap-3 text-sm text-gray-700">
                                <MapPin className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" /><span>{store.address}</span>
                            </div>
                        )}
                        {store.phone && (
                            <div className="flex items-center gap-3 text-sm text-gray-700">
                                <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                                <a href={`tel:${store.phone}`} className="hover:text-amber-600">{store.phone}</a>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 営業時間 ─────────────────── */}
                {store.business_hours && (
                    <section id="hours" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-amber-500" /> 営業時間
                        </h2>
                        <div className="pt-2 border-t border-gray-100">
                            <BusinessHoursTable raw={store.business_hours} />
                        </div>
                    </section>
                )}

                {/* ── 그룹별 메뉴 (런치/디너/타베호다이) ───────── */}
                {Object.values(menuByGroup).map(({ group, menus: gMenus }) => (
                    <section key={group.id} id={`group-${group.id}`} className="mb-8">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-rose-200">
                            <span className="bg-rose-500 text-white text-xs font-black px-2 py-0.5 rounded-full">特集</span>
                            <h2 className="text-lg font-bold text-rose-600">{group.name}</h2>
                            {group.group_type === 'time_window' && group.active_from && group.active_to && (
                                <span className="text-xs text-gray-400">{group.active_from} – {group.active_to}</span>
                            )}
                            {group.group_type === 'course' && group.price_per_person && (
                                <span className="text-xs text-rose-500 ml-auto">¥{group.price_per_person.toLocaleString()} / 1名</span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {gMenus.map(m => <MenuCard key={m.id} item={m} />)}
                        </div>
                    </section>
                ))}

                {/* ── 카테고리별 메뉴 ─────────────────── */}
                {Object.entries(menuByCategory).map(([cat, items]) => (
                    <section key={cat} id={`cat-${cat}`} className="mb-8">
                        <h2 className="text-lg font-bold text-amber-700 mb-3 pb-2 border-b border-amber-200">{cat}</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {items.map(m => <MenuCard key={m.id} item={m} />)}
                        </div>
                    </section>
                ))}

                {/* ── 내장 갤러리 ─────────────────────── */}
                {(interiorPhotos.length > 0 || exteriorPhotos.length > 1) && (
                    <section id="gallery" className="mb-8">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <ImageIcon className="w-5 h-5 text-amber-500" /> ギャラリー
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[...exteriorPhotos.slice(1), ...interiorPhotos].map((url, i) => (
                                <div key={i} className="aspect-square bg-gray-100 rounded-2xl overflow-hidden">
                                    <img src={url} alt="" loading="lazy" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── 포토 리뷰 콘테스트 (SEO & 바이럴) ─────────────────────── */}
                {store.photo_contest_active && (
                    <section id="photo-reviews" className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Camera className="w-5 h-5 text-indigo-500" /> みんなの美味しい瞬間
                            </h2>
                            <button onClick={() => setUploadModalOpen(true)} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors border border-indigo-100">
                                <Plus className="w-3.5 h-3.5" /> 写真を投稿
                            </button>
                        </div>
                        {photoReviews.length === 0 ? (
                            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center">
                                <Camera className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-500 font-medium">最初の写真を投稿してみませんか？</p>
                                <p className="text-xs text-gray-400 mt-1">選ばれた方には割引クーポンプレゼント！</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {photoReviews.map((r, i) => (
                                    <div key={i} className="relative group bg-gray-100 rounded-2xl overflow-hidden aspect-square">
                                        <img src={r.image_url} alt={r.comment || `${store.store_name}の美味しい写真`} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        {r.status === 'best_of_month' && (
                                            <div className="absolute top-2 right-2 bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-md">
                                                🏆 今月の写真
                                            </div>
                                        )}
                                        {r.comment && (
                                            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/70 to-transparent p-3 pt-6">
                                                <p className="text-white text-xs font-medium line-clamp-2 text-shadow-sm">{r.comment}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* ── 주변 관광지 ─────────────────────── */}
                {attractions.length > 0 && (
                    <section id="around" className="mb-8">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Globe className="w-5 h-5 text-amber-500" /> 周辺おすすめスポット
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {attractions.map((a, i) => (
                                <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex">
                                    {a.image_url && (
                                        <div className="w-24 h-24 bg-gray-100 shrink-0">
                                            <img src={a.image_url} alt={a.name} className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <div className="p-3 flex-1">
                                        <p className="font-bold text-sm text-gray-800">{a.name}</p>
                                        {a.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.description}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── 액세스 (지도 + 테이크아웃 QR + LINE) ───────── */}
                <section id="access" className="mb-8 space-y-6">
                    {/* 지도 */}
                    {(store.address || (store.latitude && store.longitude)) && (
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-amber-500" /> アクセス
                            </h2>
                            <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 aspect-video">
                                <iframe title="地図" width="100%" height="100%" style={{ border: 0 }}
                                    loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                                    src={`https://www.google.com/maps?q=${mapQuery}&output=embed`} />
                            </div>
                            {store.address && (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-amber-600 mt-2 hover:underline">
                                    Google マップで開く <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </div>
                    )}

                    {/* 테이크아웃 QR */}
                    {menus.some(m => m.is_takeout_available) && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col sm:flex-row items-center gap-6">
                            <div className="shrink-0 p-2 bg-white border border-gray-200 rounded-xl">
                                <img src={qrImageUrl} alt="テイクアウト QR" width={180} height={180} />
                            </div>
                            <div className="text-center sm:text-left space-y-2 w-full">
                                <div className="flex items-center justify-center sm:justify-start gap-2">
                                    <ShoppingBag className="w-5 h-5 text-amber-500" />
                                    <h3 className="font-bold text-gray-800">スマホで事前注文</h3>
                                </div>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    QR コードをスキャンしてオンラインで注文・決済。準備ができた頃に来店してすぐお受け取りいただけます。
                                </p>
                                
                                {lineLinked && (
                                    <div className="bg-emerald-50 text-emerald-600 text-xs px-3 py-1.5 rounded-lg font-bold flex items-center justify-center sm:justify-start gap-1 w-fit mx-auto sm:mx-0">
                                        <CheckCircle className="w-3.5 h-3.5" /> LINEで自動ログイン済み
                                    </div>
                                )}
                                
                                <a href={takeoutUrl} className="inline-flex items-center justify-center sm:justify-start gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl w-full sm:w-auto text-center mt-2">
                                    <QrCode className="w-4 h-4" /> 今すぐ注文する
                                </a>
                            </div>
                        </div>
                    )}

                    {/* LINE */}
                    {store.line_friend_url && (
                        <div className="bg-[#06C755] rounded-2xl p-5 flex items-center justify-between shadow-sm">
                            <div className="text-white">
                                <p className="font-bold text-sm">LINE で友だち追加</p>
                                <p className="text-xs text-green-100 mt-0.5">クーポンや最新情報をお届けします</p>
                            </div>
                            <a href={store.line_friend_url} target="_blank" rel="noopener noreferrer"
                                className="bg-white text-[#06C755] font-bold text-sm px-4 py-2 rounded-xl hover:bg-green-50 transition-colors shrink-0">
                                友だち追加
                            </a>
                        </div>
                    )}
                </section>

                {/* ── 마이크로 채용 보드 (Micro Job Board) ────────────────── */}
                {store?.job_board_active && (
                    <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-6 md:p-8 shadow-sm border border-blue-100 mb-8 overflow-hidden relative">
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500 rounded-full opacity-5 blur-2xl"></div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-blue-500 rounded-xl shadow-inner text-white">
                                <Briefcase className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-black text-gray-900 text-lg">スタッフ募集中！</h3>
                                <p className="text-xs font-bold text-blue-600">私たちと一緒に働きませんか？</p>
                            </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 text-gray-700 text-sm leading-relaxed border border-white shadow-sm whitespace-pre-wrap">
                            {store.job_board_text || '現在、ホールスタッフを募集しています。お気軽にお店までお問い合わせください。'}
                        </div>
                        <div className="mt-5 text-right">
                            <a href={`tel:${store.phone || ''}`} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm">
                                <Phone className="w-4 h-4" /> お電話で問い合わせ
                            </a>
                        </div>
                    </section>
                )}

                {/* ── 푸터 ────────────────── */}
                <footer className="text-center text-xs text-gray-300 pt-6 border-t border-gray-100">
                    Powered by <a href="/" className="text-amber-400 hover:underline">QRaku</a>
                </footer>
            </div>

            {/* Photo Upload Modal */}
            {uploadModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-black text-gray-800 flex items-center gap-2">
                                <Camera className="w-5 h-5 text-indigo-500" /> 写真を投稿する
                            </h3>
                            <button onClick={() => setUploadModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
                                <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-indigo-900 mb-1">今月の写真に選ばれるとクーポンGet!</p>
                                    <p className="text-xs text-indigo-700/80 leading-relaxed">
                                        美味しい瞬間の写真をシェアしてください。素敵な写真は「今月の写真」として選ばれ、次回使えるテイクアウト割引クーポンが自動で届きます🎁
                                    </p>
                                </div>
                            </div>

                            {/* LIFF 미로그인 시 안내 */}
                            {!lineLinked && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 flex items-start gap-2">
                                    <span className="text-yellow-500 shrink-0">⚠️</span>
                                    <p className="text-xs text-yellow-800 leading-relaxed">
                                        投稿には<strong>LINE連携</strong>が必要です。LINEアプリで開くか、ボタンを押してLINE連携を完了してください（不正投稿防止のため）
                                    </p>
                                </div>
                            )}
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-2">📸 写真を選ぶ (必須)</label>
                                <input type="file" accept="image/*" onChange={e => setReviewFile(e.target.files[0])}
                                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-gray-200 rounded-xl p-1" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-2">💬 コメント (任意)</label>
                                <textarea rows="3" placeholder="美味しかったメニューの感想など" value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                                    className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none bg-gray-50 focus:bg-white transition-colors" />
                            </div>
                            <button onClick={handlePhotoSubmit} disabled={!reviewFile || uploading}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-200">
                                {uploading ? '送信中...' : '投稿する'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    )
}
