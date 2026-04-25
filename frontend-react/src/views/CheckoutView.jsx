import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { motion } from 'framer-motion'
import { CreditCard, ArrowLeft, Receipt, CheckCircle, Smartphone, Printer } from 'lucide-react'

const RECEIPT_PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #receipt-print-area, #receipt-print-area * { visibility: visible !important; }
  #receipt-print-area {
    position: absolute; inset: 0;
    font-family: monospace;
    font-size: 12px;
    color: #000;
    background: #fff;
    padding: 12px;
    width: 72mm;
  }
  .no-print { display: none !important; }
}
`;
import { useLanguage } from '../context/LanguageContext'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'

export default function CheckoutView() {
    const { shop_id: paramShopId, tableNumber: paramTableNumber } = useParams()
    const { storeId: sessionStoreId, tableNumber: sessionTableNumber } = useSession()

    const shop_id = paramShopId || sessionStoreId
    const tableNumber = paramTableNumber || sessionTableNumber

    const navigate = useNavigate()
    const { t, language } = useLanguage()
    const { currentTheme, themes } = useTheme()
    const themeColor = themes[currentTheme]?.color || '#fb7185'
    const [orders, setOrders] = useState([])
    const [menus, setMenus] = useState({})
    const [loading, setLoading] = useState(true)
    const [isCheckingOut, setIsCheckingOut] = useState(false)
    const [isComplete, setIsComplete] = useState(false)
    const [isConfirmOpen, setIsConfirmOpen] = useState(false)

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const res = await axios.get(`/api/orders/`, { params: { store_id: shop_id } })

                console.log("DEBUG CHECKOUT - Total Orders from API:", res.data?.length || "undefined");
                console.log("DEBUG CHECKOUT - RAW RES.DATA:", res.data);
                console.log("DEBUG CHECKOUT - Current paramTableNumber:", paramTableNumber, "sessionTableNum:", sessionTableNumber, "used tableNumber:", tableNumber);

                const rawOrders = Array.isArray(res.data) ? res.data : (res.data?.orders || []);

                // Filter for current table + session
                const savedToken = localStorage.getItem(`tableSessionToken_${shop_id}_${tableNumber}`)
                const tableOrders = rawOrders.filter(o => {
                    if (o.table_number != tableNumber) return false
                    if (savedToken && o.session_token && o.session_token !== savedToken) return false
                    return true
                })

                // Also fetch menus to map IDs to Names
                const menusRes = await axios.get(`/api/menus/${shop_id}`);
                const menuDict = {};
                const rawMenus = Array.isArray(menusRes.data) ? menusRes.data : (menusRes.data?.data || menusRes.data?.items || []);
                rawMenus.forEach(m => { menuDict[String(m.id)] = m; });
                setMenus(menuDict);

                console.log("DEBUG CHECKOUT - Filtered orders:", tableOrders.length);
                setOrders(tableOrders)
            } catch (e) {
                console.error("Failed to fetch orders", e)
            } finally {
                setLoading(false)
            }
        }
        fetchOrders()
    }, [shop_id, tableNumber])

    // Only served items appear on checkout (items that staff confirmed as served)
    const servedItems = useMemo(() => {
        return orders.flatMap(order => (order.items || []).filter(item => item.status === 'served'))
    }, [orders])

    // Also show all items for total calculation (full order amount)
    const allItems = useMemo(() => {
        return orders.flatMap(order => (order.items || []))
    }, [orders])

    const totalSum = useMemo(() => {
        // Total is based on served items only
        return servedItems.reduce((sum, item) => sum + ((item.unit_price || 0) * (item.quantity || 0)), 0)
    }, [servedItems])

    // Pending items count (not yet served)
    const pendingItemsCount = useMemo(() => {
        return allItems.filter(i => i.status !== 'served').length
    }, [allItems])

    const getMenuName = (item) => {
        if (!item) return ''
        const m = menus[String(item.menu_item_id)] || {}
        if (language === 'ko' && m.name_ko) return m.name_ko
        if (language === 'en' && m.name_en) return m.name_en
        if (language === 'zh' && m.name_zh) return m.name_zh
        return m.name_jp || m.name_ko || m.name || `Item ${item.menu_item_id}`
    }

    const handleCheckout = async () => {
        setIsCheckingOut(true)
        try {
            // 1. Get current table data to get its ID
            const tablesRes = await axios.get(`/api/stores/${shop_id}/tables`)
            const table = tablesRes.data.find(t => String(t.table_number) === String(tableNumber))

            if (table) {
                // 2. Call backend checkout endpoint (Invalidates token)
                await axios.post(`/api/qr/checkout/${table.id}`)
                setIsComplete(true)
            }
        } catch (e) {
            console.error("Checkout failed", e)
            alert("Checkout failed. Please try again or ask staff.")
        } finally {
            setIsCheckingOut(false)
        }
    }

    if (isComplete) {
        return (
            <div className="relative flex items-center justify-center p-8 overflow-hidden min-h-[70vh]">
                <div className="fixed inset-0 soft-glow-bg opacity-30"></div>
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="relative z-10 glass rounded-[3rem] p-12 text-center space-y-8 max-w-sm shadow-2xl"
                >
                    <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="text-emerald-500 w-12 h-12" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold text-inherit mb-4">{t('checkout_complete_title')}</h2>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            Checkout request sent. <br />
                            Please proceed to the counter or await staff. <br />
                            <span className="text-primary font-bold mt-2 block">QR Code has been invalidated.</span>
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full py-4 bg-primary text-white rounded-2xl font-bold transition-all hover:bg-white/20"
                    >
                        Back to Home
                    </button>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="relative pb-48">
            {/* Print CSS */}
            <style>{RECEIPT_PRINT_STYLE}</style>

            {/* 영수증 프린트 전용 숨김 영역 */}
            <div id="receipt-print-area" style={{ display: 'none' }}>
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>🌸 Magnolia Receipt</div>
                    <div style={{ fontSize: 11 }}>TABLE {tableNumber}</div>
                    <div style={{ fontSize: 10, color: '#666' }}>{new Date().toLocaleString('ja-JP')}</div>
                </div>
                {servedItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted #ccc' }}>
                        <span>{getMenuName(item)} x{item.quantity}</span>
                        <strong>¥{(item.unit_price * item.quantity).toLocaleString()}</strong>
                    </div>
                ))}
                <div style={{ borderTop: '1px dashed #000', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 14 }}>
                    <span>TOTAL</span>
                    <span>¥{totalSum.toLocaleString()}</span>
                </div>
            </div>

            <main className="px-8 pt-16 space-y-12 relative z-10 max-w-xl mx-auto">
                <div className="space-y-2">
                    <h2 className="text-4xl font-bold tracking-tight text-inherit">{t('checkout_confirm')}</h2>
                    <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-bold">Check Out Summary</p>
                </div>

                {loading ? (
                    <div className="pt-20 flex justify-center">
                        <div style={{ borderColor: `${themeColor}30`, borderTopColor: themeColor }} className="w-10 h-10 border-4 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <div className="space-y-10">
                        {orders.length === 0 && (
                            <div className="py-12 text-center space-y-6 glass rounded-[2.5rem] shadow-sm">
                                <Receipt className="w-12 h-12 text-slate-700 mx-auto" />
                                <div className="text-slate-500 italic px-6">
                                    {t('no_orders')}
                                </div>
                            </div>
                        )}

                        {orders.length > 0 && (
                            /* Receipt Body */
                            <div className="glass backdrop-blur-3xl rounded-[2.5rem] p-8 shadow-2xl shadow-primary/5">
                                <div className="space-y-2 mb-8 border-b border-dashed border-primary/20 pb-8 text-center text-slate-500">
                                    <h3 className="text-inherit font-serif italic text-xl">Magnolia Receipt</h3>
                                    <p className="text-[10px] uppercase tracking-widest">Table Service No. {tableNumber}</p>
                                </div>

                                {/* Pending items notice */}
                                {pendingItemsCount > 0 && (
                                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                                        <p className="text-sm font-bold text-amber-700">
                                            🍳 {pendingItemsCount}品がまだ準備中です
                                        </p>
                                        <p className="text-[10px] text-amber-500 mt-1">サーブ完了後にこちらに表示されます</p>
                                    </div>
                                )}

                                <div className="space-y-6">
                                    {servedItems.length === 0 ? (
                                        <div className="py-8 text-center text-slate-400 italic text-sm">
                                            サーブ済みの商品はまだありません
                                        </div>
                                    ) : servedItems.map((item, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -5 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className="flex items-center justify-between group"
                                        >
                                            <div className="flex items-center gap-4">
                                                {/* Served status circle */}
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full bg-green-500 scale-110 shadow-sm shadow-green-500/40"
                                                    title="サーブ済み"
                                                />
                                                <div className="space-y-0.5">
                                                    <div className="text-inherit font-medium text-sm transition-colors group-hover:text-primary">
                                                        {getMenuName(item)}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-medium">
                                                        Qty: {item.quantity}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-sm font-bold text-inherit font-serif">
                                                ¥{(item.unit_price * item.quantity).toLocaleString()}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                <div className="mt-12 pt-8 border-t border-dashed border-primary/20">
                                    <div className="flex items-end justify-between">
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Total Amount</div>
                                            <div className="text-3xl font-bold text-primary tracking-tighter">
                                                ¥{totalSum.toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 mb-1">{new Date().toLocaleDateString()}</div>
                                            <div className="px-3 py-1 bg-primary/10 text-primary text-[8px] font-bold rounded-lg border border-primary/10 uppercase tracking-tighter">
                                                Pending Payment
                                            </div>
                                        </div>
                                    </div>
                                    {/* 영수증 출력 버튼 */}
                                    <button
                                        onClick={() => {
                                            document.getElementById('receipt-print-area').style.display = 'block';
                                            window.print();
                                            setTimeout(() => { document.getElementById('receipt-print-area').style.display = 'none'; }, 500);
                                        }}
                                        className="no-print mt-6 w-full py-3 flex items-center justify-center gap-2 border border-primary/30 text-primary text-sm font-bold rounded-2xl hover:bg-primary/10 transition-all"
                                    >
                                        <Printer size={16} />
                                        {t('print_receipt')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Checkout Action */}
                        <div className="space-y-6 pt-4">
                            <div className="flex items-center justify-center text-rose-500 mb-2 px-4">
                                <p className="text-[13px] font-bold tracking-tight bg-rose-50 text-rose-600 px-4 py-2 rounded-full border border-rose-100 shadow-sm">
                                    {t('checkout_warning')}
                                </p>
                            </div>

                            <button
                                onClick={() => setIsConfirmOpen(true)}
                                disabled={isCheckingOut}
                                style={{ backgroundColor: themeColor }}
                                className="w-full py-6 hover:opacity-90 text-white rounded-[2rem] font-bold flex items-center justify-center gap-4 transition-all duration-300 shadow-xl disabled:opacity-50"
                            >
                                <CreditCard className="w-6 h-6" />
                                <span className="text-lg">{t('checkout_confirm')}</span>
                            </button>

                            <p className="text-center text-[11px] text-slate-500 leading-relaxed px-4 italic">
                                Once confirmed, your current QR session will end. <br />
                                To order again, please request a new QR code from our staff.
                            </p>
                        </div>
                    </div>
                )}
            </main>

            {/* Confirmation Modal */}
            {isConfirmOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="rounded-[2rem] p-8 max-w-sm w-full space-y-6 shadow-2xl"
                        style={{
                            backgroundColor: 'rgba(15, 15, 25, 0.95)',
                            border: `2px solid ${themeColor}40`,
                            boxShadow: `0 0 40px ${themeColor}20`,
                        }}
                    >
                        <div className="text-center space-y-4">
                            <div
                                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                                style={{ backgroundColor: `${themeColor}20` }}
                            >
                                <Smartphone style={{ color: themeColor }} className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-white">{t('confirm_checkout_title')}</h3>
                            <p
                                className="text-sm font-semibold leading-relaxed rounded-lg px-3 py-2"
                                style={{
                                    color: themeColor,
                                    backgroundColor: `${themeColor}15`,
                                    border: `1px solid ${themeColor}30`,
                                }}
                            >
                                ⚠️ {t('checkout_warning')}
                            </p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleCheckout}
                                disabled={isCheckingOut}
                                style={{ backgroundColor: themeColor }}
                                className="w-full py-4 text-white rounded-xl font-bold transition-all hover:opacity-90 disabled:opacity-50"
                            >
                                {isCheckingOut ? t('processing') : t('confirm')}
                            </button>
                            <button
                                onClick={() => setIsConfirmOpen(false)}
                                className="w-full py-4 text-slate-200 rounded-xl font-bold transition-all hover:opacity-80"
                                style={{
                                    backgroundColor: 'rgba(100, 100, 120, 0.3)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                }}
                            >
                                {t('cancel')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    )
}
