import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { ShoppingCart, Plus, Minus, X } from 'lucide-react'
import { useStaffAuth } from '../components/StaffLoginGate'
import { StaffSidebar, StaffBottomNav } from '../components/StaffNav'

/* ── ユーティリティ ─────────────────────────────────────── */

function timeAgo(isoString) {
    if (!isoString) return ''
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
    if (diff < 60) return `${diff}秒前`
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`
    return `${Math.floor(diff / 3600)}時間前`
}

function formatTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

function Icon({ name, className = '' }) {
    return <span className={`material-symbols-outlined ${className}`} style={{ fontFamily: 'Material Symbols Outlined' }}>{name}</span>
}

/* ══════════════════════════════════════════════════════════
   RegisterView — 2-Column POS Layout
   ══════════════════════════════════════════════════════════ */

export default function RegisterView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { isAuthenticated: portalAuth, logout: staffLogout } = useStaffAuth()
    const hideNav = searchParams.get('hidenav') === '1'

    /* ── データステート ─────────────────────────────────── */
    const [staffTables, setStaffTables] = useState([])
    const [registerTables, setRegisterTables] = useState([])
    const [todaySales, setTodaySales] = useState(null)
    const [takeoutOrders, setTakeoutOrders] = useState([])
    const [storeInfo, setStoreInfo] = useState(null)
    const [loading, setLoading] = useState(true)
    const [now, setNow] = useState(new Date())

    /* ── 選択テーブル & 決済 ─────────────────────────────── */
    const [selectedTableId, setSelectedTableId] = useState(null)
    const [tableDetail, setTableDetail] = useState(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [payMethod, setPayMethod] = useState('cash')
    const [paying, setPaying] = useState(false)

    /* ── 売上サマリーモーダル ──────────────────────────── */
    const [showSales, setShowSales] = useState(false)

    /* ── POS モーダル ──────────────────────────────────── */
    const [posModalOpen, setPosModalOpen] = useState(false)
    const [selectedPosTable, setSelectedPosTable] = useState(null)
    const [menus, setMenus] = useState([])
    const [categories, setCategories] = useState([])
    const [activeCategory, setActiveCategory] = useState('All')
    const [cart, setCart] = useState([])

    /* ── 時計 ──────────────────────────────────────────── */
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30000)
        return () => clearInterval(t)
    }, [])

    /* ── データ取得 ────────────────────────────────────── */
    const fetchAll = useCallback(async () => {
        try {
            const [staffRes, regRes, salesRes, takeoutRes] = await Promise.allSettled([
                axios.get(`/api/staff/shops/${shop_id}/register-tables`),
                axios.get('/api/register/tables', { params: { shop_id } }),
                axios.get('/api/register/today-sales', { params: { shop_id } }),
                axios.get('/api/register/takeout', { params: { shop_id } }),
            ])
            if (staffRes.status === 'fulfilled') setStaffTables(staffRes.value.data || [])
            if (regRes.status === 'fulfilled') setRegisterTables(regRes.value.data || [])
            if (salesRes.status === 'fulfilled') setTodaySales(salesRes.value.data)
            if (takeoutRes.status === 'fulfilled') setTakeoutOrders(takeoutRes.value.data || [])
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }, [shop_id])

    const fetchStoreInfo = useCallback(async () => {
        try { setStoreInfo((await axios.get(`/api/stores/${shop_id}`)).data) } catch (e) { console.error(e) }
    }, [shop_id])

    const fetchMenus = useCallback(async () => {
        try {
            const res = await axios.get(`/api/menus/${shop_id}`)
            const arr = Array.isArray(res.data) ? res.data : (res.data?.data || [])
            setMenus(arr)
            setCategories(['All', ...Array.from(new Set(arr.map(m => m.category))).filter(c => c !== 'All')])
        } catch (e) { console.error(e) }
    }, [shop_id])

    useEffect(() => { fetchStoreInfo(); fetchMenus(); fetchAll() }, [fetchStoreInfo, fetchMenus, fetchAll])

    /* ── WebSocket ─────────────────────────────────────── */
    useEffect(() => {
        if (!storeInfo?.id) return
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = ['localhost', '127.0.0.1'].includes(window.location.hostname)
            ? `${window.location.hostname}:8000` : window.location.host
        const ws = new WebSocket(`${protocol}//${host}/api/ws/${storeInfo.id}`)
        ws.onmessage = () => fetchAll()
        return () => ws.close()
    }, [storeInfo?.id, fetchAll])

    /* ── マージデータ ─────────────────────────────────── */
    const merged = staffTables.map(st => {
        const rt = registerTables.find(r => String(r.table_number) === String(st.table_number))
        return { ...st, checkout_requested_at: rt?.checkout_requested_at || null, total_amount: rt?.total_amount ?? st.total_unpaid ?? 0 }
    })

    const checkoutQueue = merged
        .filter(t => t.color_state === 'red')
        .sort((a, b) => {
            if (!a.checkout_requested_at) return 1
            if (!b.checkout_requested_at) return -1
            return new Date(a.checkout_requested_at) - new Date(b.checkout_requested_at)
        })

    /* ── 自動選択: キュー先頭 ─────────────────────────── */
    useEffect(() => {
        if (checkoutQueue.length > 0 && !selectedTableId) {
            setSelectedTableId(checkoutQueue[0].id)
        }
        if (checkoutQueue.length > 0 && selectedTableId && !checkoutQueue.find(t => t.id === selectedTableId)) {
            setSelectedTableId(checkoutQueue[0].id)
        }
    }, [checkoutQueue, selectedTableId])

    const selectedTable = checkoutQueue.find(t => t.id === selectedTableId) || null

    /* ── テーブル詳細ロード ─────────────────────────────── */
    useEffect(() => {
        if (!selectedTable) { setTableDetail(null); return }
        let cancelled = false
        setDetailLoading(true)
        axios.get(`/api/register/table/${selectedTable.id}`)
            .then(res => { if (!cancelled) setTableDetail(res.data) })
            .catch(console.error)
            .finally(() => { if (!cancelled) setDetailLoading(false) })
        return () => { cancelled = true }
    }, [selectedTable?.id])

    /* ── 決済処理 ──────────────────────────────────────── */
    const handlePay = async () => {
        if (!selectedTable || !window.confirm(`テーブル ${selectedTable.table_number}番の会計を完了しますか？`)) return
        setPaying(true)
        try {
            await axios.post(`/api/register/table/${selectedTable.id}/pay`, { payment_method: payMethod })
            setSelectedTableId(null); setTableDetail(null); fetchAll()
        } catch (e) { alert('決済処理に失敗しました') }
        finally { setPaying(false) }
    }

    /* ── テイクアウト完了 ─────────────────────────────── */
    const handleTakeoutComplete = async (id) => {
        try { await axios.post(`/api/register/takeout/${id}/complete`); fetchAll() } catch (e) { alert('処理失敗') }
    }

    /* ── POS 手動注文 ─────────────────────────────────── */
    const openPosModal = (table) => { setSelectedPosTable(table); setCart([]); setActiveCategory('All'); setPosModalOpen(true) }
    const addToPosCart = (m) => {
        setCart(prev => {
            const e = prev.find(i => i.id === m.id)
            if (e) return prev.map(i => i.id === m.id ? { ...i, quantity: i.quantity + 1 } : i)
            return [...prev, { ...m, quantity: 1 }]
        })
    }
    const updatePosQty = (id, d) => {
        setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + d) } : i).filter(i => i.quantity > 0))
    }
    const posTotal = cart.reduce((s, i) => s + (i.price || 0) * i.quantity, 0)
    const submitPosOrder = async () => {
        if (!cart.length) return alert('メニューを追加してください')
        try {
            await axios.post('/api/orders/', {
                shop_id: String(shop_id), table_number: parseInt(selectedPosTable.table_number),
                session_token: selectedPosTable.session_token, guest_uuid: 'POS_MANUAL', payment_method: 'cash_at_counter',
                items: cart.map(i => ({ menu_item_id: String(i.id), quantity: i.quantity, option_details: i.options ? JSON.stringify(i.options) : '{}' }))
            })
            alert('手動注文を送信しました'); setPosModalOpen(false); setSelectedPosTable(null); setCart([]); fetchAll()
        } catch (e) { alert('注文失敗') }
    }

    /* ── ローディング ─────────────────────────────────── */
    if (loading) return (
        <div className="fixed inset-0 bg-[#fcf8fb] flex items-center justify-center">
            <div className="text-center space-y-3">
                <div className="w-10 h-10 border-4 border-[#b80035] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-stone-500 text-sm font-medium">読み込み中...</p>
            </div>
        </div>
    )

    const activeTakeout = takeoutOrders.filter(o => o.payment_status !== 'paid' || !['served'].includes(o.payment_status))

    /* ══════════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════════ */
    return (
        <div className="fixed inset-0 flex flex-col lg:flex-row bg-[#fcf8fb] text-[#1b1b1d]" style={{ fontFamily: "'Plus Jakarta Sans', 'Noto Sans JP', sans-serif" }}>

            {/* ═══ Left Sidebar Nav (lg+) ═══ */}
            <StaffSidebar activePage="register" />

            {/* ═══ Main Content ═══ */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">

            {/* ═══ Header ═══ */}
            <header className="shrink-0 bg-white flex items-center justify-between px-5 h-14 border-b border-stone-100 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(`/${shop_id}/staff`)}
                        className="text-[#b80035] hover:bg-rose-50 p-1.5 rounded-full transition-colors">
                        <Icon name="arrow_back" />
                    </button>
                    <h1 className="text-xl font-extrabold tracking-tight text-[#b80035] cursor-pointer active:opacity-60"
                        onClick={() => window.dispatchEvent(new Event('staff-nav-show'))}>
                        {storeInfo?.name || 'QRaku'} <span className="text-[10px] font-black text-[#b80035]/50 tracking-widest ml-1">REGISTER</span>
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-400 hidden sm:block">
                        {now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                        &nbsp;{now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={() => setShowSales(v => !v)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#ffdada]/50 text-[#b80035] hover:bg-[#ffdada] transition-colors">
                        <Icon name="bar_chart" className="!text-base" />
                        <span className="hidden sm:inline">本日の売上</span>
                    </button>
                    <button onClick={fetchAll} className="p-1.5 hover:bg-stone-50 rounded-full text-stone-400 transition-colors">
                        <Icon name="refresh" />
                    </button>
                </div>
            </header>

            {/* ═══ Main 2-Column Area (fills remaining space) ═══ */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-auto md:overflow-hidden">

                {/* ── Left Column: 会計待ちキュー ─────────────── */}
                <aside className="w-full md:w-80 lg:w-96 shrink-0 border-b md:border-b-0 md:border-r border-stone-100 bg-[#f6f3f5] flex flex-col min-h-0 md:min-h-full">
                    {/* Queue header */}
                    <div className="shrink-0 px-5 pt-5 pb-3">
                        <div className="flex items-center gap-2 mb-0.5">
                            <Icon name="point_of_sale" className="text-[#b80035] !text-xl" />
                            <h2 className="text-lg font-bold tracking-tight">会計キュー</h2>
                        </div>
                        <p className="text-[11px] text-stone-400 ml-8">
                            {checkoutQueue.length > 0
                                ? `${checkoutQueue.length} テーブル待ち`
                                : '会計待ちなし'}
                        </p>
                    </div>

                    {/* Scrollable queue list */}
                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5" style={{ scrollbarWidth: 'thin' }}>
                        {checkoutQueue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
                                <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                                    <Icon name="check_circle" className="!text-3xl text-stone-300" />
                                </div>
                                <p className="text-stone-400 text-sm font-medium">会計待ちなし</p>
                                <p className="text-stone-300 text-xs">チェックアウトリクエストが<br />ここに表示されます</p>
                            </div>
                        ) : (
                            checkoutQueue.map(table => {
                                const isSelected = selectedTableId === table.id
                                return (
                                    <button
                                        key={table.id}
                                        onClick={() => { setSelectedTableId(table.id); setPayMethod('cash') }}
                                        className={`w-full text-left rounded-xl p-4 transition-all relative overflow-hidden ${
                                            isSelected
                                                ? 'bg-white shadow-lg ring-2 ring-[#b80035] scale-[1.01]'
                                                : 'bg-white/70 shadow-sm hover:bg-white hover:shadow-md'
                                        }`}
                                    >
                                        {/* Left accent bar */}
                                        <div className={`absolute top-0 left-0 w-1.5 h-full rounded-l-xl ${isSelected ? 'bg-[#b80035]' : 'bg-[#b80035]/30'}`} />

                                        <div className="ml-3">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base font-bold">T-{table.table_number}</span>
                                                    <span className="px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#93000a] text-[9px] font-black tracking-widest uppercase">
                                                        CHECKOUT
                                                    </span>
                                                </div>
                                                {isSelected && <Icon name="chevron_right" className="text-[#b80035] !text-lg" />}
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3 text-[11px] text-stone-500">
                                                    <span className="flex items-center gap-1">
                                                        <Icon name="groups" className="!text-sm" /> {table.guest_count || '?'}名
                                                    </span>
                                                    {table.checkout_requested_at && (
                                                        <span className="flex items-center gap-1">
                                                            <Icon name="schedule" className="!text-sm" /> {timeAgo(table.checkout_requested_at)}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-base font-bold text-[#1b1b1d]">
                                                    ¥{(table.total_unpaid || table.total_amount || 0).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                )
                            })
                        )}

                        {/* Takeout section */}
                        {takeoutOrders.length > 0 && (
                            <div className="pt-3 mt-1 border-t border-stone-200/60">
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <Icon name="takeout_dining" className="text-[#a43073] !text-lg" />
                                    <span className="text-sm font-bold text-stone-600">テイクアウト</span>
                                    {activeTakeout.length > 0 && (
                                        <span className="bg-[#a43073] px-1.5 py-0.5 rounded-full text-white text-[9px] font-bold">
                                            {activeTakeout.length}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {takeoutOrders.map(order => {
                                        const isPaid = order.payment_status === 'paid'
                                        const isReady = order.order_status === 'pickup_ready'
                                        const isCooking = order.order_status === 'pending' || order.order_status === 'cooking_complete'
                                        const statusLabel =
                                            isReady ? { text: '受渡準備完了', color: 'text-emerald-700 bg-emerald-100' }
                                            : order.order_status === 'cooking_complete' ? { text: '調理完了', color: 'text-blue-700 bg-blue-100' }
                                            : isCooking ? { text: '調理中', color: 'text-amber-700 bg-amber-100' }
                                            : null
                                        return (
                                            <div key={order.order_id}
                                                className={`bg-white/70 rounded-lg p-3 text-xs ${isReady ? 'border-l-2 border-emerald-500 bg-emerald-50/50' : !isPaid ? 'border-l-2 border-[#b80035]' : ''}`}>
                                                <div className="flex justify-between items-start mb-1.5 gap-1">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        {order.pickup_code && (
                                                            <span className="font-black text-sm text-[#a43073] bg-[#f3e4ee] px-1.5 py-0.5 rounded tracking-widest">
                                                                {order.pickup_code}
                                                            </span>
                                                        )}
                                                        <span className="font-bold text-stone-400">#{order.order_id}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {statusLabel && (
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${statusLabel.color}`}>{statusLabel.text}</span>
                                                        )}
                                                        {isPaid ? (
                                                            <span className="text-[9px] font-bold text-[#0050d4] px-1.5 py-0.5 bg-[#dbe1ff] rounded uppercase">支払済</span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold text-[#93000a] px-1.5 py-0.5 bg-[#ffdad6] rounded uppercase">未払い</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-stone-500 leading-relaxed mb-2 line-clamp-2">{order.items_summary}</p>
                                                <div className="flex justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm text-[#1b1b1d]">¥{(order.total_amount || 0).toLocaleString()}</span>
                                                        {order.pickup_time && (
                                                            <span className="text-[10px] text-stone-500 font-bold flex items-center gap-0.5">
                                                                <Icon name="schedule" className="!text-[11px]" /> {order.pickup_time}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isPaid ? (
                                                        <button onClick={() => handleTakeoutComplete(order.order_id)}
                                                            className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${isReady ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'text-[#b80035] hover:underline'}`}>
                                                            受渡完了
                                                        </button>
                                                    ) : (
                                                        <span className="text-stone-300">{formatTime(order.created_at)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                    </div>
                </aside>

                {/* ── Right Column: 決済画面 ─────────────────── */}
                <main className="flex-1 min-h-[300px] md:min-h-0 overflow-y-auto bg-[#fcf8fb]" style={{ scrollbarWidth: 'thin' }}>
                    {!selectedTable ? (
                        /* Empty state */
                        <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-6">
                            <div className="w-20 h-20 rounded-3xl bg-stone-100 flex items-center justify-center">
                                <Icon name="point_of_sale" className="!text-4xl text-stone-300" />
                            </div>
                            <div>
                                <p className="text-stone-400 text-lg font-medium">テーブルを選択してください</p>
                                <p className="text-stone-300 text-sm mt-1">左の会計キューからテーブルを選ぶと<br />ここに決済画面が表示されます</p>
                            </div>
                        </div>
                    ) : (
                        /* Payment panel */
                        <div className="max-w-2xl mx-auto w-full p-6 md:p-8 flex flex-col gap-5">
                            {/* Table header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                                        テーブル {selectedTable.table_number}
                                    </h2>
                                    <div className="flex items-center gap-4 mt-1 text-sm text-stone-500">
                                        <span className="flex items-center gap-1"><Icon name="groups" className="!text-base" /> {selectedTable.guest_count || '?'}名</span>
                                        {selectedTable.checkout_requested_at && (
                                            <span className="flex items-center gap-1"><Icon name="schedule" className="!text-base" /> {timeAgo(selectedTable.checkout_requested_at)}</span>
                                        )}
                                    </div>
                                    {tableDetail?.guest_info && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[11px] font-black px-2 py-1 rounded-full bg-violet-100 text-violet-700">
                                                {tableDetail.guest_info.visit_count}回目のご来店
                                            </span>
                                            {tableDetail.guest_info.days_since_last_visit !== null &&
                                             tableDetail.guest_info.days_since_last_visit !== undefined && (
                                                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-sky-100 text-sky-700">
                                                    {tableDetail.guest_info.days_since_last_visit === 0
                                                        ? '本日再来'
                                                        : `${tableDetail.guest_info.days_since_last_visit}日ぶり`}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <span className="px-3 py-1.5 rounded-full bg-[#ffdad6] text-[#93000a] text-[10px] font-black tracking-widest uppercase">
                                    CHECKOUT
                                </span>
                            </div>

                            {/* Order items */}
                            <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,28,30,0.04)] border border-rose-50 overflow-hidden">
                                <div className="px-5 py-3.5 border-b border-stone-100 flex items-center gap-2">
                                    <Icon name="receipt_long" className="text-[#b80035] !text-lg" />
                                    <h3 className="font-bold text-sm">注文明細</h3>
                                </div>

                                <div className="divide-y divide-stone-100">
                                    {detailLoading ? (
                                        <div className="py-10 flex justify-center">
                                            <div className="w-6 h-6 border-2 border-[#b80035]/30 border-t-[#b80035] rounded-full animate-spin" />
                                        </div>
                                    ) : tableDetail?.items?.length > 0 ? (
                                        tableDetail.items.map((item, i) => (
                                            <div key={i} className="flex justify-between items-center px-5 py-3.5">
                                                <div className="flex-1">
                                                    <span className="font-medium text-[#1b1b1d] text-sm">{item.name}</span>
                                                    <span className="text-stone-400 ml-2 text-xs">×{item.quantity}</span>
                                                </div>
                                                <span className="font-bold text-stone-600 text-sm">¥{(item.subtotal || 0).toLocaleString()}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-stone-400 text-sm text-center py-8">明細なし</p>
                                    )}
                                </div>

                                {/* Total */}
                                <div className="bg-gradient-to-r from-[#ffdada]/40 to-[#ffdada]/20 px-5 py-4 flex justify-between items-center">
                                    <span className="font-bold text-stone-600">合計金額</span>
                                    <span className="text-2xl md:text-3xl font-extrabold text-[#b80035]">
                                        ¥{(tableDetail?.total_amount ?? selectedTable.total_unpaid ?? 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {/* Payment method selector */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <Icon name="credit_card" className="text-[#b80035] !text-lg" />
                                    <p className="text-xs text-stone-500 font-bold uppercase tracking-widest">支払方法</p>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { value: 'cash', icon: 'payments', label: '現金' },
                                        { value: 'card', icon: 'credit_card', label: 'カード' },
                                        { value: 'square', icon: 'point_of_sale', label: 'Square' },
                                    ].map(({ value, icon, label }) => (
                                        <button key={value} onClick={() => setPayMethod(value)}
                                            className={`py-4 rounded-xl flex flex-col items-center gap-2 border-2 text-sm font-bold transition-all ${
                                                payMethod === value
                                                    ? 'bg-[#b80035]/10 border-[#b80035] text-[#b80035] shadow-sm'
                                                    : 'bg-white border-stone-200 text-stone-400 hover:border-stone-300'
                                            }`}>
                                            <Icon name={icon} className="!text-2xl" />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Confirm button */}
                            <button onClick={handlePay} disabled={paying}
                                className="w-full py-4 bg-gradient-to-r from-[#b80035] to-[#e11d48] text-white rounded-xl font-bold text-lg tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
                                {paying ? (
                                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 処理中...</>
                                ) : (
                                    <><Icon name="check_circle" className="!text-xl" /> 会計完了</>
                                )}
                            </button>
                        </div>
                    )}
                </main>
            </div>

            {/* ═══ Bottom Nav (<lg) ═══ */}
            <StaffBottomNav activePage="register" />

            </div>{/* end Main Content wrapper */}

            {/* ═══ 本日の売上パネル ═══ */}
            {showSales && (
                <div className="fixed inset-0 z-[55] flex items-start justify-end p-4 pt-16" onClick={() => setShowSales(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl border border-stone-100 w-72 p-5 space-y-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">本日の売上</p>
                            <button onClick={() => setShowSales(false)} className="text-stone-400 hover:text-stone-600">
                                <Icon name="close" className="!text-lg" />
                            </button>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-stone-500">合計</span>
                            <span className="font-bold text-lg text-[#b80035]">¥{(todaySales?.total_sales || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-stone-400">会計件数</span>
                            <span className="font-bold text-stone-600">{todaySales?.total_orders || 0}件</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-stone-400">平均単価</span>
                            <span className="font-bold text-stone-600">¥{(todaySales?.avg_order_value || 0).toLocaleString()}</span>
                        </div>
                        {todaySales?.by_payment_method?.length > 0 && (
                            <div className="pt-2 border-t border-stone-200/60 space-y-1.5">
                                {todaySales.by_payment_method.map(m => (
                                    <div key={m.method} className="flex justify-between text-xs">
                                        <span className="text-stone-500">{m.method === 'cash' ? '💵 現金' : m.method === 'card' ? '💳 カード' : `🔹 ${m.method}`}</span>
                                        <span className="font-bold text-stone-600">¥{(m.amount || 0).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ POS 手動注文モーダル ═══ */}
            {posModalOpen && selectedPosTable && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPosModalOpen(false)} />
                    <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
                        style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>

                        {/* Left: Menu */}
                        <div className="flex-1 flex flex-col border-r border-stone-100 min-h-0">
                            <div className="p-4 border-b border-stone-100 bg-stone-50 flex justify-between items-center shrink-0">
                                <h3 className="font-bold text-base">メニュー選択（手動注文）</h3>
                                <button onClick={() => setPosModalOpen(false)} className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center">
                                    <X className="w-4 h-4 text-stone-500" />
                                </button>
                            </div>

                            <div className="p-3 border-b border-stone-100 flex overflow-x-auto gap-2 shrink-0" style={{ scrollbarWidth: 'none' }}>
                                {categories.map(c => (
                                    <button key={c} onClick={() => setActiveCategory(c)}
                                        className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold transition-colors ${
                                            activeCategory === c
                                                ? 'bg-[#b80035] text-white'
                                                : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                                        }`}>
                                        {c}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                                {menus.filter(m => activeCategory === 'All' || m.category === activeCategory).map(m => (
                                    <button key={m.id} onClick={() => addToPosCart(m)}
                                        className="bg-white border border-stone-200 rounded-xl p-2.5 flex flex-col hover:border-[#b80035]/40 hover:shadow-sm active:scale-95 transition-all text-left">
                                        <div className="w-full aspect-video rounded-lg bg-stone-100 mb-2 overflow-hidden">
                                            {m.image_url
                                                ? <img src={m.image_url} alt={m.name_jp} className="w-full h-full object-cover" />
                                                : <div className="w-full h-full flex items-center justify-center text-stone-300"><Icon name="restaurant" /></div>
                                            }
                                        </div>
                                        <div className="text-xs font-bold text-[#1b1b1d] line-clamp-1 mb-0.5">{m.name_jp || m.name_ko}</div>
                                        <div className="text-[10px] text-[#b80035] font-bold">¥{(m.price || 0).toLocaleString()}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Right: Cart */}
                        <div className="w-full md:w-72 bg-stone-50 flex flex-col shrink-0">
                            <div className="p-4 border-b border-stone-100 shrink-0">
                                <h3 className="font-bold flex items-center gap-2">
                                    <ShoppingCart className="w-4 h-4 text-[#b80035]" />
                                    テーブル {selectedPosTable.table_number}
                                </h3>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {cart.length === 0 ? (
                                    <div className="text-center text-stone-400 text-sm mt-8">カートが空です</div>
                                ) : cart.map(item => (
                                    <div key={item.id} className="bg-white border border-stone-200 rounded-xl p-3">
                                        <div className="text-xs font-medium text-[#1b1b1d] mb-2 line-clamp-1">{item.name_jp || item.name_ko}</div>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center bg-stone-100 rounded-lg overflow-hidden">
                                                <button onClick={() => updatePosQty(item.id, -1)} className="px-2.5 py-1 hover:bg-stone-200 text-stone-500 text-sm">
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span className="px-2 text-xs font-bold">{item.quantity}</span>
                                                <button onClick={() => updatePosQty(item.id, 1)} className="px-2.5 py-1 hover:bg-stone-200 text-stone-500 text-sm">
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <span className="text-[#b80035] text-xs font-bold">¥{((item.price || 0) * item.quantity).toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 border-t border-stone-100 space-y-3 shrink-0">
                                <div className="flex justify-between font-bold">
                                    <span className="text-stone-500 text-sm">合計</span>
                                    <span className="text-lg">¥{posTotal.toLocaleString()}</span>
                                </div>
                                <button onClick={submitPosOrder} disabled={!cart.length}
                                    className="w-full py-3 bg-gradient-to-r from-[#b80035] to-[#e11d48] text-white rounded-xl font-bold tracking-wide hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 flex items-center justify-center gap-2">
                                    <Icon name="send" className="!text-lg" /> 注文を送信
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
