import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Clock, CheckCircle, Plus, XCircle, Printer } from 'lucide-react'
import { useDisplayGuard, BlockedScreen } from '../hooks/useDisplayGuard'

export default function StaffTableView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const { isAllowed, loading: guardLoading } = useDisplayGuard('register')
    const [tables, setTables] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [activeOrders, setActiveOrders] = useState([])
    const wsRef = useRef(null)

    // Guest count modal
    const [guestModal, setGuestModal] = useState(null) // { tableId }
    const [guestCount, setGuestCount] = useState(2)

    const fetchTables = async () => {
        try {
            // First get the store_id (Internal DB ID vs URL slug)
            const storeRes = await axios.get(`/api/stores/${shop_id}`)
            const storeId = storeRes.data.id

            // Then get tables for that store
            const res = await axios.get(`/api/stores/${storeId}/tables`)
            console.log("받은 데이터 (Tables):", res.data)

            const rawTables = Array.isArray(res.data)
                ? res.data
                : (res.data?.tables || res.data?.items || res.data?.data || [])
            setTables(Array.isArray(rawTables) ? rawTables : [])
        } catch (e) {
            console.error("Failed to fetch tables", e)
        } finally {
            setLoading(false)
        }
    }

    const fetchOrders = async (storeIdNum) => {
        try {
            const res = await axios.get('/api/orders/', {
                params: { store_id: storeIdNum }
            });
            console.log("받은 데이터 (Orders):", res.data);

            const rawOrders = Array.isArray(res.data)
                ? res.data
                : (res.data?.orders || res.data?.items || res.data?.data || []);

            // Show only orders that need attention (not cooking complete yet)
            const openOrders = (Array.isArray(rawOrders) ? rawOrders : []).filter(
                o => (o.status === 'pending_payment' || o.status === 'paid') && o.status !== 'cooking_complete'
            );
            setActiveOrders(openOrders);
        } catch (error) {
            console.error("Failed to fetch active orders:", error);
        }
    }

    useEffect(() => {
        let reconnectInterval = null;

        const initData = async () => {
            try {
                // First get the store_id (Internal DB ID vs URL slug)
                const storeRes = await axios.get(`/api/stores/${shop_id}`)
                const storeIdNum = storeRes.data.id

                // Fetch tables and orders
                const fetchTablesAndOrders = async () => {
                    const res = await axios.get(`/api/stores/${storeIdNum}/tables`)
                    setTables(Array.isArray(res.data) ? res.data : [])
                    fetchOrders(storeIdNum)
                }

                await fetchTablesAndOrders()
                setLoading(false)

                // Interval for table timers
                const interval = setInterval(fetchTablesAndOrders, 30000)

                // WebSocket Connection
                const connectWebSocket = () => {
                    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                        ? 'localhost:8000'
                        : window.location.host;

                    const wsUrl = `${protocol}//${host}/api/ws/admin/${storeIdNum}`;
                    const ws = new WebSocket(wsUrl);
                    wsRef.current = ws;

                    ws.onopen = () => {
                        console.log("POS WebSocket Connected");
                        if (reconnectInterval) {
                            clearInterval(reconnectInterval);
                            reconnectInterval = null;
                        }
                    };

                    ws.onmessage = async (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            if (data.type === "NEW_ORDER") {
                                // Play sound
                                try {
                                    const audio = new Audio('/chime.mp3');
                                    audio.play().catch(e => console.log("Audio play blocked", e));
                                } catch (e) { }

                                // Fetch single order and prepend
                                const res = await axios.get(`/api/orders/${data.order_id}`);
                                setActiveOrders(prev => [res.data, ...prev]);
                            }
                        } catch (error) {
                            console.error("WS msg error:", error);
                        }
                    };

                    ws.onclose = () => {
                        console.log("POS WebSocket Disconnected");
                        if (!reconnectInterval) {
                            reconnectInterval = setInterval(() => {
                                console.log("Reconnecting POS...");
                                connectWebSocket();
                            }, 5000);
                        }
                    };

                    ws.onerror = (error) => ws.close();
                };

                connectWebSocket();

                return () => {
                    clearInterval(interval);
                    if (wsRef.current) wsRef.current.close();
                    if (reconnectInterval) clearInterval(reconnectInterval);
                }
            } catch (e) {
                console.error("Init failed", e)
                const status = e?.response?.status
                if (status === 404) {
                    setError(`매장 "${shop_id}"을(를) 찾을 수 없습니다. URL의 매장 ID/슬러그를 확인해주세요.`)
                } else {
                    setError(`서버 연결 오류 (${status || 'Network Error'}). 백엔드가 실행 중인지 확인해 주세요.`)
                }
                setLoading(false)
            }
        }

        initData()
    }, [shop_id])

    const handleOpenTable = (tableId) => {
        setGuestCount(2)
        setGuestModal({ tableId })
    }

    const confirmOpenTable = async () => {
        if (!guestModal) return
        try {
            await axios.post(`/api/staff/tables/${guestModal.tableId}/open`, { guest_count: guestCount })
            fetchTables()
        } catch (e) {
            alert("Failed to open table")
        } finally {
            setGuestModal(null)
        }
    }

    const handleCloseTable = async (tableId) => {
        if (!window.confirm("Are you sure you want to close this table? This will clear the session.")) return
        try {
            await axios.post(`/api/staff/tables/${tableId}/close`)
            fetchTables()
        } catch (e) {
            alert("Failed to close table")
        }
    }

    const handleExtendTable = async (tableId) => {
        try {
            await axios.post(`/api/staff/tables/${tableId}/extend`)
            fetchTables()
        } catch (e) {
            alert("Failed to extend table time")
        }
    }

    const handleRenewQr = async (tableId) => {
        try {
            await axios.post(`/api/staff/tables/${tableId}/renew-qr`)
            fetchTables()
        } catch (e) {
            alert("QR時間の更新に失敗しました")
        }
    }

    // Helper to calculate remaining minutes
    const getRemainingMinutes = (joinWindowEnd) => {
        if (!joinWindowEnd) return 0
        const diffMs = new Date(joinWindowEnd + 'Z') - new Date() // +Z forces UTC since DB stores naive UTC
        const diffMins = Math.floor(diffMs / 60000)
        return diffMins > 0 ? diffMins : 0
    }

    const handleMarkAsPaid = async (orderId) => {
        try {
            await axios.patch(`/api/orders/${orderId}/pay`)
            // Update local state to reflect paid status removing action button
            setActiveOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, payment_status: 'paid', status: 'paid' } : o
            ))
        } catch (e) {
            alert("현금 결제 완료 처리에 실패했습니다.")
        }
    }

    const handlePrintQRCodes = () => {
        // Open the newly created print route in a new tab
        window.open(`/${shop_id}/admin/tables/print`, '_blank');
    }

    if (loading || guardLoading) {
        return <div className="p-8 text-center text-slate-500">Loading tables...</div>
    }

    if (isAllowed === false) {
        return <BlockedScreen shop_id={shop_id} viewName="카운터 (Register)" />
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-8 text-center">
                <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-md w-full">
                    <p className="text-4xl mb-4">⚠️</p>
                    <h2 className="text-xl font-bold text-red-600 mb-3">페이지를 불러올 수 없습니다</h2>
                    <p className="text-slate-600 text-sm mb-6">{error}</p>
                    <div className="flex gap-3 justify-center">
                        <button onClick={() => { setError(null); setLoading(true); window.location.reload() }} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">
                            🔄 다시 시도
                        </button>
                        <button onClick={() => navigate('/')} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors">
                            홈으로
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* Main Content Area (Tables) */}
            <div className="flex-1 flex flex-col h-full overflow-y-auto w-2/3 xl:w-3/4">
                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Table Management</h1>
                            <p className="text-slate-500 text-sm">Open tables and manage QR sessions</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handlePrintQRCodes}
                                className="px-4 py-2 text-sm font-medium text-white rounded-lg flex items-center gap-2 transition-colors bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                            >
                                <Printer size={16} />
                                🖨️ 테이블 전체 QR코드 인쇄
                            </button>
                            <button
                                onClick={() => navigate(`/${shop_id}/admin`)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border rounded-lg hover:bg-slate-50"
                            >
                                Back to Admin
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                        {tables.map(table => {
                            const isOccupied = table.status === 'OCCUPIED'
                            const minsLeft = getRemainingMinutes(table.join_window_end)
                            const isExpired = isOccupied && minsLeft <= 0 && table.join_window_end

                            return (
                                <div key={table.id} className="bg-white rounded-xl shadow-sm border p-5 flex flex-col justify-between h-48 transition-all hover:shadow-md">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xl font-bold text-slate-800">Table {table.table_number}</h3>
                                        <div className="flex items-center gap-2">
                                            {isOccupied && table.guest_count && (
                                                <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full">
                                                    {table.guest_count}名
                                                </span>
                                            )}
                                            {isOccupied ? (
                                                <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" />
                                                    In Use
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                                                    Empty
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 flex flex-col items-center justify-center">
                                        {isOccupied ? (
                                            table.join_window_end ? (
                                                <div className="text-center">
                                                    <div className="flex items-center justify-center gap-2 mb-1">
                                                        <Clock className={`w-5 h-5 ${isExpired ? 'text-red-500' : 'text-amber-500'}`} />
                                                        <span className={`text-2xl font-bold tabular-nums ${isExpired ? 'text-red-500' : 'text-slate-700'}`}>
                                                            {minsLeft} min
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                                                        {isExpired ? 'Join window expired' : 'Time left to scan QR'}
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-500">Session Active</span>
                                            )
                                        ) : (
                                            <span className="text-sm text-slate-400 italic">Ready to seat</span>
                                        )}
                                    </div>

                                    <div className="flex gap-2 mt-4">
                                        {!isOccupied ? (
                                            <button
                                                onClick={() => handleOpenTable(table.id)}
                                                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Plus className="w-4 h-4" /> Open Table
                                            </button>
                                        ) : (
                                            <>
                                                {isExpired ? (
                                                    <button
                                                        onClick={() => handleRenewQr(table.id)}
                                                        className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        🔄 QR 更新
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleExtendTable(table.id)}
                                                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
                                                    >
                                                        +5 Min
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleCloseTable(table.id)}
                                                    className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <XCircle className="w-4 h-4" /> Close
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        {tables.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-500">
                                No tables found for this store.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Sidebar: POS Order Feed */}
            <div className="w-1/3 xl:w-1/4 h-full bg-white border-l shadow-xl flex flex-col">
                <div className="p-4 border-b bg-slate-800 text-white flex justify-between items-center">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        Live Order Feed
                    </h2>
                    <span className="bg-slate-700 px-2 rounded-full text-xs py-1">{activeOrders.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                    {activeOrders.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <p>No active orders</p>
                        </div>
                    ) : (
                        activeOrders.map(order => {
                            const isPaidCard = order.payment_method === 'online_card' && order.payment_status === 'paid'
                            const isPendingCash = order.payment_method === 'cash_at_counter' && order.payment_status === 'pending'
                            // Defensive logic: if state is weird don't explode
                            const isSafePaymentType = isPaidCard || isPendingCash

                            return (
                                <div key={order.id} className={`bg-white rounded-lg shadow-sm border p-4 transition-all hover:shadow-md ${isPendingCash ? 'border-orange-200 bg-orange-50/30' : 'border-green-100'}`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <span className="text-xs font-bold text-slate-400">ORDER #{order.id}</span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="font-black text-xl text-slate-800">T{order.table_number}</span>
                                                <span className="text-sm text-slate-500 font-medium">¥{order.total_amount?.toLocaleString() || 0}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {isSafePaymentType && isPaidCard && (
                                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 font-bold text-xs px-2.5 py-1 rounded">
                                                    <CheckCircle className="w-3 h-3" />
                                                    💳 카드 (완료)
                                                </span>
                                            )}
                                            {isSafePaymentType && isPendingCash && (
                                                <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 font-bold text-xs px-2.5 py-1 rounded">
                                                    ⏳ 현금 (대기)
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-sm text-slate-600 space-y-1 mb-4">
                                        {order.items?.map((item, idx) => (
                                            <div key={idx} className="flex justify-between border-b border-slate-100 pb-1 last:border-0">
                                                <span>Menu ID: {item.menu_item_id}</span>
                                                <span className="font-bold">x{item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {isPendingCash && (
                                        <button
                                            onClick={() => handleMarkAsPaid(order.id)}
                                            className="w-full mt-2 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-sm transition-colors text-sm"
                                        >
                                            [💴현금결제 완료 & 서빙확인]
                                        </button>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Guest Count Modal */}
            {guestModal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setGuestModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800 text-center mb-1">テーブルを開く</h3>
                        <p className="text-xs text-slate-500 text-center mb-5">お客様の人数を入力してください</p>

                        <div className="flex items-center justify-center gap-4 mb-6">
                            <button
                                onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                                className="w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-2xl font-bold flex items-center justify-center transition-colors"
                            >−</button>
                            <span className="text-4xl font-black text-slate-800 tabular-nums w-16 text-center">{guestCount}</span>
                            <button
                                onClick={() => setGuestCount(Math.min(99, guestCount + 1))}
                                className="w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-2xl font-bold flex items-center justify-center transition-colors"
                            >+</button>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mb-6">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setGuestCount(n)}
                                    className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                                        guestCount === n
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >{n}名</button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setGuestModal(null)}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors text-sm"
                            >キャンセル</button>
                            <button
                                onClick={confirmOpenTable}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors text-sm"
                            >Open Table</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
