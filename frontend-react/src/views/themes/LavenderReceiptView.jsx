import { Share2, ArrowLeft, Home, Utensils, Receipt, User, QrCode } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { currencyHelpers } from '../../config/currency'

export default function LavenderReceiptView({
    store,
    order,
    onClose
}) {
    const navigate = useNavigate()
    if (!order) return null;
    const cur = currencyHelpers(store)
    const taxRate = Number.isFinite(store?.tax_rate) && store.tax_rate >= 0 ? store.tax_rate : 10
    const taxIncluded = store?.tax_included !== false
    const orderTotal = order?.total_amount || 0
    // total_amount = 실제 청구액. 税込이면 포함 세액 역산, 税別이면 세금 미청구로 보고 분해/표시하지 않음.
    const tax = taxIncluded ? Math.round(orderTotal * taxRate / (100 + taxRate)) : 0
    const subtotal = orderTotal - tax

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden bg-[#0a0710] font-display">
            {/* Background Decorative Element */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#9c7aff]/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#9c7aff]/5 blur-[100px] rounded-full"></div>
            </div>

            <div className="relative w-full max-w-md mx-auto z-10 flex flex-col h-full max-h-[95vh]">
                {/* Header Section */}
                <div className="flex items-center justify-between mb-8 px-2 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/10 overflow-hidden">
                            <img src={store?.logo_url || 'https://via.placeholder.com/40'} alt="Logo" className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-sm tracking-tight">{store?.name || 'Lavender Cuisine'}</h2>
                            <p className="text-slate-500 text-[10px]">Welcome back, Guest</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-white/5 px-2 py-1 rounded-lg border border-white/10 text-[10px] text-white/60 font-medium">JA / EN</div>
                    </div>
                </div>

                {/* Main Receipt Card */}
                <div className="bg-[#140f23] rounded-[2rem] border border-white/5 flex flex-col flex-1 overflow-hidden shadow-2xl">
                    <div className="p-8 pb-4 border-b border-white/5 shrink-0">
                        <div className="flex justify-between items-center mb-1">
                            <h1 className="text-white text-2xl font-bold tracking-tight">Order #{order.id}</h1>
                            <div className="bg-[#10b981]/10 text-[#10b981] text-[10px] font-bold px-3 py-1 rounded-full border border-[#10b981]/20 tracking-widest uppercase">
                                PAID
                            </div>
                        </div>
                        <p className="text-slate-500 text-xs">
                            {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>

                    <div className="px-8 py-6 space-y-6 flex-1 overflow-y-auto no-scrollbar">
                        <div>
                            <h3 className="text-[#9c7aff] text-[10px] font-bold uppercase tracking-widest mb-4">Items Ordered</h3>
                            <div className="space-y-4">
                                {order.items?.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[#9c7aff] font-bold text-sm">{item.quantity}×</span>
                                            <span className="text-white font-medium text-sm">{item.menu?.name_ko || item.menu?.name_jp || `#${item.menu_item_id}`}</span>
                                        </div>
                                        <span className="text-slate-400 text-sm">{cur.fmt(item.unit_price * item.quantity)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-6 border-t border-white/5 space-y-3">
                            <div className="flex justify-between text-slate-500 text-sm">
                                <span>Subtotal</span>
                                <span>{cur.fmt(subtotal)}</span>
                            </div>
                            {taxIncluded && (
                                <div className="flex justify-between text-slate-500 text-sm">
                                    <span>Tax ({taxRate}%)</span>
                                    <span>{cur.fmt(tax)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-white font-bold text-lg">Total Paid</span>
                                <span className="text-2xl font-bold text-[#9c7aff]">
                                    {cur.fmt(orderTotal)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* QR Section */}
                    <div className="p-8 bg-[#1a1435] border-t border-white/5 shrink-0">
                        <div className="bg-[#120d26] rounded-2xl p-6 mb-6 flex flex-col items-center border border-white/5 relative overflow-hidden">
                            <div className="absolute inset-0 opacity-20">
                                <img src="https://via.placeholder.com/400x200" alt="Background" className="w-full h-full object-cover blur-md" />
                            </div>
                            <div className="bg-white p-4 rounded-xl relative z-10 shadow-xl mb-4">
                                <QrCode size={80} className="text-[#140f23]" strokeWidth={1.5} />
                            </div>
                            <p className="text-white font-bold text-sm mb-1 relative z-10">Ready for Counter Scan</p>
                            <p className="text-slate-500 text-[10px] text-center px-4 relative z-10">Show this to the server to finalize your visit</p>
                        </div>

                        <button className="w-full bg-[#9c7aff] hover:bg-[#8b6ae5] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#9c7aff]/20 transition-all active:scale-95 transition-all">
                            <Share2 size={18} />
                            <span>Share Receipt</span>
                        </button>
                    </div>
                </div>

                <div className="mt-4 text-center px-8 shrink-0">
                    <p className="text-slate-600 text-[10px] leading-relaxed uppercase tracking-widest italic">
                        Thank you for dining with {store?.name || 'Lavender Cuisine'}.<br />
                        123 Violet Lane, Purple District
                    </p>
                </div>

                {/* Bottom Navigation */}
                <div className="mt-4 bg-[#140f23]/80 backdrop-blur-xl border-t border-white/5 rounded-2xl flex items-center justify-around py-2 shrink-0 mb-4">
                    <button onClick={() => navigate(`/${store?.id}/home`)} className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#9c7aff]">
                        <Home size={20} />
                        <span className="text-[8px] font-bold uppercase tracking-tighter">Home</span>
                    </button>
                    <button onClick={() => navigate(`/${store?.id}/menu`)} className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#9c7aff]">
                        <Utensils size={20} />
                        <span className="text-[8px] font-bold uppercase tracking-tighter">Menu</span>
                    </button>
                    <button onClick={() => navigate(`/${store?.id}/orders`)} className="flex flex-col items-center gap-1 text-[#9c7aff]">
                        <Receipt size={20} />
                        <span className="text-[8px] font-bold uppercase tracking-tighter">Orders</span>
                    </button>
                    <button onClick={() => navigate(`/${store?.id}/profile`)} className="flex flex-col items-center gap-1 text-slate-500 hover:text-[#9c7aff]">
                        <User size={20} />
                        <span className="text-[8px] font-bold uppercase tracking-tighter">Profile</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
