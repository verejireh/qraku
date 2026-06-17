import { ArrowLeft, Share2, FileText, Home, Utensils, Receipt, User, QrCode } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { currencyHelpers } from '../../config/currency'

export default function SakuraReceiptView({ store, order, onClose }) {
    const navigate = useNavigate()
    const cur = currencyHelpers(store)
    const taxRate = Number.isFinite(store?.tax_rate) && store.tax_rate >= 0 ? store.tax_rate : 10
    const taxIncluded = store?.tax_included !== false
    const orderTotal = order?.total_amount || 0
    // total_amount = 실제 청구액. 税込이면 포함 세액 역산, 税別이면 세금 미청구로 보고 분해/표시하지 않음.
    const tax = taxIncluded ? Math.round(orderTotal * taxRate / (100 + taxRate)) : 0
    const subtotal = orderTotal - tax

    return (
        <div className="relative min-h-screen bg-[#f8f5f6] text-[#2d1525] font-display overflow-x-hidden pb-32">
            {/* Pattern Background */}
            <div className="fixed inset-0 opacity-[0.05] pointer-events-none sakura-bg"></div>

            {/* Header */}
            <header className="p-6 flex items-center justify-between relative z-10">
                <button onClick={onClose} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex gap-3">
                    <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <span className="material-symbols-outlined text-xl">language</span>
                    </button>
                    <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <span className="material-symbols-outlined text-xl">auto_awesome</span>
                    </button>
                </div>
            </header>

            <main className="px-6 relative z-10 max-w-md mx-auto">
                <div
                    className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-xl shadow-pink-100/50 border border-white/40 mb-8"
                >
                    {/* Logo & Store Info */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-[#ffb8c6]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <div className="w-12 h-12 bg-[#ffb8c6] rounded-full flex items-center justify-center text-white shadow-inner">
                                <span className="material-symbols-outlined text-2xl">local_florist</span>
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight mb-1">{store?.name || 'Sakura Café'}</h1>
                        <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#ffb8c6]">
                            Transaction #{order.id}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                            {new Date(order.created_at).toLocaleString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                            })}
                        </div>
                    </div>

                    {/* Items List */}
                    <div className="space-y-6 mb-8 pt-4 border-t border-dashed border-pink-100">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex gap-4">
                                <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-sm flex-shrink-0">
                                    <img
                                        src={item.menu?.image_url || 'https://via.placeholder.com/100'}
                                        alt={item.menu?.name_jp}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="flex-1 flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-sm">{item.menu?.name_en || item.menu?.name_jp || `#${item.menu_item_id}`}</div>
                                        <div className="text-[10px] text-slate-400">{item.menu?.name_jp}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-sm">{cur.fmt(item.unit_price)}</div>
                                        <div className="text-[10px] text-slate-400 font-bold">Qty: {item.quantity}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary */}
                    <div className="space-y-3 pt-6 border-t border-dashed border-pink-100">
                        <div className="flex justify-between items-center text-sm text-slate-500">
                            <span>Subtotal</span>
                            <span>{cur.fmt(subtotal)}</span>
                        </div>
                        {taxIncluded && (
                            <div className="flex justify-between items-center text-sm text-slate-500">
                                <span>Tax ({taxRate}%)</span>
                                <span>{cur.fmt(tax)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-3">
                            <span className="text-lg font-bold">Total</span>
                            <span className="text-2xl font-bold text-[#ffb8c6]">
                                {cur.fmt(orderTotal)}
                            </span>
                        </div>
                    </div>

                    {/* QR Code Section */}
                    <div className="mt-12 bg-[#ffb8c6]/5 rounded-[2rem] p-8 text-center border border-[#ffb8c6]/10">
                        <div className="bg-white p-6 rounded-2xl inline-block shadow-lg shadow-pink-100 shadow-inner mb-6 border border-white">
                            <QrCode size={120} className="text-slate-800" strokeWidth={1.5} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-widest px-8">
                            Scan at counter to complete your order.
                        </p>
                        <p className="text-[10px] font-bold text-[#ffb8c6] mt-2">
                            Thank you for visiting {store?.name || 'Sakura Café'}!
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-4 mb-12">
                    <button className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-bold py-4 rounded-2xl shadow-sm transition-all active:scale-95 border border-white/60">
                        <Share2 size={18} />
                        <span>Share</span>
                    </button>
                    <button className="flex items-center justify-center gap-2 bg-[#ffb8c6] hover:bg-[#ffb8c6]/90 text-white font-bold py-4 rounded-2xl shadow-lg shadow-pink-200 transition-all active:scale-95">
                        <FileText size={18} />
                        <span>Save PDF</span>
                    </button>
                </div>
            </main>

            {/* Bottom Nav Placeholder */}
            <div className="fixed bottom-0 left-0 right-0 z-[60] bg-white/70 backdrop-blur-md border-t border-pink-50">
                <div className="max-w-md mx-auto px-6 py-4 flex justify-between items-center">
                    <button onClick={() => navigate(`/${store?.id}/home`)} className="text-pink-300 transition-colors hover:text-[#ffb8c6]"><Home size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/menu`)} className="text-pink-300 transition-colors hover:text-[#ffb8c6]"><Utensils size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/orders`)} className="text-[#ffb8c6] transition-colors"><Receipt size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/profile`)} className="text-pink-300 transition-colors hover:text-[#ffb8c6]"><User size={24} /></button>
                </div>
            </div>
        </div>
    )
}
