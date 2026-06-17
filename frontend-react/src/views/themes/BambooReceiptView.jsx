import { CheckCircle, Download, ShoppingBag, QrCode, Home, Utensils, Receipt, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { currencyHelpers } from '../../config/currency'

export default function BambooReceiptView({ store, order, onClose }) {
    const navigate = useNavigate()
    const cur = currencyHelpers(store)
    const taxRate = Number.isFinite(store?.tax_rate) && store.tax_rate >= 0 ? store.tax_rate : 10
    const taxIncluded = store?.tax_included !== false
    const orderTotal = order?.total_amount || 0
    // total_amount = 실제 청구액. 税込이면 포함 세액 역산, 税別이면 세금 미청구로 보고 표시하지 않음.
    const tax = taxIncluded ? Math.round(orderTotal * taxRate / (100 + taxRate)) : 0

    return (
        <div className="relative min-h-screen bg-[#14160d] text-[#e0e4d0] font-sans overflow-x-hidden pb-40">
            {/* Zen Dotted Pattern Background */}
            <div className="fixed inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#848d00 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }}></div>

            {/* Top Indicator */}
            <div className="pt-10 flex justify-center mb-8 relative z-10">
                <div className="w-16 h-1 bg-white/10 rounded-full"></div>
            </div>

            <main className="px-8 relative z-10 max-w-md mx-auto">
                {/* Success Status */}
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-[#848d00]/20 rounded-full flex items-center justify-center mx-auto mb-10 relative">
                        <div className="absolute inset-0 bg-[#848d00]/10 rounded-full animate-ping opacity-20"></div>
                        <div className="w-14 h-14 bg-[#848d00] rounded-full flex items-center justify-center text-[#14160d] shadow-lg shadow-black/40">
                            <CheckCircle size={32} strokeWidth={2.5} />
                        </div>
                    </div>

                    <p className="text-[#848d00] text-[10px] font-black uppercase tracking-[0.3em] mb-4">Payment Successful</p>
                    <h1 className="text-6xl font-extrabold tracking-tight mb-4 text-white">{cur.fmt(orderTotal)}</h1>
                    <p className="text-slate-500 text-sm font-medium">{store?.name || 'Bamboo Flower Boutique'} • Tokyo, JP</p>
                </div>

                {/* Items List */}
                <div className="space-y-8 mb-12 border-t border-b border-white/5 py-10 px-2 relative">
                    {/* Background Basket Icon */}
                    <div className="absolute top-1/2 right-0 -translate-y-1/2 opacity-[0.03] pointer-events-none">
                        <ShoppingBag size={120} className="text-[#848d00]" />
                    </div>

                    {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start">
                            <div>
                                <h3 className="text-white font-bold text-lg leading-tight mb-1">{item.menu?.name_ko || item.menu?.name_jp || `#${item.menu_item_id}`}</h3>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Qty: {item.quantity}</p>
                            </div>
                            <div className="text-white font-bold text-lg">{cur.fmt(item.unit_price * item.quantity)}</div>
                        </div>
                    ))}

                    {taxIncluded && (
                        <div className="flex justify-between items-center text-sm text-slate-500 font-bold pt-4 border-t border-dashed border-white/10">
                            <span className="uppercase tracking-widest">Tax ({taxRate}%)</span>
                            <span>{cur.fmt(tax)}</span>
                        </div>
                    )}
                </div>

                {/* QR Section */}
                <div className="text-center mb-12">
                    <div className="bg-[#f0c0a8]/20 p-2 rounded-2xl inline-block mb-6 shadow-inner border border-white/5">
                        <div className="bg-white p-6 rounded-xl shadow-2xl relative overflow-hidden group">
                            <div className="absolute inset-0 bg-[#f0c0a8]/10 mix-blend-multiply opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <QrCode size={120} className="text-[#14160d] relative z-10" strokeWidth={1.5} />
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">TXN-BF-{order.id}-2023</p>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-8 mb-12 px-4">
                    <div className="text-center">
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Date</p>
                        <p className="text-white font-bold text-sm">{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Time</p>
                        <p className="text-white font-bold text-sm">{new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                    </div>
                </div>

                {/* Bamboo Message */}
                <div className="bg-[#848d00]/10 border border-[#848d00]/20 rounded-full py-4 px-8 text-center mb-12">
                    <p className="text-[#848d00] text-[10px] font-bold flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm">eco</span>
                        Digital receipt: You just saved one bamboo sprout.
                    </p>
                </div>

                {/* Actions */}
                <div className="space-y-4 mb-20 px-2">
                    <button className="w-full bg-[#848d00] hover:bg-[#99a400] text-[#14160d] font-black py-5 rounded-2xl shadow-xl shadow-black/80 flex items-center justify-center gap-2 transition-all active:scale-95">
                        <Download size={20} strokeWidth={3} />
                        <span>Save to Gallery</span>
                    </button>
                    <button onClick={onClose} className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-5 rounded-3xl border border-white/10 transition-all active:scale-95">
                        <span>Close Receipt</span>
                    </button>
                </div>
            </main>

            {/* Bottom Nav */}
            <div className="fixed bottom-0 left-0 right-0 z-[60] bg-[#14160d]/90 backdrop-blur-xl border-t border-white/5">
                <div className="max-w-md mx-auto px-6 py-4 flex justify-between items-center text-slate-600">
                    <button onClick={() => navigate(`/${store?.id}/home`)} className="hover:text-white transition-colors"><Home size={22} /></button>
                    <button onClick={() => navigate(`/${store?.id}/menu`)} className="hover:text-white transition-colors"><Utensils size={22} /></button>
                    <button onClick={() => navigate(`/${store?.id}/orders`)} className="text-[#848d00] transition-colors"><Receipt size={22} /></button>
                    <button onClick={() => navigate(`/${store?.id}/profile`)} className="hover:text-white transition-colors"><User size={22} /></button>
                </div>
            </div>
        </div>
    )
}
