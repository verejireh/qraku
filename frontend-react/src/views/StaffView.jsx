import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { useDisplayGuard } from '../hooks/useDisplayGuard'
import { useStaffAuth } from '../components/StaffLoginGate'
import { StaffSidebar, StaffBottomNav } from '../components/StaffNav'
import { useWebSocket } from '../hooks/useWebSocket'

export default function StaffView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const { isAllowed, loading: guardLoading } = useDisplayGuard('staff')
    const [searchParams] = useSearchParams()
    const { isAuthenticated: portalAuth } = useStaffAuth()

    const [tables, setTables] = useState([])
    const [allOrders, setAllOrders] = useState([])
    const [menus, setMenus] = useState({})
    const [storeData, setStoreData] = useState(null)
    const [loading, setLoading] = useState(true)

    // 테이크아웃 조리시간 문의 목록
    const [timeQueries, setTimeQueries] = useState([])
    const [respondModal, setRespondModal] = useState(null) // query object
    const [responseType, setResponseType] = useState('minutes')
    const [responseMinutes, setResponseMinutes] = useState(15)
    const [responseTime, setResponseTime] = useState('')

    // Active footer tab: 'staff' | 'register' | 'settings'
    const [activeTab, setActiveTab] = useState('staff')

    // Detail view toggle
    const [detailView, setDetailView] = useState(true)

    // Sort mode: 'priority' (unserved cooking_complete oldest first) | 'table' (by table number)
    const [sortMode, setSortMode] = useState('priority')

    // Modals
    const [guestModal, setGuestModal] = useState(null)
    const [guestCount, setGuestCount] = useState(2)
    const [transferModal, setTransferModal] = useState(null)
    const [detailModal, setDetailModal] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState(null)

    // POS State (Register tab)
    const [posModalOpen, setPosModalOpen] = useState(false)
    const [selectedTable, setSelectedTable] = useState(null)
    const [posMenus, setPosMenus] = useState([])
    const [categories, setCategories] = useState([])
    const [activeCategory, setActiveCategory] = useState('All')
    const [cart, setCart] = useState([])

    const audioRef = useRef(null)

    // ── Data Fetching ─────────────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        try {
            const storeRes = await axios.get(`/api/stores/${shop_id}`)
            const store = storeRes.data
            setStoreData(store)

            // ⚠️ 보안: ?demo=1 + demo_tmp_ 접두사 슬러그일 때만 데모 분기 허용
            const storeSlug = store.slug || shop_id
            const isTempDemoStore = typeof storeSlug === 'string' && storeSlug.startsWith('demo_tmp_')
            const isDemoMode = new URLSearchParams(window.location.search).get('demo') === '1' && isTempDemoStore
            let rawOrders = []
            let rawTables = []
            if (isDemoMode) {
                const [ordersRes, tablesRes, menusRes] = await Promise.all([
                    axios.get(`/api/demo/orders/${storeSlug}`).catch(() => ({ data: [] })),
                    axios.get(`/api/demo/tables/${storeSlug}`).catch(() => ({ data: [] })),
                    axios.get(`/api/menus/${shop_id}`)
                ])
                rawOrders = Array.isArray(ordersRes.data) ? ordersRes.data : []
                rawTables = Array.isArray(tablesRes.data)
                    ? tablesRes.data.map(t => ({ ...t, status: (t.status || '').toLowerCase() }))
                    : []
                const rawMenus = Array.isArray(menusRes.data) ? menusRes.data : (menusRes.data?.data || [])
                const dict = {}
                rawMenus.forEach(m => { dict[String(m.id)] = m })
                setMenus(dict)
                setPosMenus(rawMenus)
                const cats = Array.from(new Set(rawMenus.map(m => m.category)))
                setCategories(['All', ...cats])
            } else {
                const [tablesRes, ordersRes, menusRes] = await Promise.all([
                    axios.get(`/api/staff/shops/${shop_id}/register-tables`),
                    axios.get(`/api/orders/`, { params: { store_id: shop_id } }),
                    axios.get(`/api/menus/${shop_id}`)
                ])
                rawTables = Array.isArray(tablesRes.data) ? tablesRes.data : []
                rawOrders = Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data?.orders || [])
                const rawMenus = Array.isArray(menusRes.data) ? menusRes.data : (menusRes.data?.data || [])
                const dict = {}
                rawMenus.forEach(m => { dict[String(m.id)] = m })
                setMenus(dict)
                setPosMenus(rawMenus)
                const cats = Array.from(new Set(rawMenus.map(m => m.category)))
                setCategories(['All', ...cats])
            }

            setTables(rawTables.sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true })))
            setAllOrders(rawOrders)
        } catch (e) {
            console.error('StaffView fetch error:', e)
        } finally {
            setLoading(false)
        }
    }, [shop_id])


    useEffect(() => { fetchAll() }, [fetchAll])

    // ── 테이크아웃 조리시간 문의 폴링 ─────────────────────────────────────────
    useEffect(() => {
        const fetchQueries = async () => {
            try {
                const res = await axios.get(`/api/takeout/time-query/pending/${shop_id}`)
                setTimeQueries(Array.isArray(res.data) ? res.data : [])
            } catch (e) { /* ignore */ }
        }
        fetchQueries()
        const interval = setInterval(fetchQueries, 5000)
        return () => clearInterval(interval)
    }, [shop_id])

    const handleStaffRespond = async () => {
        if (!respondModal) return
        try {
            await axios.post(`/api/takeout/time-query/${respondModal.id}/respond`, {
                response_type: responseType,
                minutes: responseType === 'minutes' ? parseInt(responseMinutes) : null,
                set_time: responseType === 'set_time' ? responseTime : null,
            })
            setRespondModal(null)
            // 목록 새로고침
            const res = await axios.get(`/api/takeout/time-query/pending/${shop_id}`)
            setTimeQueries(Array.isArray(res.data) ? res.data : [])
        } catch (e) {
            alert('返答の送信に失敗しました')
        }
    }

    // ── WebSocket ─────────────────────────────────────────────────────────────
    useWebSocket({
        audience: 'admin',
        storeId: storeData?.id,
        onEvent: useCallback((event) => {
            if (event.type === 'CALL_STAFF') {
                try { new Audio('/chime.mp3').play().catch(() => {}) } catch (e) {}
            }
            fetchAll()
        }, [fetchAll]),
    })

    // ── Helpers ────────────────────────────────────────────────────────────────
    const getTableOrders = (table) => {
        return allOrders.filter(o =>
            String(o.table_number) === String(table.table_number) &&
            o.session_token === table.session_token &&
            o.payment_status !== 'paid' &&
            o.status !== 'cancelled' &&
            o.order_type !== 'take_out'
        )
    }

    const getTableTotal = (table) => {
        return getTableOrders(table).reduce((sum, o) => sum + (o.total_amount || 0), 0)
    }

    const getMenuName = (menuId) => {
        const m = menus[String(menuId)]
        return m ? (m.name_jp || m.name_ko || m.name_en || `#${menuId}`) : `#${menuId}`
    }

    const isOccupied = (table) => {
        const s = (table.status || '').toLowerCase()
        return s === 'occupied' || s === 'checkout_requested'
    }

    const isCheckout = (table) => {
        const s = (table.status || '').toLowerCase()
        return s === 'checkout_requested'
    }

    const getTableItems = (table) => {
        const orders = getTableOrders(table)
        const items = []
        orders.forEach(o => {
            (o.items || []).forEach(item => {
                items.push({ ...item, orderId: o.id, orderTime: o.created_at, orderStatus: o.status })
            })
        })
        return items
    }

    // Elapsed time helper
    const getElapsed = (table) => {
        const orders = getTableOrders(table)
        if (orders.length === 0) return ''
        const oldest = orders.reduce((a, b) => new Date(a.created_at) < new Date(b.created_at) ? a : b)
        const diff = Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 60000)
        if (diff < 1) return 'Just now'
        return `${diff}m`
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleOpenTable = (tableId) => {
        setGuestCount(2)
        setGuestModal({ tableId })
    }

    const confirmOpenTable = async () => {
        if (!guestModal) return
        try {
            await axios.post(`/api/staff/tables/${guestModal.tableId}/open`, { guest_count: guestCount })
            fetchAll()
        } catch (e) {
            alert('テーブルを開けませんでした')
        } finally {
            setGuestModal(null)
        }
    }

    const handleRenewQr = async (tableId) => {
        try {
            await axios.post(`/api/staff/tables/${tableId}/renew-qr`)
            fetchAll()
        } catch (e) {
            alert('QR時間の更新に失敗しました')
        }
    }

    const handleCloseTable = async (tableId) => {
        if (!window.confirm('このテーブルを閉じますか？')) return
        try {
            await axios.post(`/api/staff/tables/${tableId}/close`)
            fetchAll()
        } catch (e) {
            alert('テーブルを閉じられませんでした')
        }
    }

    const handleTransfer = async (targetTableId) => {
        if (!transferModal) return
        try {
            await axios.post(`/api/staff/tables/${transferModal.sourceTable.id}/transfer`, {
                target_table_id: targetTableId
            })
            fetchAll()
        } catch (e) {
            alert('テーブル移動に失敗しました: ' + (e.response?.data?.detail || ''))
        } finally {
            setTransferModal(null)
        }
    }

    const handleMarkItemServed = async (itemId) => {
        try {
            await axios.patch(`/api/orders/items/${itemId}/status`, { status: 'served' })
            fetchAll()
        } catch (e) {
            alert('サーブ完了処理に失敗しました')
        }
    }

    const handleMarkPickupReady = async (itemId) => {
        try {
            await axios.patch(`/api/orders/items/${itemId}/status`, { status: 'pickup_ready' })
            fetchAll()
        } catch (e) {
            alert('ピックアップ準備完了処理に失敗しました')
        }
    }

    const handleUndoServe = async (itemId) => {
        try {
            await axios.patch(`/api/orders/items/${itemId}/status`, { status: 'cooking_complete' })
            fetchAll()
        } catch (e) {
            alert('取り消し処理に失敗しました')
        }
    }

    const handleBulkMarkServed = async (itemIds) => {
        try {
            await axios.patch(`/api/orders/items/bulk-served`, { item_ids: itemIds })
            fetchAll()
        } catch (e) {
            alert('サーブ完了処理に失敗しました')
        }
    }

    const handleAcknowledgeCall = async (tableId) => {
        try {
            await axios.post(`/api/staff/tables/${tableId}/acknowledge-call`)
            fetchAll()
        } catch (e) {
            alert('コール確認に失敗しました')
        }
    }

    const handleDeleteOrder = async (orderId) => {
        try {
            await axios.delete(`/api/orders/${orderId}`)
            fetchAll()
            if (detailModal) setDetailModal({ ...detailModal })
        } catch (e) {
            alert('注文を削除できませんでした')
        } finally {
            setDeleteConfirm(null)
        }
    }

    const handlePayAndClose = async (table) => {
        if (!window.confirm(`テーブル ${table.table_number} の合計 ¥${(table.total_unpaid || 0).toLocaleString()} を決済し、テーブルを閉じますか？`)) return
        try {
            const orders = getTableOrders(table)
            const allItemIds = orders.flatMap(o => (o.items || []).map(i => i.id)).filter(Boolean)
            if (allItemIds.length > 0) {
                await axios.patch(`/api/orders/items/bulk-served`, { item_ids: allItemIds })
            }
            await axios.post(`/api/staff/tables/${table.id}/close`)
            fetchAll()
        } catch (e) {
            alert('処理に失敗しました')
        }
    }

    // ── POS (Register) ───────────────────────────────────────────────────────
    const openPosModal = (table) => {
        setSelectedTable(table)
        setCart([])
        setActiveCategory('All')
        setPosModalOpen(true)
    }

    const closePosModal = () => {
        setPosModalOpen(false)
        setSelectedTable(null)
        setCart([])
    }

    const addToPosCart = (menu) => {
        setCart(prev => {
            const ext = prev.find(i => i.id === menu.id)
            if (ext) return prev.map(i => i.id === menu.id ? { ...i, quantity: i.quantity + 1 } : i)
            return [...prev, { ...menu, quantity: 1 }]
        })
    }

    const updatePosQuantity = (id, delta) => {
        setCart(prev => prev.map(i => {
            if (i.id === id) return { ...i, quantity: Math.max(0, i.quantity + delta) }
            return i
        }).filter(i => i.quantity > 0))
    }

    const posTotal = cart.reduce((acc, item) => acc + ((item.price + (item.extra_price_sum || 0)) * item.quantity), 0)

    const submitPosOrder = async () => {
        if (cart.length === 0) return alert('メニューを追加してください。')
        try {
            const payload = {
                shop_id: String(shop_id),
                table_number: String(selectedTable.table_number),
                session_token: selectedTable.session_token,
                guest_uuid: 'POS_MANUAL',
                payment_method: 'cash_at_counter',
                items: cart.map(item => ({
                    menu_item_id: String(item.id),
                    quantity: item.quantity,
                    option_details: item.options ? JSON.stringify(item.options) : "{}"
                }))
            }
            await axios.post('/api/orders/', payload)
            closePosModal()
            fetchAll()
        } catch (e) {
            alert('注文失敗')
        }
    }

    const activeTableCount = tables.filter(t => isOccupied(t)).length

    // Sorted tables based on sortMode (must be before any early returns)
    const sortedTables = useMemo(() => {
        if (sortMode === 'table') return [...tables]
        // Priority: tables with unserved cooking_complete items first (oldest first)
        return [...tables].sort((a, b) => {
            const aItems = getTableItems(a)
            const bItems = getTableItems(b)
            const aCookingComplete = aItems.filter(i => i.status === 'cooking_complete')
            const bCookingComplete = bItems.filter(i => i.status === 'cooking_complete')
            const aPending = aItems.filter(i => !i.status || i.status === 'pending')
            const bPending = bItems.filter(i => !i.status || i.status === 'pending')

            // Call staff always first
            if (a.call_staff && !b.call_staff) return -1
            if (!a.call_staff && b.call_staff) return 1

            // Checkout requested next
            const aCheckout = isCheckout(a)
            const bCheckout = isCheckout(b)
            if (aCheckout && !bCheckout) return -1
            if (!aCheckout && bCheckout) return 1

            // Tables with cooking_complete items (oldest first)
            if (aCookingComplete.length > 0 && bCookingComplete.length === 0) return -1
            if (aCookingComplete.length === 0 && bCookingComplete.length > 0) return 1
            if (aCookingComplete.length > 0 && bCookingComplete.length > 0) {
                const aOldest = Math.min(...aCookingComplete.map(i => new Date(i.orderTime).getTime()))
                const bOldest = Math.min(...bCookingComplete.map(i => new Date(i.orderTime).getTime()))
                return aOldest - bOldest
            }

            // Tables with pending items next
            if (aPending.length > 0 && bPending.length === 0) return -1
            if (aPending.length === 0 && bPending.length > 0) return 1

            // Occupied before empty
            const aOcc = isOccupied(a) ? 1 : 0
            const bOcc = isOccupied(b) ? 1 : 0
            if (aOcc !== bOcc) return bOcc - aOcc

            // Default: table number
            return String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true })
        })
    }, [tables, allOrders, sortMode])

    // ── Loading screen (after all hooks) ─────────────────────────────────────
    if (loading || guardLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#fcf8fb]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-[#b80035] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-[#5c3f40] font-semibold">Loading...</p>
                </div>
            </div>
        )
    }

    if (isAllowed === false) return null;

    // ── DETAIL VIEW: Table Card (Bento style) ─────────────────────────────────
    const renderDetailCard = (table) => {
        const occupied = isOccupied(table)
        const checkout = isCheckout(table)
        const total = table.total_unpaid || 0
        const allItems = getTableItems(table)
        const callStaff = table.call_staff
        const elapsed = getElapsed(table)

        const pendingItems = allItems.filter(i => !i.status || i.status === 'pending')
        const cookingCompleteItems = allItems.filter(i => i.status === 'cooking_complete')
        const servedItems = allItems.filter(i => i.status === 'served')
        const unservedItems = [...pendingItems, ...cookingCompleteItems]

        // Call Staff overlay
        if (callStaff) {
            return (
                <div
                    key={table.id}
                    onClick={() => handleAcknowledgeCall(table.id)}
                    className="bg-[#E11D48] rounded-xl p-6 shadow-[0_12px_32px_rgba(225,29,72,0.2)] flex flex-col cursor-pointer transition-transform hover:translate-y-[-2px] min-h-[200px]"
                >
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <span className="text-[11px] font-bold text-white/70 uppercase tracking-widest">CALL STAFF</span>
                            <h3 className="text-4xl font-black text-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                Table {String(table.table_number).padStart(2, '0')}
                            </h3>
                        </div>
                        <div className="bg-white text-[#E11D48] p-2 rounded-full animate-pulse">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-white/80 font-semibold text-sm">Tap to acknowledge</p>
                    </div>
                </div>
            )
        }

        // Ready (empty) table
        if (!occupied) {
            return (
                <div
                    key={table.id}
                    className="bg-white rounded-xl p-6 shadow-[0_12px_32px_rgba(28,28,30,0.04)] flex flex-col transition-transform hover:translate-y-[-2px] min-h-[200px] border border-[#f0edef]"
                >
                    <div className="flex justify-between items-start mb-4 border-b border-[#f6f3f5] pb-4">
                        <div>
                            <span className="text-[11px] font-bold text-[#5c3f40]/40 uppercase tracking-widest">Ready</span>
                            <h3 className="text-4xl font-black text-[#1b1b1d]/20" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                Table {String(table.table_number).padStart(2, '0')}
                            </h3>
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        <button
                            onClick={() => handleOpenTable(table.id)}
                            className="px-8 py-3 bg-[#b80035] text-white rounded-xl text-sm font-bold hover:bg-[#920028] transition-colors active:scale-95"
                        >
                            Open Table
                        </button>
                    </div>
                </div>
            )
        }

        // Occupied table with orders
        return (
            <div
                key={table.id}
                className={`bg-white rounded-xl p-6 flex flex-col transition-transform hover:translate-y-[-2px] min-h-[240px] ${
                    checkout
                        ? 'shadow-[0_12px_32px_rgba(225,29,72,0.1)] ring-2 ring-[#E11D48]'
                        : 'shadow-[0_12px_32px_rgba(28,28,30,0.04)]'
                }`}
            >
                {/* Header */}
                <div className="flex justify-between items-start mb-5 border-b border-[#f6f3f5] pb-4">
                    <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-[#b80035] uppercase tracking-widest mb-1">
                            {checkout ? '⚡ CHECKOUT REQUESTED' : 'Dine-in'}
                        </span>
                        <div className="flex items-center gap-2">
                            <h3 className="text-4xl font-black text-[#1b1b1d] cursor-pointer hover:text-[#b80035] transition-colors" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                onClick={() => setDetailModal({ table })}
                            >
                                Table {String(table.table_number).padStart(2, '0')}
                            </h3>
                            <button
                                onClick={(e) => { e.stopPropagation(); openPosModal(table) }}
                                className="px-2.5 py-1.5 bg-[#b80035] hover:bg-[#9a002d] text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined !text-sm">add_circle</span>
                                注文追加
                            </button>
                        </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                        <p className="text-[#5c3f40] text-xs font-medium uppercase tracking-tighter">
                            {table.guest_count ? `${table.guest_count} Guests` : ''}
                        </p>
                        {elapsed && (
                            <p className="text-sm font-bold text-[#1b1b1d]">{elapsed} Elapsed</p>
                        )}
                        <p className="text-lg font-black text-[#b80035] tabular-nums">¥{total.toLocaleString()}</p>
                    </div>
                </div>

                {/* QR Timer + Renew */}
                {(() => {
                    const jwEnd = table.join_window_end
                    if (!jwEnd) return null
                    const diffMs = new Date(jwEnd + 'Z') - new Date()
                    const minsLeft = Math.max(0, Math.floor(diffMs / 60000))
                    const expired = minsLeft <= 0
                    return (
                        <div className={`flex items-center justify-between px-3 py-2 mb-3 rounded-lg text-xs font-bold ${expired ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                            <span>QR {expired ? '期限切れ' : `残り ${minsLeft}分`}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRenewQr(table.id) }}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${expired ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-amber-200 text-amber-800 hover:bg-amber-300'}`}
                            >
                                🔄 +5分
                            </button>
                        </div>
                    )
                })()}

                {/* Two-column: New Orders | Served */}
                <div className="grid grid-cols-2 gap-6 flex-grow">
                    {/* Left: New Orders */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-[#5c3f40] uppercase tracking-widest flex items-center gap-2">
                            {unservedItems.length > 0 && (
                                <span className={`w-1.5 h-1.5 rounded-full ${pendingItems.length > 0 ? 'bg-[#b80035] animate-pulse' : 'bg-[#8BC34A]'}`}></span>
                            )}
                            New Orders
                            {unservedItems.length > 0 && (
                                <span className="text-[10px] font-bold text-white bg-[#b80035] px-1.5 py-0.5 rounded-full ml-auto">
                                    {unservedItems.length}
                                </span>
                            )}
                        </h4>

                        {unservedItems.length === 0 ? (
                            <div className="text-center py-6">
                                <svg className="w-8 h-8 mx-auto text-[#e4e2e4] mb-2" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16zM6 10h2v2H6v-2zm0 4h2v2H6v-2zm0-8h2v2H6V6zm4 4h8v2h-8v-2zm0 4h8v2h-8v-2zm0-8h8v2h-8V6z"/></svg>
                                <p className="text-xs font-medium text-[#5c3f40]/40">No pending orders</p>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {unservedItems.map((item, i) => {
                                    const isCookingComplete = item.status === 'cooking_complete'
                                    const isPickupReady = item.status === 'pickup_ready'
                                    const isTakeoutItem = item.is_takeout_item
                                    return (
                                        <li
                                            key={item.id || i}
                                            className={`flex items-center justify-between group p-3 rounded-lg transition-all ${
                                                isPickupReady ? 'border-l-4 border-purple-400' :
                                                isCookingComplete
                                                    ? `border-l-4 ${isTakeoutItem ? 'border-amber-400' : 'border-[#8BC34A]'}`
                                                    : 'border-l-4 border-transparent'
                                            }`}
                                            style={{
                                                backgroundColor:
                                                    isPickupReady ? 'rgba(168,85,247,0.12)' :
                                                    isCookingComplete
                                                        ? (isTakeoutItem ? 'rgba(245,158,11,0.12)' : '#DBF776')
                                                        : isTakeoutItem ? 'rgba(245,158,11,0.06)' : 'rgba(255,218,218,0.3)'
                                            }}
                                        >
                                            <div className="flex-1 min-w-0 mr-2">
                                                <div className="flex items-center gap-1.5">
                                                    {isTakeoutItem && <span className="text-[9px] font-black bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full shrink-0">🥡 TO</span>}
                                                    <span className="font-bold text-[#1b1b1d] text-sm leading-tight block truncate">
                                                        {getMenuName(item.menu_item_id)}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-[#5c3f40]/60 font-medium">
                                                    ×{item.quantity}
                                                    {isCookingComplete && !isPickupReady && (
                                                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isTakeoutItem ? 'text-amber-700 bg-amber-100' : 'text-[#558B2F] bg-[#C5E1A5]'}`}>
                                                            調理完了
                                                        </span>
                                                    )}
                                                    {isPickupReady && (
                                                        <span className="ml-2 text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full">
                                                            準備完了
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            {/* テイクアウトitem: 調理完了 → 準備完了ボタン / 準備完了 → サーブ完了 */}
                                            {isTakeoutItem && isCookingComplete && !isPickupReady ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleMarkPickupReady(item.id) }}
                                                    className="shrink-0 px-3 py-1.5 rounded-full bg-amber-400 text-white text-[11px] font-black hover:bg-amber-500 active:scale-95 transition-all"
                                                    title="ピックアップ準備完了"
                                                >準備完了</button>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleMarkItemServed(item.id) }}
                                                    className="shrink-0 w-10 h-6 rounded-full bg-[#e4e2e4] relative transition-colors hover:bg-[#dcd9dc] active:scale-95"
                                                    title="サーブ完了"
                                                >
                                                    <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"></span>
                                                </button>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        )}

                        {/* Bulk serve button */}
                        {cookingCompleteItems.length > 1 && (
                            <button
                                onClick={() => handleBulkMarkServed(cookingCompleteItems.map(i => i.id))}
                                className="w-full py-2 bg-[#8BC34A] text-white rounded-lg text-[10px] font-bold uppercase tracking-wide hover:bg-[#7CB342] transition-colors mt-1"
                            >
                                全てサーブ完了 ({cookingCompleteItems.length})
                            </button>
                        )}
                    </div>

                    {/* Right: Served History */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-[#5c3f40] uppercase tracking-widest">
                            Served
                            {servedItems.length > 0 && (
                                <span className="text-[10px] font-normal text-[#5c3f40]/40 ml-2">{servedItems.length}</span>
                            )}
                        </h4>

                        {servedItems.length === 0 ? (
                            <div className="text-center py-6">
                                <svg className="w-8 h-8 mx-auto text-[#e4e2e4] mb-2" fill="currentColor" viewBox="0 0 24 24"><path d="M18.5 3H6c-1.1 0-2 .9-2 2v5.71c0 3.83 2.95 7.18 6.78 7.29 3.96.12 7.22-3.06 7.22-7v-6c0-1.1-.9-2-2-2zm-9 12.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
                                <p className="text-xs font-medium text-[#5c3f40]/40">No items served yet</p>
                            </div>
                        ) : (
                            <ul className="space-y-1.5">
                                {servedItems.map((item, i) => (
                                    <li key={item.id || i} className="flex items-center justify-between text-sm py-1.5 border-b border-[#f0edef] opacity-60 hover:opacity-100 transition-opacity">
                                        <span className="truncate text-[#1b1b1d] flex-1 min-w-0">{getMenuName(item.menu_item_id)} ×{item.quantity}</span>
                                        {/* Toggle: ON = served (can undo) */}
                                        <button
                                            onClick={() => handleUndoServe(item.id)}
                                            className="shrink-0 w-10 h-6 rounded-full bg-[#b80035] relative transition-colors hover:bg-[#920028] active:scale-95 ml-2"
                                            title="サーブ取消"
                                        >
                                            <span className="absolute right-1 top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"></span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Footer actions */}
                {checkout && (
                    <div className="mt-4 pt-3 border-t border-[#f0edef]">
                        <button
                            onClick={() => handlePayAndClose(table)}
                            className="w-full py-3 bg-[#1b1b1d] text-white rounded-xl text-xs font-bold uppercase tracking-wide hover:bg-[#303032] transition-colors active:scale-[0.98]"
                        >
                            決済完了 · テーブルリセット
                        </button>
                    </div>
                )}
            </div>
        )
    }

    // ── SIMPLE VIEW: Same design as detail but single column, unserved only ──
    const renderSimpleCard = (table) => {
        const occupied = isOccupied(table)
        const checkout = isCheckout(table)
        const total = table.total_unpaid || 0
        const allItems = getTableItems(table)
        const callStaff = table.call_staff
        const elapsed = getElapsed(table)

        const pendingItems = allItems.filter(i => !i.status || i.status === 'pending')
        const cookingCompleteItems = allItems.filter(i => i.status === 'cooking_complete')
        const servedItems = allItems.filter(i => i.status === 'served')
        const unservedItems = [...pendingItems, ...cookingCompleteItems]

        // Determine if all items have been served (no all_served status needed)
        const allServed = allItems.length > 0 && unservedItems.length === 0

        // ─ Call Staff ─
        if (callStaff) {
            return (
                <div
                    key={table.id}
                    onClick={() => handleAcknowledgeCall(table.id)}
                    className="bg-white rounded-xl p-5 shadow-[0_12px_32px_rgba(225,29,72,0.15)] flex flex-col cursor-pointer transition-transform hover:translate-y-[-2px] ring-2 ring-[#E11D48]"
                >
                    <div className="flex justify-between items-start mb-4 border-b border-[#f6f3f5] pb-3">
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-[#E11D48] uppercase tracking-widest mb-0.5">CALL STAFF</span>
                            <h3 className="text-3xl font-black text-[#1b1b1d]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                Table {String(table.table_number).padStart(2, '0')}
                            </h3>
                        </div>
                        <div className="bg-[#E11D48] text-white p-1.5 rounded-full flex items-center justify-center shadow-sm animate-pulse">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-[#E11D48] font-semibold text-sm">Tap to acknowledge</p>
                    </div>
                    <div className="mt-2">
                        <p className="text-[#5c3f40] text-xs font-medium">{table.guest_count ? `${table.guest_count} Guests` : ''}</p>
                        <p className="font-bold text-lg text-[#1b1b1d]">¥{total.toLocaleString()}</p>
                    </div>
                </div>
            )
        }

        // ─ Empty table ─
        if (!occupied) {
            return (
                <div
                    key={table.id}
                    className="bg-[#f6f3f5] rounded-xl p-5 shadow-[0_12px_32px_rgba(28,28,30,0.04)] flex flex-col transition-transform hover:translate-y-[-2px] border border-transparent hover:bg-white"
                >
                    <div className="flex justify-between items-start mb-4 border-b border-[#e4e2e4]/50 pb-3">
                        <div className="flex flex-col">
                            <h3 className="text-3xl font-black text-[#5c3f40]/30" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                Table {String(table.table_number).padStart(2, '0')}
                            </h3>
                        </div>
                        <span className="bg-[#e4e2e4] text-[#5c3f40] text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-tighter">Empty</span>
                    </div>
                    <div className="flex-1"></div>
                    <button
                        onClick={() => handleOpenTable(table.id)}
                        className="w-full py-2 bg-[#b80035] text-white rounded-lg text-[10px] font-bold uppercase tracking-wide hover:bg-[#920028] transition-colors active:scale-95"
                    >
                        Open Table
                    </button>
                </div>
            )
        }

        // ─ Occupied table (single column: unserved items only) ─
        return (
            <div
                key={table.id}
                onClick={() => setDetailModal({ table })}
                className={`bg-white rounded-xl p-5 flex flex-col cursor-pointer transition-transform hover:translate-y-[-2px] ${
                    checkout
                        ? 'shadow-[0_12px_32px_rgba(225,29,72,0.1)] ring-2 ring-[#E11D48]'
                        : 'shadow-[0_12px_32px_rgba(28,28,30,0.04)]'
                }`}
            >
                {/* Header — same as detail view */}
                <div className="flex justify-between items-start mb-4 border-b border-[#f6f3f5] pb-3">
                    <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-[#b80035] uppercase tracking-widest mb-0.5">
                            {checkout ? 'CHECKOUT' : allServed ? 'ALL SERVED' : 'Dine-in'}
                        </span>
                        <div className="flex items-center gap-2">
                            <h3 className="text-3xl font-black text-[#1b1b1d]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                Table {String(table.table_number).padStart(2, '0')}
                            </h3>
                            <button
                                onClick={(e) => { e.stopPropagation(); openPosModal(table) }}
                                className="px-2 py-1 bg-[#b80035] hover:bg-[#9a002d] text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined !text-sm">add_circle</span>
                                注文追加
                            </button>
                        </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-0.5">
                        <p className="text-[#5c3f40] text-xs font-medium">{table.guest_count ? `${table.guest_count} Guests` : ''}</p>
                        {elapsed && <p className="text-[11px] font-bold text-[#1b1b1d]">{elapsed}</p>}
                        <p className="text-sm font-black text-[#b80035] tabular-nums">¥{total.toLocaleString()}</p>
                    </div>
                </div>

                {/* Single column: Unserved items */}
                <div className="space-y-2 flex-grow">
                    {unservedItems.length > 0 && (
                        <h4 className="text-xs font-bold text-[#5c3f40] uppercase tracking-widest flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${pendingItems.length > 0 ? 'bg-[#b80035] animate-pulse' : 'bg-[#8BC34A]'}`}></span>
                            New Orders
                            <span className="text-[10px] font-bold text-white bg-[#b80035] px-1.5 py-0.5 rounded-full ml-auto">
                                {unservedItems.length}
                            </span>
                        </h4>
                    )}

                    {unservedItems.length === 0 ? (
                        <div className="text-center py-4">
                            <svg className="w-7 h-7 mx-auto text-[#e4e2e4] mb-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                            <p className="text-xs font-medium text-[#5c3f40]/40">
                                {allServed ? `All ${servedItems.length} items served` : 'No pending orders'}
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-1.5">
                            {unservedItems.map((item, i) => {
                                const isCookingComplete = item.status === 'cooking_complete'
                                return (
                                    <li
                                        key={item.id || i}
                                        className={`flex items-center justify-between p-2.5 rounded-lg transition-all ${
                                            isCookingComplete ? 'border-l-4 border-[#8BC34A]' : 'border-l-4 border-transparent'
                                        }`}
                                        style={{ backgroundColor: isCookingComplete ? '#DBF776' : 'rgba(255,218,218,0.3)' }}
                                    >
                                        <div className="flex-1 min-w-0 mr-2">
                                            <span className="font-bold text-[#1b1b1d] text-sm block truncate">{getMenuName(item.menu_item_id)}</span>
                                            <span className="text-xs text-[#5c3f40]/60">
                                                ×{item.quantity}
                                                {isCookingComplete && (
                                                    <span className="ml-1.5 text-[9px] font-bold text-[#558B2F] bg-[#C5E1A5] px-1 py-0.5 rounded-full">調理完了</span>
                                                )}
                                            </span>
                                        </div>
                                        {/* Toggle OFF = not served yet */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleMarkItemServed(item.id) }}
                                            className="shrink-0 w-9 h-5 rounded-full bg-[#e4e2e4] relative transition-colors hover:bg-[#dcd9dc] active:scale-95"
                                            title="サーブ完了"
                                        >
                                            <span className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"></span>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}

                    {cookingCompleteItems.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleBulkMarkServed(cookingCompleteItems.map(i => i.id)) }}
                            className="w-full py-1.5 bg-[#8BC34A] text-white rounded-lg text-[10px] font-bold uppercase tracking-wide hover:bg-[#7CB342] transition-colors"
                        >
                            全てサーブ完了 ({cookingCompleteItems.length})
                        </button>
                    )}
                </div>

                {/* Footer: Checkout action */}
                {checkout && (
                    <div className="mt-3 pt-2 border-t border-[#f0edef]">
                        <button
                            onClick={(e) => { e.stopPropagation(); handlePayAndClose(table) }}
                            className="w-full py-2.5 bg-[#1b1b1d] text-white rounded-xl text-xs font-bold uppercase tracking-wide hover:bg-[#303032] transition-colors active:scale-[0.98]"
                        >
                            決済完了
                        </button>
                    </div>
                )}
            </div>
        )
    }

    // ── Register Tab: Table Card ──────────────────────────────────────────────
    const renderRegisterCard = (table) => {
        const occupied = isOccupied(table)
        const checkout = isCheckout(table)
        const total = table.total_unpaid || 0

        let cardBg = 'bg-[#f6f3f5]'
        let cardBorder = 'border border-transparent'
        let numberColor = 'text-[#5c3f40]/40'

        if (occupied && !checkout) {
            cardBg = 'bg-white'
            cardBorder = 'border-2 border-[#0050d4]'
            numberColor = 'text-[#1b1b1d]'
        }
        if (checkout) {
            cardBg = 'bg-[#ffdada]'
            cardBorder = 'border-2 border-[#E11D48]'
            numberColor = 'text-[#b80035]'
        }

        const handleClick = () => {
            if (checkout) {
                handlePayAndClose(table)
            } else if (occupied) {
                openPosModal(table)
            } else {
                handleOpenTable(table.id)
            }
        }

        return (
            <div
                key={table.id}
                onClick={handleClick}
                className={`${cardBg} p-5 rounded-xl flex flex-col justify-between aspect-square transition-all duration-150 ease-in-out cursor-pointer ${cardBorder} hover:translate-y-[-2px] shadow-[0_4px_16px_rgba(28,28,30,0.03)]`}
            >
                <div className="flex justify-between items-start">
                    <span className={`font-extrabold text-3xl tracking-tight ${numberColor}`} style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {String(table.table_number).padStart(2, '0')}
                    </span>
                    {!occupied && (
                        <span className="bg-[#e4e2e4] text-[#5c3f40] text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-tighter">Ready</span>
                    )}
                    {checkout && (
                        <span className="bg-[#E11D48] text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-tighter animate-pulse">Check</span>
                    )}
                </div>
                <div>
                    {occupied ? (
                        <>
                            <p className="text-xs font-medium text-[#5c3f40]">{table.guest_count ? `${table.guest_count} Guests` : ''}</p>
                            <p className="font-bold text-lg text-[#1b1b1d]">¥{total.toLocaleString()}</p>
                            {checkout && (
                                <p className="text-[10px] text-[#b80035] font-bold uppercase tracking-wider mt-1">Payment Ready</p>
                            )}
                        </>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleOpenTable(table.id) }}
                            className="w-full py-2 bg-[#b80035] text-white rounded-lg text-[10px] font-bold uppercase tracking-wide hover:bg-[#920028] transition-colors"
                        >
                            Open Table
                        </button>
                    )}
                </div>
            </div>
        )
    }

    // ── Takeout orders ──────────────────────────────────────────────────────
    const takeoutOrders = allOrders.filter(o => o.order_type === 'take_out' && o.status !== 'cancelled')

    return (
        <div className="bg-[#fcf8fb] min-h-screen text-[#1b1b1d] flex flex-col lg:flex-row" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* ── Left Sidebar Nav (lg+) ── */}
            <StaffSidebar activePage="staff" />

            {/* ── Main Content Area ── */}
            <div className="flex-1 flex flex-col min-w-0">
            {/* Top App Bar */}
            <header className="bg-white flex justify-between items-center w-full px-4 md:px-6 py-2.5 sticky top-0 z-40 border-b border-[#f0edef]">
                <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-[#b80035]" fill="currentColor" viewBox="0 0 24 24"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
                    <div>
                        <h1 className="text-sm font-bold tracking-tight text-[#b80035] leading-tight cursor-pointer active:opacity-60"
                            onClick={() => window.dispatchEvent(new Event('staff-nav-show'))}
                            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            {storeData?.name || 'Staff'}
                        </h1>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-[#b80035] rounded-full"></span>
                            <p className="text-[#5c3f40] font-medium text-[11px]">{activeTableCount} Active · {tables.length} Tables</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Sort toggle */}
                    <button
                        onClick={() => setSortMode(sortMode === 'priority' ? 'table' : 'priority')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors active:scale-95 bg-[#f6f3f5] text-[#5c3f40] hover:bg-[#e4e2e4]"
                        title={sortMode === 'priority' ? '優先順 (サーブ待ち順)' : 'テーブル番号順'}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h12M3 17h6" />
                        </svg>
                        {sortMode === 'priority' ? '優先順' : 'テーブル順'}
                    </button>
                    {/* View toggle */}
                    <button
                        onClick={() => setDetailView(!detailView)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors active:scale-95 ${
                            detailView
                                ? 'bg-white shadow-sm text-[#b80035] border border-[#e4e2e4]'
                                : 'bg-[#e4e2e4] text-[#5c3f40] hover:bg-[#dcd9dc]'
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d={detailView ? "M3 4h18v4H3V4zm0 6h8v10H3V10zm10 0h8v10h-8V10z" : "M4 6h16M4 12h16M4 18h16"} />
                        </svg>
                        {detailView ? '詳細' : '通常'}
                    </button>
                    <button
                        onClick={() => navigate(`/${shop_id}/admin`)}
                        className="p-1.5 text-[#5c3f40] hover:bg-[#f6f3f5] transition-colors rounded-full"
                    >
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-6">

                {/* ── 테이크아웃 조리시간 문의 배너 ─────────────────────────────────── */}
                {timeQueries.length > 0 && (
                    <div className="mb-5 space-y-2">
                        {timeQueries.map(q => (
                            <div key={q.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">🥡</span>
                                    <div>
                                        <p className="text-sm font-bold text-amber-800">
                                            テイクアウト 調理時間のお問い合わせ
                                            {q.query_type === 'ask_specific' && q.requested_time && (
                                                <span className="ml-2 text-amber-600">「{q.requested_time}」希望</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-amber-600">
                                            ¥{q.total_amount?.toLocaleString()} ·
                                            {q.items?.map(i => ` ${i.name}×${i.quantity}`).join(',')}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setRespondModal(q); setResponseType('minutes'); setResponseMinutes(15); setResponseTime('') }}
                                    className="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold rounded-lg transition-all"
                                >返答する</button>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'staff' && (
                    <section>
                        {/* Table Grid
                            Detail: phone 1col, tablet landscape 2col
                            Simple: phone 2col, tablet landscape 4col */}
                        <div className={`grid ${
                            detailView
                                ? 'grid-cols-1 md:grid-cols-2 gap-5'
                                : 'grid-cols-2 md:grid-cols-4 gap-4'
                        }`}>
                            {sortedTables.map(table => detailView ? renderDetailCard(table) : renderSimpleCard(table))}
                            {tables.length === 0 && (
                                <div className="col-span-full py-12 text-center text-[#5c3f40]">
                                    No tables found for this store.
                                </div>
                            )}
                        </div>

                        {/* Takeout Section */}
                        {takeoutOrders.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-sm font-extrabold text-[#5c3f40] mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                                    TakeOut Orders
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {takeoutOrders
                                        .slice()
                                        .sort((a, b) => {
                                            if (a.pickup_time && b.pickup_time) return a.pickup_time.localeCompare(b.pickup_time)
                                            if (a.pickup_time) return -1
                                            if (b.pickup_time) return 1
                                            return 0
                                        })
                                        .map((order, idx) => {
                                        const isReady = order.status === 'pickup_ready'
                                        return (
                                        <div key={order.id} className={`border p-4 rounded-xl flex flex-col justify-between min-h-[140px] ${isReady ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-200'}`}>
                                            <div className="flex items-start justify-between gap-1">
                                                {order.pickup_code ? (
                                                    <span className="text-base font-black text-amber-800 tracking-widest bg-white/70 px-1.5 py-0.5 rounded">{order.pickup_code}</span>
                                                ) : (
                                                    <span className="text-sm font-extrabold text-amber-700">TO-{idx + 1}</span>
                                                )}
                                                <div className="flex flex-col items-end gap-0.5">
                                                    {isReady && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-700 uppercase">Ready</span>
                                                    )}
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                        order.payment_status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                                                    }`}>{order.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</span>
                                                </div>
                                            </div>
                                            <div className="text-center my-1.5">
                                                <p className="text-lg font-extrabold text-amber-800 tabular-nums">¥{(order.total_amount || 0).toLocaleString()}</p>
                                                {order.pickup_time && (
                                                    <p className="text-[10px] text-amber-600 font-bold">🕐 {order.pickup_time}</p>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-amber-600 space-y-0.5">
                                                {order.items?.slice(0, 3).map((item, i) => (
                                                    <div key={i} className="flex justify-between">
                                                        <span className="truncate">{getMenuName(item.menu_item_id)}</span>
                                                        <span className="font-bold ml-1">×{item.quantity}</span>
                                                    </div>
                                                ))}
                                                {(order.items?.length || 0) > 3 && (
                                                    <p className="text-amber-400">+{order.items.length - 3} more</p>
                                                )}
                                            </div>
                                        </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {activeTab === 'register' && (
                    <section className="flex flex-col gap-6">
                        <header className="flex justify-between items-center">
                            <h2 className="font-extrabold text-3xl md:text-4xl tracking-tight text-[#1b1b1d]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                Register
                            </h2>
                        </header>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {tables.map(table => renderRegisterCard(table))}
                        </div>
                    </section>
                )}

                {activeTab === 'settings' && (
                    <section className="flex flex-col gap-6">
                        <h2 className="font-extrabold text-3xl md:text-4xl tracking-tight text-[#1b1b1d]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            Settings
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                            <button
                                onClick={() => navigate(`/${shop_id}/admin`)}
                                className="bg-white border border-[#e4e2e4] rounded-xl p-6 text-left hover:border-[#b80035] transition-colors shadow-[0_4px_16px_rgba(28,28,30,0.03)]"
                            >
                                <p className="font-bold text-lg text-[#1b1b1d]">Admin Panel</p>
                                <p className="text-xs text-[#5c3f40] mt-1">メニュー管理、店舗設定など</p>
                            </button>
                            <button
                                onClick={() => navigate(`/${shop_id}/kitchen`)}
                                className="bg-white border border-[#e4e2e4] rounded-xl p-6 text-left hover:border-[#b80035] transition-colors shadow-[0_4px_16px_rgba(28,28,30,0.03)]"
                            >
                                <p className="font-bold text-lg text-[#1b1b1d]">Kitchen Display</p>
                                <p className="text-xs text-[#5c3f40] mt-1">キッチン注文画面を開く</p>
                            </button>
                            <button
                                onClick={() => window.open(`/${shop_id}/admin/tables/print`, '_blank')}
                                className="bg-white border border-[#e4e2e4] rounded-xl p-6 text-left hover:border-[#b80035] transition-colors shadow-[0_4px_16px_rgba(28,28,30,0.03)]"
                            >
                                <p className="font-bold text-lg text-[#1b1b1d]">Print QR Codes</p>
                                <p className="text-xs text-[#5c3f40] mt-1">テーブル全QRコード印刷</p>
                            </button>
                            <button
                                onClick={() => navigate(`/${shop_id}/admin/qr-builder`)}
                                className="bg-white border border-[#e4e2e4] rounded-xl p-6 text-left hover:border-[#b80035] transition-colors shadow-[0_4px_16px_rgba(28,28,30,0.03)]"
                            >
                                <p className="font-bold text-lg text-[#1b1b1d]">QR Builder</p>
                                <p className="text-xs text-[#5c3f40] mt-1">QRコードデザイン作成</p>
                            </button>
                        </div>
                    </section>
                )}
            </main>

            {/* ── Bottom Nav (<lg) ── */}
            <StaffBottomNav activePage="staff" />

            </div>{/* end Main Content Area wrapper */}

            {/* ── Guest Count Modal ── */}
            {guestModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setGuestModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-[#1b1b1d] text-center mb-1">テーブルを開く</h3>
                        <p className="text-xs text-[#5c3f40] text-center mb-5">お客様の人数を入力してください</p>
                        <div className="flex items-center justify-center gap-4 mb-6">
                            <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="w-12 h-12 rounded-full bg-[#f6f3f5] hover:bg-[#e4e2e4] text-[#1b1b1d] text-2xl font-bold flex items-center justify-center transition-colors">−</button>
                            <span className="text-4xl font-extrabold text-[#1b1b1d] tabular-nums w-16 text-center">{guestCount}</span>
                            <button onClick={() => setGuestCount(Math.min(99, guestCount + 1))} className="w-12 h-12 rounded-full bg-[#f6f3f5] hover:bg-[#e4e2e4] text-[#1b1b1d] text-2xl font-bold flex items-center justify-center transition-colors">+</button>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-6">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                <button key={n} onClick={() => setGuestCount(n)} className={`py-2 rounded-lg text-sm font-bold transition-colors ${guestCount === n ? 'bg-[#b80035] text-white' : 'bg-[#f6f3f5] text-[#5c3f40] hover:bg-[#e4e2e4]'}`}>{n}</button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setGuestModal(null)} className="flex-1 py-3 bg-[#f6f3f5] hover:bg-[#e4e2e4] text-[#5c3f40] font-bold rounded-xl text-sm transition-colors">Cancel</button>
                            <button onClick={confirmOpenTable} className="flex-1 py-3 bg-[#b80035] hover:bg-[#920028] text-white font-bold rounded-xl text-sm transition-colors">Open</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Transfer Modal ── */}
            {transferModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setTransferModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-[#1b1b1d] text-center mb-1">テーブル移動</h3>
                        <p className="text-xs text-[#5c3f40] text-center mb-4">
                            テーブル {transferModal.sourceTable.table_number} の注文を移動先を選択
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            {tables.filter(t => t.id !== transferModal.sourceTable.id).map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => handleTransfer(t.id)}
                                    className={`p-3 rounded-xl border-2 text-center transition-all ${
                                        isOccupied(t) ? 'border-[#E11D48]/30 bg-[#ffdada] hover:border-[#E11D48]' : 'border-[#e4e2e4] bg-[#f6f3f5] hover:border-[#b80035]'
                                    }`}
                                >
                                    <span className="text-lg font-extrabold text-[#1b1b1d]">{t.table_number}</span>
                                    <p className="text-[10px] text-[#5c3f40] font-bold">{isOccupied(t) ? 'Occupied' : 'Ready'}</p>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setTransferModal(null)} className="w-full mt-4 py-3 bg-[#f6f3f5] hover:bg-[#e4e2e4] text-[#5c3f40] font-bold rounded-xl text-sm">Cancel</button>
                    </div>
                </div>
            )}

            {/* ── Table Detail Modal (from simple view tap) ── */}
            {detailModal && (() => {
                const table = detailModal.table
                const orders = getTableOrders(table)
                const total = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
                const allItems = getTableItems(table)
                const cookingCompleteItems = allItems.filter(i => i.status === 'cooking_complete')
                return (
                    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetailModal(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-[#f0edef] flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-extrabold text-[#1b1b1d]">Table {table.table_number}</h3>
                                    <p className="text-xs text-[#5c3f40]">
                                        {table.guest_count ? `${table.guest_count} Guests` : ''} · {orders.length} Orders · ¥{total.toLocaleString()}
                                    </p>
                                </div>
                                <button onClick={() => setDetailModal(null)} className="text-[#5c3f40] hover:text-[#1b1b1d] text-2xl leading-none">&times;</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-3">
                                {orders.length === 0 && (
                                    <p className="text-center text-[#5c3f40] text-sm py-8">No orders</p>
                                )}
                                {orders.map(order => {
                                    // Derive order-level status from items
                                    const orderItems = order.items || []
                                    const orderAllServed = orderItems.length > 0 && orderItems.every(i => i.status === 'served')
                                    const orderAllDone = orderItems.length > 0 && orderItems.every(i => i.status === 'cooking_complete' || i.status === 'served')
                                    const derivedStatus = orderAllServed ? 'served' : orderAllDone ? 'cooking_complete' : 'pending'
                                    return (
                                    <div key={order.id} className="border border-[#e4e2e4] rounded-xl p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-[#5c3f40] font-bold">#{order.id}</span>
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                    derivedStatus === 'cooking_complete' ? 'bg-[#C5E1A5] text-[#558B2F]' :
                                                    derivedStatus === 'served' ? 'bg-slate-100 text-slate-500' :
                                                    'bg-[#ffdada] text-[#b80035]'
                                                }`}>
                                                    {derivedStatus === 'cooking_complete' ? '調理完了' : derivedStatus === 'served' ? 'サーブ済' : '調理中'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-extrabold text-[#1b1b1d]">¥{(order.total_amount || 0).toLocaleString()}</span>
                                                <button
                                                    onClick={() => setDeleteConfirm({ orderId: order.id })}
                                                    className="text-[10px] px-2 py-1 bg-red-50 text-red-500 font-bold rounded-lg hover:bg-red-100 transition-colors"
                                                >Delete</button>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            {order.items?.map((item, i) => (
                                                <div key={i} className={`flex justify-between items-center text-sm px-2 py-1 rounded`}
                                                    style={{
                                                        backgroundColor: item.status === 'served' ? '#f8fafc' : item.status === 'cooking_complete' ? '#DBF776' : 'rgba(255,218,218,0.3)',
                                                        borderLeft: item.status === 'cooking_complete' ? '3px solid #8BC34A' : item.status === 'served' ? '3px solid #94a3b8' : '3px solid transparent',
                                                        opacity: item.status === 'served' ? 0.5 : 1,
                                                        textDecoration: item.status === 'served' ? 'line-through' : 'none'
                                                    }}
                                                >
                                                    <span className="text-[#5c3f40]">{getMenuName(item.menu_item_id)}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[#1b1b1d] font-bold">×{item.quantity}</span>
                                                        {(item.status === 'cooking_complete' || item.status === 'served') && (
                                                            <button
                                                                onClick={() => item.status === 'served' ? handleUndoServe(item.id) : handleMarkItemServed(item.id)}
                                                                className={`shrink-0 w-9 h-5 rounded-full relative transition-colors active:scale-95 ${
                                                                    item.status === 'served' ? 'bg-[#b80035]' : 'bg-[#e4e2e4] hover:bg-[#dcd9dc]'
                                                                }`}
                                                            >
                                                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                                                                    item.status === 'served' ? 'right-0.5' : 'left-0.5'
                                                                }`}></span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    )
                                })}
                            </div>

                            <div className="p-4 border-t border-[#f0edef] space-y-2">
                                {cookingCompleteItems.length > 0 && (
                                    <button
                                        onClick={() => { handleBulkMarkServed(cookingCompleteItems.map(i => i.id)); setDetailModal(null) }}
                                        className="w-full py-3 text-white font-bold rounded-xl text-sm"
                                        style={{ backgroundColor: '#8BC34A' }}
                                    >全てサーブ完了 ({cookingCompleteItems.length}品)</button>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setDetailModal(null); setTransferModal({ sourceTable: table }) }}
                                        className="flex-1 py-3 bg-[#f6f3f5] hover:bg-[#e4e2e4] text-[#5c3f40] font-bold rounded-xl text-sm"
                                    >Transfer</button>
                                    <button
                                        onClick={() => { setDetailModal(null); handleCloseTable(table.id) }}
                                        className="flex-1 py-3 bg-[#E11D48] hover:bg-[#b80035] text-white font-bold rounded-xl text-sm"
                                    >Close Table</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* ── テイクアウト 調理時間 返答モーダル ── */}
            {respondModal && (() => {
                let items = []
                try { items = JSON.parse(respondModal.items_snapshot || '[]') } catch (e) {}
                return (
                <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRespondModal(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="shrink-0 text-center mb-4">
                            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-2">🥡</div>
                            <h3 className="text-xl font-black text-[#1b1b1d] tracking-tight">테이크아웃 문의 접수</h3>
                        </div>
                        
                        <p className="text-sm font-bold text-amber-700 mb-4 bg-amber-50 p-3 rounded-xl border border-amber-100 text-center shadow-sm">
                            {respondModal.query_type === 'ask_specific'
                                ? `「${respondModal.requested_time}」 수령 희망`
                                : '최대한 빠른 조리 시간 안내 요청 (ASAP)'}
                        </p>
                        
                        <div className="flex-1 overflow-y-auto mb-5 border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-2.5">
                            {items.map((item, i) => (
                                <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="font-semibold text-slate-700 leading-tight">{item.name}</span>
                                    <span className="font-black text-slate-900 bg-white px-2 py-0.5 rounded-md shadow-sm border border-slate-100">×{item.quantity}</span>
                                </div>
                            ))}
                            <div className="pt-3 mt-1 border-t border-slate-200/80 flex justify-between items-center">
                                <span className="font-bold text-slate-500 text-xs">합계</span>
                                <span className="font-black text-slate-900 text-lg tracking-tight">¥{respondModal.total_amount?.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="shrink-0 space-y-2.5 mb-6">
                            {respondModal.query_type === 'ask_specific' && (
                                <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${responseType === 'set_time' ? 'bg-emerald-50 border-emerald-400 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                    <input type="radio" checked={responseType === 'set_time'} onChange={() => { setResponseType('set_time'); setResponseTime(respondModal.requested_time) }} className="accent-emerald-500 w-4.5 h-4.5" />
                                    <span className={`text-sm font-bold ${responseType === 'set_time' ? 'text-emerald-800' : 'text-slate-600'}`}>희망 시간 정시 가능 ({respondModal.requested_time})</span>
                                </label>
                            )}

                            <div className={`rounded-xl border-2 transition-all overflow-hidden ${responseType === 'minutes' ? 'bg-white border-amber-400 shadow-sm' : 'bg-white border-slate-100'}`}>
                                <label className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-slate-50">
                                    <input type="radio" checked={responseType === 'minutes'} onChange={() => setResponseType('minutes')} className="accent-amber-500 w-4.5 h-4.5" />
                                    <span className={`text-sm font-bold ${responseType === 'minutes' ? 'text-amber-800' : 'text-slate-600'}`}>N분 후 수령 가능 (시간 지연/안내)</span>
                                </label>

                                {responseType === 'minutes' && (
                                    <div className="p-3 pt-0 border-t border-slate-50 bg-slate-50/30">
                                        <div className="grid grid-cols-3 gap-2 mt-2">
                                            {[10, 20, 30, 40, 50, 60].map(m => (
                                                <button key={m} onClick={() => setResponseMinutes(m)}
                                                    className={`py-2.5 rounded-lg text-sm font-black transition-all ${responseMinutes === m ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 scale-105' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                                >+{m}분</button>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2 mt-3 bg-white p-2 rounded-xl border border-slate-200">
                                            <span className="text-xs font-bold text-slate-400 ml-1">직접입력</span>
                                            <input type="number" value={responseMinutes} onChange={e => setResponseMinutes(e.target.value)}
                                                className="flex-1 w-full bg-slate-50 py-1.5 rounded-lg text-sm text-center font-black focus:ring-2 focus:ring-amber-400 focus:outline-none" min={1} max={300} />
                                            <span className="text-xs font-bold text-slate-400 mr-1">분</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${responseType === 'decline' ? 'bg-red-50 border-red-400 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                <input type="radio" checked={responseType === 'decline'} onChange={() => setResponseType('decline')} className="accent-red-500 w-4.5 h-4.5" />
                                <span className={`text-sm font-bold ${responseType === 'decline' ? 'text-red-700' : 'text-slate-600'}`}>현재 주문 접수 불가 (거절)</span>
                            </label>
                        </div>

                        <div className="flex gap-2 shrink-0">
                            <button onClick={() => setRespondModal(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-sm hover:bg-slate-200 transition-colors">취소</button>
                            <button onClick={handleStaffRespond} className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black rounded-2xl text-sm shadow-lg shadow-amber-500/30 hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
                                응답 전송 <span className="material-symbols-outlined !text-lg">send</span>
                            </button>
                        </div>
                    </div>
                </div>
                )
            })()}

            {/* ── Delete Confirmation ── */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs text-center" onClick={e => e.stopPropagation()}>
                        <p className="text-lg font-bold text-[#1b1b1d] mb-2">Delete Order?</p>
                        <p className="text-xs text-[#5c3f40] mb-6">Order #{deleteConfirm.orderId} will be permanently deleted.</p>
                        <div className="flex gap-2">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 bg-[#f6f3f5] hover:bg-[#e4e2e4] text-[#5c3f40] font-bold rounded-xl text-sm">Cancel</button>
                            <button onClick={() => handleDeleteOrder(deleteConfirm.orderId)} className="flex-1 py-3 bg-[#E11D48] hover:bg-[#b80035] text-white font-bold rounded-xl text-sm">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── POS Modal (Register) ── */}
            {posModalOpen && selectedTable && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closePosModal}></div>
                    <div className="relative bg-white border border-[#e4e2e4] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
                        {/* Left: Menu */}
                        <div className="flex-1 flex flex-col border-r border-[#e4e2e4]">
                            <div className="p-4 border-b border-[#e4e2e4] bg-[#f6f3f5] flex justify-between items-center">
                                <h3 className="font-bold text-lg text-[#1b1b1d]">Manual Order — Table {selectedTable.table_number}</h3>
                                <button onClick={closePosModal} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#e4e2e4] hover:bg-[#dcd9dc] text-[#5c3f40]">
                                    &times;
                                </button>
                            </div>
                            <div className="p-2 border-b border-[#e4e2e4] flex overflow-x-auto gap-2">
                                {categories.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setActiveCategory(c)}
                                        className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${
                                            activeCategory === c ? 'bg-[#b80035] text-white' : 'bg-[#f6f3f5] text-[#5c3f40] hover:bg-[#e4e2e4]'
                                        }`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                                {posMenus.filter(m => activeCategory === 'All' || m.category === activeCategory).map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => addToPosCart(m)}
                                        className="bg-[#f6f3f5] border border-[#e4e2e4] rounded-xl p-3 flex flex-col items-center hover:border-[#b80035] active:scale-95 transition-all text-left"
                                    >
                                        <div className="w-full aspect-[4/3] rounded-lg bg-[#e4e2e4] mb-2 overflow-hidden">
                                            {m.image_url ? <img src={m.image_url} alt={m.name_jp} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[#e4e2e4]"></div>}
                                        </div>
                                        <div className="text-sm font-bold w-full line-clamp-1 text-[#1b1b1d]">{m.name_jp || m.name_ko}</div>
                                        <div className="text-xs text-[#b80035] w-full font-medium">¥{m.price.toLocaleString()}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Right: Cart */}
                        <div className="w-full md:w-80 bg-[#f6f3f5] flex flex-col">
                            <div className="p-4 border-b border-[#e4e2e4]">
                                <h3 className="font-bold flex items-center gap-2 text-[#1b1b1d]">
                                    Cart — Table {selectedTable.table_number}
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {cart.length === 0 ? (
                                    <div className="text-center text-[#5c3f40] mt-10 text-sm">Empty cart</div>
                                ) : (
                                    cart.map(item => (
                                        <div key={item.id} className="bg-white p-3 rounded-xl border border-[#e4e2e4]">
                                            <div className="text-sm font-medium mb-2 text-[#1b1b1d]">{item.name_jp || item.name_ko}</div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3 bg-[#f6f3f5] rounded-lg overflow-hidden">
                                                    <button onClick={() => updatePosQuantity(item.id, -1)} className="px-3 py-1 bg-[#e4e2e4] hover:bg-[#dcd9dc]">-</button>
                                                    <span className="px-2 text-sm font-bold">{item.quantity}</span>
                                                    <button onClick={() => updatePosQuantity(item.id, 1)} className="px-3 py-1 bg-[#e4e2e4] hover:bg-[#dcd9dc]">+</button>
                                                </div>
                                                <div className="font-bold text-[#b80035] text-sm">
                                                    ¥{(item.price * item.quantity).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="p-4 border-t border-[#e4e2e4] space-y-4">
                                <div className="flex justify-between items-center font-bold text-lg text-[#1b1b1d]">
                                    <span>Total</span>
                                    <span>¥{posTotal.toLocaleString()}</span>
                                </div>
                                <button
                                    onClick={submitPosOrder}
                                    className="w-full py-4 bg-[#b80035] hover:bg-[#920028] text-white rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2"
                                >
                                    Submit Order
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
