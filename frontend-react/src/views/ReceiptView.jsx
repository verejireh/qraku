import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, Receipt, Utensils, ArrowLeft } from 'lucide-react'
import CosmosReceiptView from './themes/CosmosReceiptView'
import SunflowerReceiptView from './themes/SunflowerReceiptView'
import LavenderReceiptView from './themes/LavenderReceiptView'
import AjisaiReceiptView from './themes/AjisaiReceiptView'
import CamelliaReceiptView from './themes/CamelliaReceiptView'
import BambooReceiptView from './themes/BambooReceiptView'
import SakuraReceiptView from './themes/SakuraReceiptView'

export default function ReceiptView() {
    const { orderId } = useParams()
    const navigate = useNavigate()
    const [order, setOrder] = useState(null)
    const [loading, setLoading] = useState(true)
    const [store, setStore] = useState(null)
    const pollRef = useRef(null)
    const prevReadyRef = useRef(false)

    const handleClose = () => navigate(-1)

    const isTakeout = order?.order_type === 'take_out'
    const isPickupReady = isTakeout && order?.items?.length > 0
        && order.items.every(i => i.status === 'pickup_ready')

    useEffect(() => {
        const fetchOrderAndStore = async () => {
            try {
                const res = await axios.get(`/api/orders/${orderId}`)
                setOrder(res.data)

                // Fetch store theme
                if (res.data.shop_id) {
                    try {
                        const storeRes = await axios.get(`/api/stores/${res.data.shop_id}`)
                        setStore(storeRes.data)
                    } catch { }
                }
            } catch (e) {
                console.error("Failed to fetch data", e)
            } finally {
                setLoading(false)
            }
        }
        if (orderId) fetchOrderAndStore()
    }, [orderId])

    // Poll for pickup status on takeout orders
    useEffect(() => {
        if (!order?.pickup_code || isPickupReady) {
            clearInterval(pollRef.current)
            return
        }
        pollRef.current = setInterval(async () => {
            try {
                const res = await axios.get(`/api/orders/${orderId}`)
                setOrder(res.data)
            } catch { }
        }, 5000)
        return () => clearInterval(pollRef.current)
    }, [orderId, order?.pickup_code, isPickupReady])

    // Vibrate + alert when status flips to ready
    useEffect(() => {
        if (isPickupReady && !prevReadyRef.current) {
            prevReadyRef.current = true
            try { navigator.vibrate?.([200, 100, 200]) } catch { }
        }
    }, [isPickupReady])

    if (loading) return (
        <div className="min-h-screen bg-charcoal flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-gold/20 border-t-gold rounded-full animate-spin"></div>
        </div>
    )

    if (!order) return (
        <div className="min-h-screen bg-charcoal flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-white font-serif text-2xl mb-4">Order Not Found</h2>
            <button onClick={() => navigate(-1)} className="text-primary flex items-center gap-2">
                <ArrowLeft size={18} /> Go Back
            </button>
        </div>
    )

    if (store?.theme === 'sakura') {
        return <SakuraReceiptView store={store} order={order} onClose={handleClose} />
    }

    if (store?.theme === 'cosmos') {
        return <CosmosReceiptView store={store} order={order} onClose={handleClose} />
    }

    if (store?.theme === 'sunflower') {
        return <SunflowerReceiptView store={store} order={order} onClose={handleClose} />
    }

    if (store?.theme === 'lavender') {
        return <LavenderReceiptView store={store} order={order} onClose={handleClose} />
    }

    if (store?.theme === 'ajisai') {
        return <AjisaiReceiptView store={store} order={order} onClose={handleClose} />
    }

    if (store?.theme === 'tsubaki') {
        return <CamelliaReceiptView store={store} order={order} onClose={handleClose} />
    }

    if (store?.theme === 'bamboo') {
        return <BambooReceiptView store={store} order={order} onClose={handleClose} />
    }

    // Default Magnolia theme (or if store theme is not set/recognized)
    return (
        <div className="relative min-h-screen bg-charcoal pb-12">
            <div className="fixed inset-0 soft-glow-bg pointer-events-none"></div>

            <header className="p-6 flex items-center justify-between relative z-10">
                <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <ArrowLeft className="text-white w-5 h-5" />
                </button>
                <div className="text-center flex-1 pr-10">
                    <h1 className="text-white font-serif italic text-xl">Order Receipt</h1>
                </div>
            </header>

            <main className="px-6 relative z-10 max-w-md mx-auto">

                {/* ── Takeout Pickup Card ──────────────────────────────── */}
                {isTakeout && order?.pickup_code && (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`rounded-[2.5rem] border p-8 text-center mb-6 mt-4 ${
                            isPickupReady
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : 'bg-amber-500/10 border-amber-500/30'
                        }`}
                    >
                        {isPickupReady ? (
                            <>
                                <div className="text-5xl mb-3">🥡</div>
                                <p className="text-emerald-300 font-bold text-xl mb-1">お受け取りください！</p>
                                <p className="text-slate-400 text-sm mb-4">カウンターでこちらの番号をご提示ください</p>
                            </>
                        ) : (
                            <>
                                <div className="text-5xl mb-3">👨‍🍳</div>
                                <p className="text-amber-300 font-bold text-xl mb-1">ただいま準備中…</p>
                                <p className="text-slate-500 text-xs mb-4">準備が整い次第、画面が更新されます</p>
                            </>
                        )}

                        {/* Big pickup code */}
                        <div className={`rounded-2xl px-8 py-4 inline-block ${
                            isPickupReady ? 'bg-emerald-500/20' : 'bg-amber-500/20'
                        }`}>
                            <p className={`text-[10px] font-bold uppercase tracking-[0.25em] mb-1 ${
                                isPickupReady ? 'text-emerald-400/70' : 'text-amber-400/70'
                            }`}>受取番号</p>
                            <p className={`text-6xl font-black tracking-widest ${
                                isPickupReady ? 'text-emerald-200' : 'text-amber-200'
                            }`}>{order.pickup_code}</p>
                        </div>

                        {order.pickup_time && (
                            <p className="text-slate-400 text-sm mt-4">
                                🕐 ピックアップ予定時間：<span className="text-white font-bold">{order.pickup_time}</span>
                            </p>
                        )}
                    </motion.div>
                )}

                {/* Success Card */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-card-dark rounded-[2.5rem] border border-white/[0.05] p-8 text-center space-y-6 mb-8 mt-4"
                >
                    <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle className="text-emerald-500 w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-serif text-white mb-2">
                            {isTakeout ? 'ご注文ありがとうございます！' : 'Thank you!'}
                        </h2>
                        <p className="text-slate-400 text-sm">
                            {isTakeout ? '決済が完了しました。上記の番号をお控えください。' : 'Your order is being prepared with care.'}
                        </p>
                    </div>
                </motion.div>

                {/* Details List */}
                <div className="bg-card-dark/50 backdrop-blur-md rounded-[2rem] border border-white/[0.05] p-6 space-y-6">
                    <div className="flex justify-between items-center text-sm border-b border-white/[0.05] pb-4">
                        <span className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">
                            {isTakeout ? '注文種別' : 'Table No.'}
                        </span>
                        <span className="text-white font-serif text-lg">
                            {isTakeout ? '🥡 テイクアウト' : order.table_number}
                        </span>
                    </div>

                    <div className="space-y-4">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start gap-4">
                                <div className="flex-1">
                                    <div className="text-white text-sm font-medium">
                                        {item.menu?.name_ko || item.menu?.name_jp || `メニュー #${item.menu_item_id}`}
                                    </div>
                                    <div className="text-slate-500 text-[10px] uppercase font-bold tracking-tighter">Qty: {item.quantity}</div>
                                </div>
                                <div className="text-white text-sm font-medium">
                                    ¥{(item.unit_price * item.quantity).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-6 border-t border-white/[0.05] space-y-3">
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-white font-bold">合計金額</span>
                            <span className="text-2xl font-serif italic text-primary">¥{(order.total_amount || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Status Badge */}
                <div className="mt-8 flex justify-center">
                    <div className="px-5 py-2 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Status: {order.status}</span>
                    </div>
                </div>

                <div className="mt-12 text-center text-slate-600 text-[10px] uppercase tracking-[0.2em] leading-loose">
                    {new Date(order.created_at).toLocaleString('ja-JP')} <br />
                    Order Ref: #{order.id}
                </div>
            </main>
        </div>
    )
}
