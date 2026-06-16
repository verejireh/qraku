import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Share2, Mail, Home, Utensils, Receipt, User, FileText, QrCode } from 'lucide-react'
import axios from 'axios'
import { currencyHelpers } from '../../config/currency'

export default function CamelliaReceiptView({ store, order: initialOrder, onClose }) {
    const navigate = useNavigate()
    const [order, setOrder] = useState(initialOrder)
    const pollRef = useRef(null)
    const prevReadyRef = useRef(false)

    const isTakeout = order?.order_type === 'take_out'
    const isPickupReady = isTakeout && order?.items?.length > 0
        && order.items.every(i => i.status === 'pickup_ready')

    // Poll for pickup status on takeout orders
    useEffect(() => {
        if (!order?.pickup_code || isPickupReady) {
            clearInterval(pollRef.current)
            return
        }
        pollRef.current = setInterval(async () => {
            try {
                const res = await axios.get(`/api/orders/${order.id}`)
                setOrder(res.data)
            } catch { }
        }, 5000)
        return () => clearInterval(pollRef.current)
    }, [order?.id, order?.pickup_code, isPickupReady])

    // Vibrate when ready
    useEffect(() => {
        if (isPickupReady && !prevReadyRef.current) {
            prevReadyRef.current = true
            try { navigator.vibrate?.([200, 100, 200]) } catch { }
        }
    }, [isPickupReady])

    const cur = currencyHelpers(store)
    const taxRate = Number.isFinite(store?.tax_rate) && store.tax_rate >= 0 ? store.tax_rate : 10
    const taxIncluded = store?.tax_included !== false
    const orderTotal = order?.total_amount || 0
    // total_amount = 실제 청구액. 税込이면 포함 세액 역산, 税別이면 세금 미청구로 보고 분해/표시하지 않음.
    const tax = taxIncluded ? Math.round(orderTotal * taxRate / (100 + taxRate)) : 0
    const subtotal = orderTotal - tax

    return (
        <div className="relative min-h-screen bg-[#1c0d0d] text-[#f8f5f5] font-display overflow-x-hidden pb-32">
            {/* Dark Gradient Overlay */}
            <div className="fixed inset-0 bg-gradient-to-b from-transparent via-[#1c0d0d] to-[#1c0d0d] z-0"></div>

            {/* Header */}
            <header className="p-6 flex items-center justify-between relative z-10">
                <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <X size={20} />
                </button>
                <div className="text-center flex-1">
                    <h1 className="text-white text-md font-bold italic tracking-wide">Digital Receipt</h1>
                </div>
                <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <Share2 size={20} />
                </button>
            </header>

            <main className="px-6 relative z-10 max-w-md mx-auto">
                {/* Logo Section */}
                <div className="text-center mb-10 pt-4">
                    <div className="w-20 h-20 bg-[#c53030]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#c53030]/20">
                        <div className="w-16 h-16 bg-[#c53030] rounded-full flex items-center justify-center shadow-lg shadow-red-900/50">
                            <span className="material-symbols-outlined text-3xl text-white">local_florist</span>
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight mb-1">{store?.name || 'Camellia Boutique'}</h2>
                    <p className="text-slate-500 text-xs font-medium italic">Paris • London • New York</p>
                </div>

                {/* ── Takeout Pickup Card ─────────────────────────────── */}
                {isTakeout && order?.pickup_code && (
                    <div className={`rounded-3xl border p-7 text-center mb-8 ${
                        isPickupReady
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-amber-500/10 border-amber-500/30'
                    }`}>
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
                                🕐 ピックアップ予定：<span className="text-white font-bold">{order.pickup_time}</span>
                            </p>
                        )}
                    </div>
                )}

                {/* Order Meta */}
                <div className="bg-white/5 rounded-3xl p-6 border border-white/5 mb-8 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">Order ID</span>
                        <span className="text-white font-mono font-bold tracking-tight">#CM-{order.id}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-500">
                        <span className="font-bold uppercase tracking-widest">Date</span>
                        <span className="text-white">
                            {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">Payment</span>
                        <span className="text-white font-bold">Visa •••• 4242</span>
                    </div>
                </div>

                {/* Items List */}
                <div className="space-y-6 mb-10 px-2">
                    {order.items.map((item, idx) => (
                        <div key={idx} className="flex gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-[#c53030]/5 border border-white/5 overflow-hidden flex-shrink-0 shadow-lg">
                                <img src={item.menu?.image_url || 'https://via.placeholder.com/100'} alt={item.menu?.name_jp} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-md text-white tracking-tight">{item.menu?.name_ko || item.menu?.name_jp || `#${item.menu_item_id}`}</div>
                                    <div className="text-[10px] text-slate-500 font-bold tracking-wider">Qty: {item.quantity} • Red / OS</div>
                                </div>
                                <div className="font-bold text-md text-slate-300">{cur.fmt(item.unit_price * item.quantity)}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Summary */}
                <div className="bg-white/5 rounded-3xl p-8 border border-white/5 mb-8">
                    <div className="space-y-4 pb-6 border-b border-white/5">
                        <div className="flex justify-between text-sm text-slate-500 font-medium">
                            <span>Subtotal</span>
                            <span className="text-white">{cur.fmt(subtotal)}</span>
                        </div>
                        {taxIncluded && (
                            <div className="flex justify-between text-sm text-slate-500 font-medium">
                                <span>Tax ({taxRate}%)</span>
                                <span className="text-white">{cur.fmt(tax)}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-between items-center pt-6">
                        <span className="text-xl font-black uppercase tracking-[0.2em] text-white">Total</span>
                        <span className="text-2xl font-black text-[#c53030] tracking-tighter shadow-red-900/10">
                            {cur.fmt(orderTotal)}
                        </span>
                    </div>
                </div>

                {/* Loyalty / QR Section */}
                <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5 mb-8 text-center shadow-inner">
                    <div className="bg-white p-6 rounded-2xl inline-block mb-6 shadow-2xl relative">
                        <div className="absolute inset-0 bg-red-900/5 mix-blend-multiply rounded-2xl"></div>
                        <QrCode size={120} className="text-[#1c0d0d] relative z-10" strokeWidth={1.5} />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-widest px-6">
                        Show this code for returns or to earn points. Valid for 30 days.
                    </p>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-4 mb-20">
                    <button className="flex items-center justify-center gap-2 bg-[#c53030] hover:bg-[#b02a2a] text-white font-bold py-4 rounded-2xl shadow-xl shadow-red-900/40 transition-all active:scale-95">
                        <FileText size={18} />
                        <span>Save PDF</span>
                    </button>
                    <button className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl border border-white/10 transition-all active:scale-95">
                        <Mail size={18} />
                        <span>Email me</span>
                    </button>
                </div>
            </main>

            {/* Bottom Nav */}
            <div className="fixed bottom-0 left-0 right-0 z-[60] bg-[#1c0d0d]/90 backdrop-blur-xl border-t border-white/5">
                <div className="max-w-md mx-auto px-6 py-4 flex justify-between items-center text-slate-600">
                    <button onClick={() => navigate(`/${store?.id}/home`)} className="hover:text-white transition-colors"><Home size={22} /></button>
                    <button onClick={() => navigate(`/${store?.id}/menu`)} className="hover:text-white transition-colors"><Utensils size={22} /></button>
                    <button onClick={() => navigate(`/${store?.id}/orders`)} className="text-[#c53030] transition-colors"><Receipt size={22} /></button>
                    <button onClick={() => navigate(`/${store?.id}/profile`)} className="hover:text-white transition-colors"><User size={22} /></button>
                </div>
            </div>
        </div>
    )
}
