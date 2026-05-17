import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useOutletContext } from 'react-router-dom'
import MagnoliaCategoryTabs from '../components/magnolia/MagnoliaCategoryTabs'
import MagnoliaMenuCard from '../components/magnolia/MagnoliaMenuCard'
import MagnoliaFloatingCart from '../components/magnolia/MagnoliaFloatingCart'
import MagnoliaCartModal from '../components/magnolia/MagnoliaCartModal'
import { useCart } from '../hooks/useCart'
import { useLiff } from '../hooks/useLiff'
import { computeStoreStatus } from '../utils/businessHours'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'
import { useSession } from '../context/SessionContext'
import { AlertCircle, Lock } from 'lucide-react'
import SakuraThemeView from './themes/SakuraThemeView'
import CosmosThemeView from './themes/CosmosThemeView'
import SunflowerThemeView from './themes/SunflowerThemeView'
import LavenderThemeView from './themes/LavenderThemeView'
import AjisaiThemeView from './themes/AjisaiThemeView'
import CamelliaThemeView from './themes/CamelliaThemeView'
import BambooThemeView from './themes/BambooThemeView'
import TakeoutTimeQueryView from './TakeoutTimeQueryView'
import TabehoudaiBanner from '../components/TabehoudaiBanner'
import { useWebSocket } from '../hooks/useWebSocket'

const TAKEOUT_CAT = '🥡 テイクアウト'

