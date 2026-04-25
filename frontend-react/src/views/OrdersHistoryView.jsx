import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { CheckCircle2, BellRing, PlusCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'
import { useSession } from '../context/SessionContext'
import { useCart } from '../hooks/useCart'

export default function OrdersHistoryView() {
    const { shop_id: paramShopId, tableNumber: paramTableNumber } = useParams()
    const { storeId: sessionStoreId, tableNumber: sessionTableNumber } = useSession()

    const shop_id = paramShopId || sessionStoreId
    const tableNumber = paramTableNumber || sessionTableNumber

    const getPath = (route) => {
        const queryParams = window.location.search;
        if (tableNumber) {
            return `/${shop_id}/table/${tableNumber}/${route}${queryParams}`
        }
        return `/${shop_id}/${route}${queryParams}`
    }

    const navigate = useNavigate()
    const { t, language } = useLanguage()
    const { currentTheme, themes } = useTheme()
    const themeColor = themes[currentTheme]?.color || '#fb7185' // Fallback to Sakura pink
    const { addToCart } = useCart()
    const [orders, setOrders] = useState([])
    const [menus, setMenus] = useState({})
    const [loading, setLoading] = useState(true)
    const [numericalStoreId, setNumericalStoreId] = useState(null)
    const [completedModalData, setCompletedModalData] = useState(null) // holds { order_id, items: [{name_jp, name_ko, name_en}] }
    const [reorderFeedback, setReorderFeedback] = useState(null)

    const fetchOrders = useCallback(async (sId) => {
        try {
            const res = await axios.get('/api/orders/', { params: { store_id: sId || shop_id } })

            console.log("DEBUG HISTORY - Total Orders from API:", res.data.length);
            console.log("DEBUG HISTORY - Current context tableNumber:", tableNumber, "Type:", typeof tableNumber);

            const rawOrders = Array.isArray(res.data) ? res.data : (res.data?.orders || []);

            // Filter for current table + session
            const savedToken = localStorage.getItem(`tableSessionToken_${shop_id}_${tableNumber}`)
            const tableOrders = rawOrders.filter(o => {
                if (o.table_number != tableNumber) return false
                // If we have a session token, match it for accuracy
                if (savedToken && o.session_token && o.session_token !== savedToken) return false
                return true
            })

            // Also fetch menus to map IDs to Names
            const menusRes = await axios.get(`/api/menus/${shop_id}`);
            const menuDict = {};
            const rawMenus = Array.isArray(menusRes.data) ? menusRes.data : (menusRes.data?.data || menusRes.data?.items || []);
            rawMenus.forEach(m => { menuDict[String(m.id)] = m; });
            setMenus(menuDict);

            console.log("DEBUG HISTORY - Filtered tableOrders:", tableOrders.length);
            setOrders(tableOrders)
        } catch (e) {
            console.error("Fetch orders failed", e)
        } finally {
            setLoading(false)
        }
    }, [shop_id, tableNumber])

    useEffect(() => {
        const init = async () => {
            try {
                const storeRes = await axios.get(`/api/stores/${shop_id}`)
                const sId = storeRes.data.id
                setNumericalStoreId(sId)
                fetchOrders(sId)
            } catch (e) {
                console.error("Init history failed", e)
                setLoading(false)
            }
        }
        init()
    }, [shop_id, fetchOrders])

    // WebSocket Connection for Realtime Customer Alerts
    useEffect(() => {
        if (!numericalStoreId || !tableNumber) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws/customer/${numericalStoreId}/${tableNumber}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => console.log('Customer WS connected.');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'order_completed' || data.type === 'item_ready') {
                    console.log('Order/Item Complete Event Received:', data);
                    // Refetch to update status circles
                    fetchOrders(numericalStoreId);

                    // Show modal with item names
                    setCompletedModalData(data);

                    // Play a "ding-dong" beep using Web Audio API (no mp3 file needed)
                    try {
                        const AudioCtx = window.AudioContext || window.webkitAudioContext;
                        if (AudioCtx) {
                            const ctx = new AudioCtx();
                            const playNote = (freq, startTime, duration) => {
                                const osc = ctx.createOscillator();
                                const gain = ctx.createGain();
                                osc.connect(gain);
                                gain.connect(ctx.destination);
                                osc.frequency.value = freq;
                                osc.type = 'sine';
                                gain.gain.setValueAtTime(0.5, startTime);
                                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                                osc.start(startTime);
                                osc.stop(startTime + duration);
                            };
                            const now = ctx.currentTime;
                            playNote(880, now, 0.4);      // high A (ding)
                            playNote(660, now + 0.45, 0.5); // E (dong)
                        }
                    } catch (e) { console.log('Audio init failed', e); }

                    // Auto dismiss after 3 seconds
                    setTimeout(() => setCompletedModalData(null), 3000);
                }
            } catch (e) {
                console.error("WS Parse Error:", e);
            }
        };
        ws.onclose = () => console.log('Customer WS disconnected.');

        return () => ws.close();
    }, [numericalStoreId, tableNumber, fetchOrders]);

    const totalSum = orders.reduce((acc, order) => acc + (order.total_amount || 0), 0)

    const handleReorder = (item) => {
        const fullMenu = menus[String(item.menu_item_id)]
        if (!fullMenu) {
            // Navigate to menu as fallback if menu data isn't loaded
            navigate(getPath(''))
            return
        }
        // Add the item to the cart (same effect as clicking + on the menu page)
        addToCart(fullMenu, item.quantity || 1)
        // Show brief feedback - button flashes green then resets
        setReorderFeedback(item.menu_item_id)
        setTimeout(() => setReorderFeedback(null), 1500)
    }

    const getMenuName = (item) => {
        if (!item) return ''
        const m = menus[String(item.menu_item_id)] || {}
        if (language === 'ko' && m.name_ko) return m.name_ko
        if (language === 'en' && m.name_en) return m.name_en
        if (language === 'zh' && m.name_zh) return m.name_zh
        return m.name_jp || m.name_ko || m.name || `Item ${item.menu_item_id}`
    }

    return (
        <div className="relative pb-32">
            <main className="px-8 pt-16 space-y-12 relative z-10 max-w-xl mx-auto">
                <header className="text-center space-y-3">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-block px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-[0.2em]"
                    >
                        Official Receipt
                    </motion.div>
                    <h1 className="text-4xl font-serif italic text-primary leading-tight">{t('digital_receipt')}</h1>
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                        <span>Store #{numericalStoreId}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                        <span>Table {tableNumber}</span>
                    </div>
                </header>

                {loading ? (
                    <div className="space-y-6 animate-pulse">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-primary/5 rounded-2xl" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-10">
                        {/* Receipt Body */}
                        <div className="glass backdrop-blur-3xl rounded-[2.5rem] p-8 shadow-2xl shadow-primary/5">
                            <div className="space-y-2 mb-8 border-b border-dashed border-primary/20 pb-8">
                                <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                    <span>{t('item')}</span>
                                    <span>{t('total')}</span>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {orders.flatMap(order => order.items.map(item => ({ ...item, _orderStatus: order.status }))).map((item, idx) => {
                                    const itemStatus = item.status || 'pending';
                                    const statusColor = itemStatus === 'served' ? '#22c55e' : itemStatus === 'cooking_complete' ? themeColor : '#cbd5e1';
                                    const statusLabel = itemStatus === 'served' ? '✅ サーブ済み' : itemStatus === 'cooking_complete' ? '🎉 調理完了' : '🍳 調理中...';
                                    const isServed = itemStatus === 'served';
                                    return (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        className={`flex items-center justify-between group`}
                                    >
                                        {/* Menu Image */}
                                        <div className="relative flex-shrink-0">
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 shadow-sm">
                                                {menus[String(item.menu_item_id)]?.image_url ? (
                                                    <img
                                                        src={
                                                            (() => {
                                                                const url = menus[String(item.menu_item_id)].image_url
                                                                if (url.startsWith('http')) return url
                                                                if (url.startsWith('/uploads')) return url
                                                                return `/api${url}`
                                                            })()
                                                        }
                                                        alt={getMenuName(item)}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                                                )}
                                            </div>
                                            <div
                                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-all duration-500"
                                                style={{ backgroundColor: statusColor }}
                                                title={statusLabel}
                                            />
                                        </div>

                                        {/* Name + Qty + Status */}
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className={`text-inherit font-semibold text-sm truncate transition-colors group-hover:text-primary`}>
                                                {getMenuName(item)}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-500 font-medium">
                                                    수량: {item.quantity}개
                                                </span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{
                                                    backgroundColor: itemStatus === 'served' ? '#dcfce7' : itemStatus === 'cooking_complete' ? `${themeColor}20` : '#f1f5f9',
                                                    color: itemStatus === 'served' ? '#16a34a' : itemStatus === 'cooking_complete' ? themeColor : '#94a3b8'
                                                }}>
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            {(
                                                <button
                                                    onClick={() => handleReorder(item)}
                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all text-[10px] font-bold active:scale-95 ${reorderFeedback === item.menu_item_id
                                                        ? 'border-green-400 bg-green-50 text-green-600'
                                                        : 'border-slate-200 hover:border-primary/50 hover:bg-primary/5 text-slate-500 hover:text-primary'
                                                        }`}
                                                >
                                                    <PlusCircle className="w-3 h-3" />
                                                    <span>{reorderFeedback === item.menu_item_id ? '카트에 담겼습니다!' : '다시 주문하기'}</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Price */}
                                        <div className="text-right flex-shrink-0">
                                            <div className="text-sm font-bold text-inherit font-serif">
                                                ¥{(item.unit_price * item.quantity).toLocaleString()}
                                            </div>
                                        </div>
                                    </motion.div>
                                    );
                                })}
                            </div>

                            <div className="mt-12 pt-8 border-t border-dashed border-primary/20">
                                <div className="flex items-end justify-between">
                                    <div className="space-y-1">
                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">{t('order_summary')}</div>
                                        <div className="text-3xl font-bold text-primary tracking-tighter">
                                            ¥{totalSum.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-slate-400 mb-1">{new Date().toLocaleDateString()}</div>
                                        <div className="px-3 py-1 bg-primary/10 text-primary text-[8px] font-bold rounded-lg border border-primary/10 uppercase tracking-tighter">
                                            Session Live
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {orders.length === 0 && (
                            <div className="py-20 text-center space-y-4 opacity-50">
                                <div className="text-slate-400 font-serif italic text-lg">{t('no_orders')}</div>
                            </div>
                        )}

                        <div className="text-center px-10 pt-4">
                            <button
                                onClick={() => navigate(getPath('checkout'))}
                                className="w-full py-5 bg-primary text-white rounded-[2rem] font-bold shadow-xl shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-3"
                            >
                                <CheckCircle2 className="w-6 h-6" />
                                <span className="text-lg">{t('go_to_checkout') || 'Check Out'}</span>
                            </button>
                        </div>

                        <div className="text-center px-10">
                            <p className="text-[10px] text-slate-400 italic leading-relaxed">
                                Thank you for dining with us at Magnolia. <br />
                                Your items will be marked with a <span className="not-italic font-bold" style={{ color: themeColor }}>●</span> when ready.
                            </p>
                        </div>
                    </div>
                )}
            </main>

            {/* Order Completed Alert Modal */}
            <AnimatePresence>
                {completedModalData && (
                    <motion.div
                        initial={{ opacity: 0, y: -60, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className="fixed top-20 left-4 right-4 z-50 flex justify-center"
                    >
                        <div
                            className="glass backdrop-blur-3xl px-6 py-5 rounded-3xl shadow-2xl flex items-start gap-4 border max-w-sm w-full"
                            style={{ backgroundColor: `${themeColor}18`, borderColor: `${themeColor}40` }}
                        >
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center animate-bounce shadow-lg flex-shrink-0"
                                style={{ backgroundColor: themeColor }}
                            >
                                <BellRing className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-base font-black text-slate-800 tracking-tight mb-1">🎉 조리가 완료되었습니다!</h3>
                                {completedModalData.items && completedModalData.items.length > 0 && (
                                    <ul className="space-y-0.5 mt-1">
                                        {completedModalData.items.map((it, i) => (
                                            <li key={i} className="text-xs text-slate-600 font-medium flex items-center gap-1.5">
                                                <span style={{ color: themeColor }}>●</span>
                                                <span>{language === 'ko' ? it.name_ko : language === 'en' ? it.name_en : it.name_jp || it.name_ko || it.name_en}</span>
                                                <span className="text-slate-400">× {it.quantity}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <button
                                onClick={() => setCompletedModalData(null)}
                                className="p-1.5 rounded-full hover:bg-black/10 active:scale-95 transition-all text-slate-400 flex-shrink-0"
                            >
                                <CheckCircle2 className="w-5 h-5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
