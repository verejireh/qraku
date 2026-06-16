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
import html2canvas from 'html2canvas'
import { currencyHelpers } from '../config/currency'

export default function ReceiptView() {
    const { orderId } = useParams()
    const navigate = useNavigate()
    const [order, setOrder] = useState(null)
    const [loading, setLoading] = useState(true)
    const [store, setStore] = useState(null)
    const pollRef = useRef(null)
    const prevReadyRef = useRef(false)

    const handleClose = () => navigate(-1)
    const cur = currencyHelpers(store)

    const isTakeout = order?.order_type === 'take_out'
    const isPickupReady = isTakeout && order?.items?.length > 0
        && order.items.every(i => i.status === 'pickup_ready')
        
    const ticketRef = useRef(null)
    const [saving, setSaving] = useState(false)

    const handleSaveImage = async () => {
        if (!ticketRef.current) return
        setSaving(true)
        try {
            const canvas = await html2canvas(ticketRef.current, {
                scale: 2,
                backgroundColor: '#1b1b1d', // charcoal
                useCORS: true
            })
            const dataUrl = canvas.toDataURL('image/png')
            const a = document.createElement('a')
            a.href = dataUrl
            a.download = `QRaku_Ticket_${order.pickup_code || order.id}.png`
            a.click()
        } catch (e) {
            console.error('Failed to save image:', e)
            alert('이미지 저장에 실패했습니다.')
        } finally {
            setSaving(false)
        }
    }

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

    const isCancelled = order?.status === 'cancelled'
    const isRefunded = order?.payment_status === 'refunded'

    // Poll for pickup status on takeout orders (취소되면 중단)
    useEffect(() => {
        if (!order?.pickup_code || isPickupReady || isCancelled) {
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
    }, [orderId, order?.pickup_code, isPickupReady, isCancelled])

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

    // 取消・返金された注文 — 테마 위임 전에 한 곳에서 인터셉트(전 테마 공통)
    if (isCancelled) {
        return (
            <div className="min-h-screen bg-charcoal flex flex-col items-center justify-center p-8 text-center font-sans"
                style={{ fontFamily: "'Plus Jakarta Sans', 'Noto Sans JP', sans-serif" }}>
                <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-red-400 !text-4xl">cancel</span>
                </div>
                <h2 className="text-white font-black text-2xl mb-2">この注文はキャンセルされました</h2>
                <p className="text-slate-400 text-sm leading-relaxed max-w-xs mb-2">
                    店舗都合により、ご注文（#{order.id}）をご提供できませんでした。ご迷惑をおかけして申し訳ございません。
                </p>
                {isRefunded ? (
                    <div className="mt-2 inline-flex items-center gap-2 text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-full">
                        <CheckCircle size={16} />
                        <span className="font-bold text-sm">{cur.fmt(order.total_amount || 0)} の返金を受け付けました（反映まで数日かかる場合があります）</span>
                    </div>
                ) : (
                    <div className="mt-2 inline-flex items-center gap-2 text-amber-300 bg-amber-500/10 border border-amber-500/30 px-4 py-2 rounded-full">
                        <Clock size={16} />
                        <span className="font-bold text-sm">返金については店舗にお問い合わせください</span>
                    </div>
                )}
                <button onClick={() => navigate(-1)} className="mt-8 text-slate-300 flex items-center gap-2 hover:text-white">
                    <ArrowLeft size={18} /> 戻る
                </button>
            </div>
        )
    }

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
        <div className="relative min-h-screen bg-charcoal pb-12 flex flex-col font-sans" style={{ fontFamily: "'Plus Jakarta Sans', 'Noto Sans JP', sans-serif" }}>
            <div className="fixed inset-0 soft-glow-bg pointer-events-none"></div>

            <header className="p-6 flex items-center justify-between relative z-10">
                <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors">
                    <ArrowLeft className="text-white w-5 h-5" />
                </button>
                <div className="text-center flex-1 pr-10">
                    <h1 className="text-white font-serif italic text-xl">Digital Ticket</h1>
                </div>
            </header>

            <main className="px-6 relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
                
                {/* ── Digital Ticket Card ── */}
                <div ref={ticketRef} className="relative bg-[#1b1b1d] rounded-t-[2.5rem] rounded-b-3xl border border-white/10 shadow-2xl overflow-hidden mt-4 pt-10">
                    {/* Glowing Accent Top */}
                    <div className={`absolute top-0 left-0 right-0 h-2 ${isTakeout ? (isPickupReady ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-primary'}`}></div>
                    
                    <div className="px-8 text-center pb-8 border-b border-white/10 border-dashed">
                        {store?.logo_url ? (
                            <img src={store.logo_url} alt={store.name} className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-white/20" />
                        ) : (
                            <div className="w-16 h-16 bg-white/5 rounded-full mx-auto flex items-center justify-center mb-4 border border-white/10">
                                <Utensils className="text-white/50 w-8 h-8" />
                            </div>
                        )}
                        <h2 className="text-2xl font-black tracking-tight text-white mb-1">{store?.name || 'QRaku'}</h2>
                        <p className="text-slate-400 text-xs mb-6 uppercase tracking-[0.2em]">{isTakeout ? 'Takeout Order' : 'Dine-in Order'}</p>
                        
                        {isTakeout && order?.pickup_code ? (
                            <div className="space-y-4">
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">수령 번호 (Pickup Code)</p>
                                <div className={`inline-block px-10 py-4 rounded-3xl ${isPickupReady ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-white/5 border border-white/10'}`}>
                                    <span className={`text-6xl font-black tracking-widest ${isPickupReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {order.pickup_code}
                                    </span>
                                </div>
                                {order.pickup_time && (
                                    <div className="flex items-center justify-center gap-2 mt-4 text-amber-300 bg-amber-500/10 px-4 py-2 rounded-full inline-flex mx-auto">
                                        <Clock size={16} />
                                        <span className="font-bold text-sm">수령 예정 시간: {order.pickup_time}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Table No.</p>
                                <div className="text-5xl font-black text-white">{order.table_number}</div>
                            </div>
                        )}
                    </div>

                    <div className="px-8 py-6 bg-white/5">
                        <div className="space-y-4">
                            {order.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-start gap-4">
                                    <div className="flex-1">
                                        <div className="text-white text-sm font-medium leading-tight">
                                            {item.menu?.name_ko || item.menu?.name_jp || `Menu #${item.menu_item_id}`}
                                        </div>
                                        <div className="text-slate-500 text-[10px] uppercase font-bold tracking-tighter mt-0.5">Qty: {item.quantity}</div>
                                    </div>
                                    <div className="text-white text-sm font-bold">
                                        {cur.fmt(item.unit_price * item.quantity)}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-5 mt-5 border-t border-white/10 flex justify-between items-center">
                            <span className="text-slate-400 font-bold text-sm">합계 금액</span>
                            <span className="text-2xl font-black text-white">{cur.fmt(order.total_amount || 0)}</span>
                        </div>
                    </div>
                    
                    {/* Decorative cutouts */}
                    <div className="absolute left-[-12px] top-[calc(100%-160px)] w-6 h-6 bg-charcoal rounded-full border-r border-white/10 z-10"></div>
                    <div className="absolute right-[-12px] top-[calc(100%-160px)] w-6 h-6 bg-charcoal rounded-full border-l border-white/10 z-10"></div>
                </div>

                {/* Save Button */}
                <div className="mt-8 px-4 flex flex-col items-center gap-4">
                    <button 
                        onClick={handleSaveImage} 
                        disabled={saving}
                        className="w-full max-w-[240px] py-4 bg-white text-black font-black rounded-full flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                        {saving ? (
                            <><div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div> 저장 중...</>
                        ) : (
                            <><span className="material-symbols-outlined !text-xl">download</span> 티켓 이미지로 저장</>
                        )}
                    </button>

                    <div className="text-center text-slate-600 text-[10px] uppercase tracking-[0.2em] leading-loose">
                        {new Date(order.created_at).toLocaleString('ja-JP')} <br />
                        Order Ref: #{order.id}
                    </div>
                </div>
            </main>
        </div>
    )
}
