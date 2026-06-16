import { ArrowLeft, Download, Mail, Home, Utensils, Receipt, User, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { currencyHelpers } from '../../config/currency'

export default function AjisaiReceiptView({ store, order, onClose }) {
    const navigate = useNavigate()
    const cur = currencyHelpers(store)
    const taxRate = Number.isFinite(store?.tax_rate) && store.tax_rate >= 0 ? store.tax_rate : 10
    const taxIncluded = store?.tax_included !== false
    const orderTotal = order?.total_amount || 0
    // total_amount = 실제 청구액. 税込이면 포함 세액 역산, 税別이면 세금 미청구로 보고 분해/표시하지 않음.
    const tax = taxIncluded ? Math.round(orderTotal * taxRate / (100 + taxRate)) : 0
    const subtotal = orderTotal - tax

    return (
        <div className="relative min-h-screen bg-[#f1f9fb] text-[#2c3e50] font-display overflow-x-hidden pb-32">
            {/* Background Pattern Placeholder */}
            <div className="fixed inset-0 opacity-[0.03] pointer-events-none hydrangea-bg"></div>

            {/* Header */}
            <header className="p-6 flex items-center justify-between relative z-10">
                <button onClick={onClose} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <ArrowLeft size={20} className="text-[#40c4e4]" />
                </button>
                <div className="text-center flex-1">
                    <h1 className="text-slate-800 font-bold text-sm tracking-tight">Digital Receipt</h1>
                </div>
                <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <span className="material-symbols-outlined text-xl text-[#40c4e4]">more_horiz</span>
                </button>
            </header>

            <main className="px-6 relative z-10 max-w-md mx-auto">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <div className="relative inline-block">
                        <div className="w-24 h-24 bg-[#40c4e4]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#40c4e4]/5">
                            <div className="w-20 h-20 bg-[#40c4e4]/20 rounded-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-4xl text-[#40c4e4]">local_florist</span>
                            </div>
                        </div>
                        <div className="absolute top-1 right-1 w-6 h-6 bg-[#40c4e4] rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                            <CheckCircle size={14} className="text-white fill-white" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-extrabold tracking-tight mb-1">{store?.name || 'The Hydrangea Boutique'}</h2>
                    <p className="text-slate-400 text-[10px] font-medium mb-6">123 Pastel Lane, Blue City, BC 90210</p>

                    <div className="inline-block bg-white/60 backdrop-blur-md px-6 py-2 rounded-full border border-[#40c4e4]/20 text-[#40c4e4] text-[10px] font-bold tracking-widest uppercase">
                        Order #HYD-{order.id}
                    </div>
                </div>

                {/* Details Card */}
                <div
                    className="bg-white/80 backdrop-blur-3xl rounded-[2.5rem] p-8 shadow-xl shadow-cyan-100/50 border border-white/60 mb-8"
                >
                    <div className="space-y-4 mb-8">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-bold uppercase tracking-wider">Date & Time</span>
                            <span className="text-slate-700 font-bold">
                                {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>
                        </div>
                        <div className="flex justify-between items-start text-xs">
                            <span className="text-slate-400 font-bold uppercase tracking-wider">Payment Method</span>
                            <div className="text-right">
                                <div className="flex items-center gap-1 justify-end font-bold text-slate-700">
                                    <span className="material-symbols-outlined text-base">contactless</span>
                                    Apple Pay •••• 4242
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-8 border-t border-dashed border-cyan-100 space-y-6 mb-8">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex gap-4 items-center">
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 overflow-hidden flex-shrink-0 border border-slate-100 shadow-inner">
                                    <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${item.menu?.image_url || 'https://via.placeholder.com/80'})` }}></div>
                                </div>
                                <div className="flex-1 flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-sm text-slate-800">{item.menu?.name_ko || item.menu?.name_jp || `#${item.menu_item_id}`}</div>
                                        <div className="text-[10px] text-slate-400 font-bold">Quantity: {item.quantity} • Fresh Cut</div>
                                    </div>
                                    <div className="font-bold text-sm text-slate-800">{cur.fmt(item.unit_price * item.quantity)}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-6 border-t border-dashed border-cyan-100 space-y-3">
                        <div className="flex justify-between text-sm text-slate-500 font-medium">
                            <span>Subtotal</span>
                            <span>{cur.fmt(subtotal)}</span>
                        </div>
                        {taxIncluded && (
                            <div className="flex justify-between text-sm text-slate-500 font-medium">
                                <span>Tax ({taxRate}%)</span>
                                <span>{cur.fmt(tax)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-3">
                            <span className="text-lg font-bold text-slate-800">Total Paid</span>
                            <span className="text-2xl font-extrabold text-[#40c4e4]">
                                {cur.fmt(orderTotal)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-4 mb-12">
                    <button className="w-full bg-[#40c4e4] hover:bg-[#39afd4] text-white font-bold py-4 rounded-2xl shadow-lg shadow-cyan-200 flex items-center justify-center gap-2 transition-all active:scale-95">
                        <Download size={18} />
                        Save to Device (PDF)
                    </button>
                    <button className="w-full bg-[#40c4e4]/10 hover:bg-[#40c4e4]/20 text-[#40c4e4] font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95">
                        <Mail size={18} />
                        Email Receipt
                    </button>
                </div>
            </main>

            {/* Bottom Nav */}
            <div className="fixed bottom-0 left-0 right-0 z-[60] bg-white/70 backdrop-blur-xl border-t border-cyan-50">
                <div className="max-w-md mx-auto px-6 py-4 flex justify-between items-center">
                    <button onClick={() => navigate(`/${store?.id}/home`)} className="text-blue-300 transition-colors hover:text-[#7b98ff]"><Home size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/menu`)} className="text-blue-300 transition-colors hover:text-[#7b98ff]"><Utensils size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/orders`)} className="text-[#7b98ff] transition-colors"><Receipt size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/profile`)} className="text-blue-300 transition-colors hover:text-[#7b98ff]"><User size={24} /></button>
                </div>
            </div>
        </div>
    )
}