export default function OrderView({ orderType: propOrderType } = {}) {
    const { shop_id: paramStoreId, tableNumber: paramTableNumber } = useParams()
    const { storeId: sessionStoreId, tableNumber: sessionTableNumber, deviceToken } = useSession()

    const storeId = paramStoreId || sessionStoreId
    const tableNumber = paramTableNumber || sessionTableNumber

    // Detect take_out mode from prop (route) or URL path
    const location = useLocation()
    const isTakeOut = propOrderType === 'take_out' || location.pathname.endsWith('/takeout')

    const navigate = useNavigate()
    const { t } = useLanguage()
    const { currentTheme: contextTheme, setCurrentTheme, applyStoreTheme } = useTheme()

    // storeData is provided by StoreLayout via Outlet context
    // All OrderView routes are inside <StoreLayout />, so this is always available
    const outletContext = useOutletContext() || {}
    const storeData = outletContext.storeData || null
    const devTheme = outletContext.devTheme || null

    const query = new URLSearchParams(location.search)
    const qrToken = query.get('token') || sessionStorage.getItem('qrToken') || ""

    // If session_token is provided via URL (e.g. demo iframe), seed it into localStorage
    const urlSessionToken = query.get('session_token')
    useEffect(() => {
        if (urlSessionToken && storeId && tableNumber) {
            const storageKey = `tableSessionToken_${storeId}_${tableNumber}`
            localStorage.setItem(storageKey, urlSessionToken)
        }
    }, [urlSessionToken, storeId, tableNumber])

    // 4. Force Apply Theme Immediately
    const themeParam = query.get('theme')
    useEffect(() => {
        if (themeParam) {
            applyStoreTheme(themeParam)
        } else if (storeData?.theme && !localStorage.getItem('theme-user-selected')) {
            // 유저가 직접 테마를 선택하지 않은 경우에만 스토어 기본 테마 적용
            applyStoreTheme(storeData.theme)
        }
    }, [themeParam, storeData?.theme, applyStoreTheme])

    const [menus, setMenus] = useState([])
    const [categories, setCategories] = useState([])
    const [tabehoudaiSession, setTabehoudaiSession] = useState(null)
    const [activeCategory, setActiveCategory] = useState(() => {
        return sessionStorage.getItem(`category_${storeId}`) || 'All'
    })
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [isInvalidToken, setIsInvalidToken] = useState(false)
    const [tokenErrorMsg, setTokenErrorMsg] = useState('')
    const [isCartOpen, setIsCartOpen] = useState(false)
    const [tableData, setTableData] = useState(null)
    const [placingOrder, setPlacingOrder] = useState(false)
    const [sessionToken, setSessionToken] = useState(null)
    const [isLocked, setIsLocked] = useState(false)
    const [orderSuccessToast, setOrderSuccessToast] = useState(false)
    const [showTimeQuery, setShowTimeQuery] = useState(false)   // 조리시간 문의 모달
    const [agreedPickupTime, setAgreedPickupTime] = useState(null) // 합의된 픽업 시간

    // LINE Digital Stamp
    const [stampStatus, setStampStatus] = useState(null)
    const [useStampReward, setUseStampReward] = useState(false)

    // Photo Review Contest Coupons
    const [guestCoupons, setGuestCoupons] = useState([])
    const [useCouponId, setUseCouponId] = useState(null)

    // 食べ放題 대상 메뉴 ID Set — 모든 early return 위에 위치해야 함 (Hook 순서 일관성)
    const tabehoudaiMenuIds = useMemo(() => {
        if (!tabehoudaiSession || tabehoudaiSession.status !== 'active') return new Set()
        return new Set(tabehoudaiSession.menu_ids || [])
    // 의도적으로 의존성 누락 — tabehoudaiSession state 객체로 계산
    }, [tabehoudaiSession])

    // LIFF (LINE) — 로그인된 사용자라면 guest_uuid 를 line:{userId} 로 덮어써서
    // 백엔드의 stamp 적립 로직(orders.py)에 진입할 수 있도록 한다.
    const { liff, isInitialized: liffReady } = useLiff(import.meta.env.VITE_LINE_LIFF_ID)
    useEffect(() => {
        if (!liffReady || !liff || !storeId) return
        try {
            if (liff.isInClient() || liff.isLoggedIn()) {
                liff.getProfile().then(profile => {
                    const lineUuid = `line:${profile.userId}`
                    localStorage.setItem(`guest_uuid_${storeId}`, lineUuid)
                }).catch(err => console.error('LIFF getProfile failed', err))
            }
        } catch (err) {
            console.error('LIFF check failed', err)
        }
    }, [liffReady, liff, storeId])

    // 요리완료 모달 상태
    const [completedModal, setCompletedModal] = useState(null) // { items: [...] }

    const { cart, addToCart, removeFromCart, updateQuantity, clearCart, totalQuantity, totalAmount } = useCart()

    // ── 손님 오디오 잠금 해제 ─────────────────────────────────────────────────
    // audioUnlocked をセッションに保存（ページ遷移時にリセットされないように）
    const [audioUnlocked, setAudioUnlocked] = useState(() => {
        return sessionStorage.getItem(`audioUnlocked_${storeId}`) === 'true'
    })
    const audioCtxRef = useRef(null)
    const [callStaffSent, setCallStaffSent] = useState(false)

    const handleUnlockAudio = async () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            // 무음 재생으로 브라우저 정책 우회
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            gain.gain.value = 0.001
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start()
            osc.stop(ctx.currentTime + 0.01)
            audioCtxRef.current = ctx
        } catch (e) {
            console.warn('AudioContext init failed:', e)
        }
        setAudioUnlocked(true)
        sessionStorage.setItem(`audioUnlocked_${storeId}`, 'true')
    }

    const playDingDong = useCallback(() => {
        try {
            const ctx = audioCtxRef.current
            if (!ctx) return
            const playTone = (freq, start, dur) => {
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain); gain.connect(ctx.destination)
                osc.frequency.value = freq; osc.type = 'sine'
                gain.gain.setValueAtTime(0.5, start)
                gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
                osc.start(start); osc.stop(start + dur)
            }
            playTone(660, ctx.currentTime, 0.5)
            playTone(880, ctx.currentTime + 0.55, 0.6)
        } catch (e) { console.warn('Customer audio play error:', e) }
    }, [])

    // 1. Verify Session or Join Table
    const verifySessionOrJoin = async () => {
        // Take-out mode: no session/table required — just load menus
        if (isTakeOut) {
            fetchMenus()
            return
        }

        try {
            // First get the real table id to use with the new APIs
            const tablesRes = await axios.get(`/api/stores/${storeId}/tables`)
            const table = tablesRes.data.find(t => String(t.table_number) === String(tableNumber))

            if (!table) {
                console.warn("Table not found in store.")
                setIsInvalidToken(true)
                setTokenErrorMsg("テーブルが見つかりません。QRコードを再度スキャンしてください。")
                setLoading(false)
                return
            }

            setTableData(table)

            // ── Session Recovery: Check localStorage for existing valid session ──
            // QR 5분 윈도우가 지나도 이미 join 했던 세션은 유효
            const storageKey = `tableSessionToken_${storeId}_${tableNumber}`
            const savedToken = localStorage.getItem(storageKey)

            if (savedToken) {
                try {
                    const verifyRes = await axios.post(`/api/customer/tables/${table.id}/verify-session`, {
                        session_token: savedToken
                    })
                    if (verifyRes.data.valid) {
                        setSessionToken(savedToken)
                        setIsInvalidToken(false)
                        fetchMenus()
                        return
                    }
                } catch (verifyErr) {
                    console.warn("Session verify API failed, will try join.", verifyErr)
                }
                // Token invalid or expired (table closed), remove it
                localStorage.removeItem(storageKey)
            }

            // No valid saved session — attempt to Join (requires join_window_end not expired)
            try {
                const joinRes = await axios.post(`/api/customer/tables/${table.id}/join`)
                const newToken = joinRes.data.session_token

                // 세션 복구용: localStorage에 즉시 저장
                localStorage.setItem(storageKey, newToken)
                setSessionToken(newToken)
                setIsInvalidToken(false)
                fetchMenus()

            } catch (joinErr) {
                // Join failed (Table not open or time window expired)
                setIsInvalidToken(true)
                setTokenErrorMsg(joinErr.response?.data?.detail || "セッションの有効期限が切れました。スタッフにQR時間の延長をお願いしてください。")
                setLoading(false)
            }

        } catch (e) {
            console.error("Session verification/join failed.", e)
            setIsInvalidToken(true)
            setTokenErrorMsg("接続エラーが発生しました。ページをリロードしてください。")
            setLoading(false)
        }
    }

    // 3. Fetch Menus
    const fetchMenus = async () => {
        try {
            const res = await axios.get(`/api/menus/${storeId}?filter_groups=true`)
            const extractArray = (data) => Array.isArray(data) ? data : (data?.data || data?.items || [])
            const menuArray = extractArray(res.data)

            if (menuArray.length > 0) {
                // Takeout QR page: restrict to takeout-available menus only
                const visibleMenus = isTakeOut ? menuArray.filter(m => m.is_takeout_available) : menuArray
                setMenus(visibleMenus)
                const baseCats = ['All', ...Array.from(new Set(visibleMenus.map(m => m.category))).filter(c => c && c.toLowerCase() !== 'all')]
                // Eat-in mode: append virtual takeout category if any item supports takeout
                const hasTakeoutItems = !isTakeOut && menuArray.some(m => m.is_takeout_available)
                const cats = hasTakeoutItems ? [...baseCats, TAKEOUT_CAT] : baseCats
                setCategories(cats)
                // Keep user's previous selection if valid, otherwise default to 'All'
                const saved = sessionStorage.getItem(`category_${storeId}`)
                if (saved && cats.includes(saved)) {
                    setActiveCategory(saved)
                } else {
                    setActiveCategory('All')
                }
            } else {
                setMenus([])
            }
        } catch (e) {
            console.error("Menu fetch failed, loading empty.", e)
            setMenus([])
            setCategories(['All'])
            setActiveCategory('All')
        } finally {
            setLoading(false)
        }
    }

    // 4. Fetch Stamp & Coupon Status
    useEffect(() => {
        const fetchUserData = async () => {
            const guestUuid = localStorage.getItem(`guest_uuid_${storeId}`)
            if (!guestUuid || !storeData?.id) return
            try {
                const [stampRes, couponRes] = await Promise.all([
                    axios.get(`/api/guests/${guestUuid}/stamps/${storeData.id}`).catch(() => ({ data: null })),
                    axios.get(`/api/guests/${guestUuid}/coupons/${storeData.id}`).catch(() => ({ data: [] }))
                ])
                if (stampRes.data) setStampStatus(stampRes.data)
                if (couponRes.data) setGuestCoupons(couponRes.data)
            } catch (e) {
                console.error("Failed to fetch user data", e)
            }
        }
        fetchUserData()
    }, [storeData?.id, storeId])

    // handlePlaceOrder(selectedPayment, sourceId, pickupTime)
    // - eat_in : handlePlaceOrder('cash_at_counter')
    // - take_out: handlePlaceOrder('square', squareNonce, '12:30')
    const handlePlaceOrder = async (selectedPayment = 'cash_at_counter', sourceId = null, pickupTime = null) => {
        if (!isTakeOut && !tableData) {
            alert("⚠️ 테이블 정보가 없습니다. 매장의 QR 코드를 통해 다시 접속해 주세요.")
            return
        }
        if (cart.length === 0) {
            alert("🛒 장바구니가 비어 있습니다. 메뉴를 추가해 주세요.")
            return
        }

        setPlacingOrder(true)
        try {
            const orderPayload = {
                shop_id: String(storeId),
                table_number: isTakeOut ? '0' : String(tableNumber || tableData?.table_number || '1'),
                session_token: isTakeOut ? 'takeout' : sessionToken,
                order_type: isTakeOut ? "take_out" : "eat_in",
                payment_method: selectedPayment,
                source_id: sourceId,
                pickup_time: pickupTime,
                guest_uuid: localStorage.getItem(`guest_uuid_${storeId}`) || null,
                use_stamp_reward: useStampReward,
                use_coupon_id: useCouponId,
                items: cart.map(item => ({
                    menu_item_id: String(item.menuId),
                    quantity: item.quantity,
                    option_details: JSON.stringify(item.options || {}),
                    is_takeout_item: Boolean(item.isTakeoutItem)
                }))
            }

            const res = await axios.post('/api/orders/', orderPayload)

            clearCart()
            setIsCartOpen(false)

            if (!isTakeOut && tableData) {
                // Eat-in: show success toast, allow additional orders
                setOrderSuccessToast(true)
                setTimeout(() => setOrderSuccessToast(false), 4000)
            } else {
                // Take-out: show receipt
                navigate(`/${storeId}/receipt/${res.data.order_id}`)
            }

        } catch (e) {
            console.error("Order failed! Full error info:", {
                url: e.config?.url,
                method: e.config?.method,
                data: e.config?.data,
                status: e.response?.status,
                statusText: e.response?.statusText,
                responseBody: e.response?.data
            })
            alert("Order failed: " + (e.response?.data?.detail || "Unknown error"))
        } finally {
            setPlacingOrder(false)
        }
    }

    useEffect(() => {
        verifySessionOrJoin()
    }, [storeId, tableNumber, qrToken])

    // 食べ放題 활성 세션 폴링 (배너 + 메뉴 뱃지용)
    useEffect(() => {
        if (!tableData?.id || isTakeOut) {
            setTabehoudaiSession(null)
            return
        }
        let cancelled = false
        const fetchSession = async () => {
            try {
                const res = await axios.get(`/api/tabehoudai/sessions/active/by-table/${tableData.id}`)
                if (!cancelled) setTabehoudaiSession(res.data || null)
            } catch {
                if (!cancelled) setTabehoudaiSession(null)
            }
        }
        fetchSession()
        const interval = setInterval(fetchSession, 30000)
        return () => { cancelled = true; clearInterval(interval) }
    }, [tableData?.id, isTakeOut])

    // 손님 WebSocket 연결 (요리완료 알림 수신용) — audioUnlocked 이후에만 연결
    // storeData.id (numeric) comes from StoreLayout outlet context
    useWebSocket({
        audience: 'customer',
        storeId: audioUnlocked ? storeData?.id : null,
        tableNumber,
        onEvent: useCallback((event) => {
            if (event.type === 'order_completed') {
                playDingDong()
                setCompletedModal({ items: event.items || event.data?.items || [] })
                setTimeout(() => setCompletedModal(null), 5000)
            }
        }, [playDingDong]),
    })

    // Duplicate theme param code here is removed.

    const isTakeoutCategory = activeCategory === TAKEOUT_CAT
    const filteredMenus = useMemo(() => {
        return menus.filter(m => {
            const matchCategory = activeCategory === 'All'
                || (isTakeoutCategory ? m.is_takeout_available : m.category === activeCategory);
            if (!searchQuery) return matchCategory;
            const q = searchQuery.toLowerCase();
            const matchSearch = (m.name?.toLowerCase().includes(q)) || 
                                (m.name_jp?.toLowerCase().includes(q)) ||
                                (m.name_en?.toLowerCase().includes(q)) ||
                                (m.description?.toLowerCase().includes(q)) ||
                                (m.description_jp?.toLowerCase().includes(q)) ||
                                (m.description_en?.toLowerCase().includes(q));
            return matchCategory && matchSearch;
        })
    }, [menus, activeCategory, searchQuery])

    const handleAddToCart = (e, item, quantity = 1, options = {}) => {
        // ── 영업시간 외 / 임시 휴업 차단 ───────────────────────────────
        const status = computeStoreStatus(storeData)
        if (!status.open) {
            const msgMap = {
                manual_off: '現在準備中のため、ご注文いただけません。',
                before_open: '営業時間前のため、ご注文いただけません。',
                after_close: '本日の営業時間が終了しました。',
            }
            alert(msgMap[status.reason] || '営業時間外のため、ご注文いただけません。')
            return
        }
        const asTakeout = isTakeOut || isTakeoutCategory
        addToCart(item, quantity, options, asTakeout)
    }

    // ── 손님 오디오 잠금 해제 오버레이 ──────────────────────────────────────────
    // 세션 로딩 중에도 표시, 클릭 시 AudioContext 활성화 후 메뉴 화면 진입. 데모 모드에서는 생략
    if (!audioUnlocked && !loading && sessionStorage.getItem('demo_mode') !== 'true') {
        return (
            <div className="fixed inset-0 z-[200] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-8 text-center">
                {/* 배경 장식 */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {['🌸', '🌸', '🌸', '🌸', '🌸'].map((s, i) => (
                        <span key={i} className="absolute text-2xl opacity-10 animate-pulse"
                            style={{ left: `${15 + i * 18}%`, top: `${20 + (i % 3) * 25}%`, animationDelay: `${i * 0.5}s` }}
                        >{s}</span>
                    ))}
                </div>
                <div className="relative z-10 flex flex-col items-center gap-6 max-w-xs w-full">
                    {/* 로고 */}
                    <div className="w-28 h-28 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-6xl">
                        🌸
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold text-white tracking-tight">いらっしゃいませ</h1>
                        <p className="text-slate-400 text-sm">어서오세요! 주문을 시작하려면 아래 버튼을 눌러 주세요.</p>
                    </div>



                    <button
                        onClick={handleUnlockAudio}
                        className="w-full py-5 bg-primary hover:opacity-90 active:scale-95 text-white text-lg font-black rounded-2xl shadow-2xl shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-3"
                    >
                        <span className="text-2xl">🔔</span>
                        주문 시작하기
                    </button>
                    <p className="text-slate-600 text-xs italic">
                        알림 소리 활성화를 위해 한 번의 탭이 필요합니다.
                    </p>
                </div>
            </div>
        )
    }

    // ── Call Staff ───────────────────────────────────────────────────────────
    const handleCallStaff = async () => {
        if (!tableData?.id || callStaffSent) return
        try {
            await axios.post(`/api/customer/tables/${tableData.id}/call-staff`)
            setCallStaffSent(true)
            setTimeout(() => setCallStaffSent(false), 10000) // cooldown 10s
        } catch (e) {
            console.warn('Call staff failed:', e)
        }
    }

    // ── Checkout Request (explicit) ──────────────────────────────────────────
    const handleCheckoutRequest = async () => {
        if (!tableData?.id) return
        try {
            await axios.post(`/api/customer/tables/${tableData.id}/checkout-request`, {
                session_token: sessionToken
            })
        } catch (_) { /* non-critical */ }
        setIsLocked(true)
    }

    if (isLocked) {

        return (
            <div className="fixed inset-0 z-[100] bg-charcoal flex flex-col items-center justify-center p-8 text-center">
                <div className="fixed inset-0 soft-glow-bg opacity-50"></div>
                <div className="relative z-10 space-y-6">
                    <div className="w-20 h-20 bg-gold/10 border border-gold/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="text-gold w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-serif italic text-white whitespace-pre-wrap">お会計をお待ちください</h2>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
                        スタッフがお伺いします。<br />
                        (Staff will be with you shortly.)
                    </p>
                    {/* Call Staff Button */}
                    {!isTakeOut && tableData && (
                        <button
                            onClick={handleCallStaff}
                            disabled={callStaffSent}
                            className={`mt-4 px-8 py-3 rounded-full font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 mx-auto ${
                                callStaffSent
                                    ? 'bg-green-600 text-white cursor-not-allowed'
                                    : 'bg-red-500 hover:bg-red-600 text-white active:scale-95'
                            }`}
                        >
                            <span className="text-lg">🔔</span>
                            {callStaffSent ? 'スタッフを呼びました!' : 'スタッフを呼ぶ'}
                        </button>
                    )}
                </div>
            </div>
        )
    }

    // --- Premium Overlay UI for Invalid States ---
    if (isInvalidToken) {
        return (
            <div className="fixed inset-0 z-[100] bg-charcoal flex flex-col items-center justify-center p-8 text-center">
                <div className="fixed inset-0 soft-glow-bg opacity-50"></div>
                <div className="relative z-10 space-y-6">
                    <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <AlertCircle className="text-red-500 w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-serif italic text-white whitespace-pre-wrap">{t('access_denied_title') || "Access Denied"}</h2>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
                        {tokenErrorMsg || t('access_denied_msg') || "The QR code session is either invalid or expired. Please ask the staff to open the table."}
                    </p>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest pt-4">Error Code: AUTH_SESSION_EXPIRED</p>
                    <div className="flex gap-4 justify-center mt-6">
                        <button
                            onClick={verifySessionOrJoin}
                            className="px-6 py-2 border border-white/20 text-white text-sm rounded-full hover:bg-white/10 transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (storeData?.subscription_status === 'EXPIRED') {
        return (
            <div className="fixed inset-0 z-[100] bg-charcoal flex flex-col items-center justify-center p-8 text-center">
                <div className="fixed inset-0 soft-glow-bg opacity-50"></div>
                <div className="relative z-10 space-y-6">
                    <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="text-amber-500 w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-serif italic text-white">Subscription Expired</h2>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
                        We're sorry! The service for this store is currently unavailable due to maintenance or subscription expiry.
                    </p>
                </div>
            </div>
        )
    }

    // 외부 테이크아웃에 선결제 가능 여부 체크 (서버에서 계산한 플래그 사용)
    // can_accept_takeout = takeout_enabled && has_online_payment
    const canAcceptTakeout = Boolean(storeData?.can_accept_takeout)
    const takeoutEnabled = Boolean(storeData?.takeout_enabled)
    const hasOnlinePayment = Boolean(storeData?.has_online_payment)

    // 외부 테이크아웃 — 장바구니에서 "주문" 시 시간 문의 먼저 진행
    const handleCartCheckout = () => {
        if (isTakeOut && !tableNumber) {
            if (!takeoutEnabled) {
                alert('この店舗ではテイクアウト注文を受け付けていません。')
                return
            }
            if (!hasOnlinePayment) {
                alert('このお店はオンライン決済が未設定のため、テイクアウト注文はご利用いただけません。')
                return
            }
            // 외부 손님: 조리시간 문의 모달 열기
            setIsCartOpen(false)
            setShowTimeQuery(true)
        } else {
            // 이트인 테이블 손님의 테이크아웃 아이템: 바로 주문
            setIsCartOpen(true)
        }
    }

    // 食べ放題 대상 메뉴 ID Set — early return 위쪽에서 이미 정의됨

    // 영업 상태 (영업시간 + is_open 토글 종합)
    const storeStatus = computeStoreStatus(storeData)
    const storeOpen = storeStatus.open

    // Dynamic Theme Rendering
    const themeProps = {
        storeId,
        tableNumber,
        activeCategory,
        setActiveCategory,
        searchQuery,
        setSearchQuery,
        categories,
        menus,
        loading,
        t,
        cart,
        totalQuantity,
        totalAmount,
        tabehoudaiMenuIds,
        storeOpen,
        onAddToCart: handleAddToCart,
        onCheckout: handleCartCheckout,
    }

    const cartModalProps = {
        isOpen: isCartOpen,
        onClose: () => setIsCartOpen(false),
        cart,
        onRemove: removeFromCart,
        onUpdateQuantity: updateQuantity,
        onClear: clearCart,
        totalAmount,
        onPlaceOrder: handlePlaceOrder,
        loading: placingOrder,
        storePaymentOptions: storeData?.payment_options || 'cash_only',
        orderType: isTakeOut ? 'take_out' : 'eat_in',
        agreedPickupTime,
        squareAppId: storeData?.square_application_id || import.meta.env?.VITE_SQUARE_APP_ID || null,
        squareLocationId: storeData?.square_location_id || null,
        paymentMethodType: storeData?.payment_settings?.payment_method_type || null,
        shopId: storeData?.id || storeId,
        defaultWaitMinutes: storeData?.takeout_default_wait_minutes || 15,
        stampStatus,
        useStampReward,
        setUseStampReward,
        guestCoupons,
        useCouponId,
        setUseCouponId,
    }

    // 유저가 선택한 테마(contextTheme)를 storeData.theme보다 우선 적용
    const activeCurrentTheme = themeParam || devTheme || contextTheme || storeData?.theme

    if (loading && !storeData && menus.length === 0) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center pt-20">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-white/60 font-serif italic">{t('loading') || 'Loading Menu...'}</p>
                </div>
            </div>
        )
    }

    const renderThemeContent = () => {
        switch (activeCurrentTheme) {
            case 'sakura': return <SakuraThemeView {...themeProps} />
            case 'cosmos': return <CosmosThemeView {...themeProps} />
            case 'sunflower': return <SunflowerThemeView {...themeProps} />
            case 'lavender': return <LavenderThemeView {...themeProps} />
            case 'ajisai': return <AjisaiThemeView {...themeProps} />
            case 'bamboo': return <BambooThemeView {...themeProps} />
            case 'tsubaki':
            default:
                return <CamelliaThemeView {...themeProps} />
        }
    }

    // 영업시간 외 안내 메시지
    const closedMessage = (() => {
        switch (storeStatus.reason) {
            case 'manual_off': return '現在準備中です'
            case 'before_open': return '営業時間前です — 開店までお待ちください'
            case 'after_close': return '本日の営業は終了しました'
            default: return '営業時間外のため、ご注文いただけません'
        }
    })()

    return (
        <div className="relative">
            {/* 영업시간 외 빨간 배너 (sticky top) */}
            {!storeOpen && storeStatus.reason !== 'no_data' && (
                <div className="sticky top-0 z-[60] bg-red-600 text-white text-center py-2.5 px-4 shadow-lg">
                    <p className="text-sm font-bold flex items-center justify-center gap-2">
                        <span className="text-base">⚠️</span>
                        <span>{closedMessage}</span>
                    </p>
                    <p className="text-[10px] opacity-90 mt-0.5">注文は受け付けておりません</p>
                </div>
            )}

            {/* 食べ放題セッション バナー (table별) */}
            {!isTakeOut && tableData?.id && <TabehoudaiBanner session={tabehoudaiSession} />}

            {/* Theme Content */}
            <div className="relative z-0 pb-32">
                {renderThemeContent()}
            </div>

            {/* Order Success Toast */}
            {orderSuccessToast && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] animate-[slideDown_0.3s_ease-out]">
                    <div className="bg-green-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold text-sm">
                        <span className="text-xl">✅</span>
                        <span>注文が送信されました！</span>
                    </div>
                </div>
            )}

            {/* 테이크아웃 조리 시간 문의 모달 (외부 손님) */}
            {showTimeQuery && (
                <TakeoutTimeQueryView
                    cart={cart}
                    totalAmount={totalAmount}
                    storeId={storeId}
                    squareAppId={storeData?.square_application_id || import.meta.env?.VITE_SQUARE_APP_ID || null}
                    squareLocationId={storeData?.square_location_id || null}
                    onConfirmedOrder={(time) => {
                        setAgreedPickupTime(time)
                        setShowTimeQuery(false)
                        setIsCartOpen(true)  // 합의 후 카트 열어 결제
                    }}
                    onCancel={() => setShowTimeQuery(false)}
                />
            )}

            {/* Premium Overlays & Modals */}
            <MagnoliaCartModal {...cartModalProps} />

            {/* 요리완료 알림 모달 */}
            {completedModal && (
                <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 px-4 pointer-events-none">
                    <div
                        className="bg-white rounded-2xl shadow-2xl border border-green-200 p-5 w-full max-w-sm"
                        style={{ animation: 'slideDown 0.4s ease-out' }}
                    >
                        <style>{`
                            @keyframes slideDown {
                                from { opacity: 0; transform: translateY(-30px); }
                                to   { opacity: 1; transform: translateY(0); }
                            }
                        `}</style>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="text-3xl">🍽️</div>
                            <div>
                                <p className="font-black text-green-700 text-base leading-tight">요리가 완료되었습니다!</p>
                                <p className="text-xs text-slate-400 mt-0.5">서빙 대기 중이에요 😊</p>
                            </div>
                        </div>
                        <ul className="space-y-1.5 mb-3">
                            {completedModal.items.map((item, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                                    <span className="text-green-500 font-bold">✓</span>
                                    <span className="font-semibold">
                                        {item.name_ko || item.name_jp || item.name_en || '메뉴'}
                                    </span>
                                    <span className="text-slate-400">x{item.quantity}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-center text-xs text-slate-400">3초 후 자동으로 닫힙니다</p>
                    </div>
                </div>
            )}
        </div>
    )
}
