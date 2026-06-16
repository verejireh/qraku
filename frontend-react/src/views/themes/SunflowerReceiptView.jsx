import { motion } from 'framer-motion'
import { Flower, CheckCircle, Download, Home, Utensils, Receipt, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { currencyHelpers } from '../../config/currency'

export default function SunflowerReceiptView({
    store,
    order,
    onClose,
}) {
    const navigate = useNavigate()
    if (!order) return null;
    const cur = currencyHelpers(store)
    // total_amount = 실제 청구액. Sunflower 영수증은 세금 분해 없이 청구 총액만 표시.
    const orderTotal = order?.total_amount || 0

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden bg-[#f8f8f5] font-display">
            {/* Background Decorative Petals */}
            <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-[#ffd900] rounded-full blur-3xl"></div>
                <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-[#ffd900] rounded-full blur-3xl"></div>
            </div>

            <div className="relative w-full max-w-md mx-auto z-10 flex flex-col h-full max-h-[90vh]">
                {/* Top Bar Navigation */}
                <div className="flex items-center justify-between mb-6 px-2 shrink-0">
                    <div className="w-10 h-10"></div>
                    <div className="bg-[#ffd900]/20 px-4 py-1.5 rounded-full flex items-center gap-2">
                        <CheckCircle className="text-[#ffd900] w-4 h-4 fill-[#ffd900]" />
                        <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">Confirmed</span>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-sm hover:bg-[#ffd900] transition-colors">
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Floating Receipt Card */}
                <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden relative border border-slate-100 flex flex-col flex-1">
                    {/* Receipt Header */}
                    <div className="h-32 bg-[#ffd900]/10 relative flex items-center justify-center overflow-hidden shrink-0">
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            <div className="w-48 h-48 border-4 border-dashed border-[#ffd900] rounded-full animate-[spin_10s_linear_infinite]"></div>
                        </div>
                        <div className="z-10 text-center">
                            <div className="w-16 h-16 bg-[#ffd900] rounded-full flex items-center justify-center mx-auto mb-2 shadow-lg">
                                <Flower className="text-white w-8 h-8 fill-white" />
                            </div>
                            <h2 className="text-xl font-extrabold text-slate-900">{store?.name || 'Sunflower Cafe'}</h2>
                        </div>
                    </div>

                    <div className="p-6 pt-8 text-center border-b border-dashed border-slate-200 shrink-0">
                        <p className="text-slate-500 text-sm font-medium">Total Amount Paid</p>
                        <h1 className="text-5xl font-extrabold text-slate-900 mt-1 mb-4">{cur.fmt(orderTotal)}</h1>
                        <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">
                            {new Date(order.created_at).toLocaleDateString('ja-JP')} • {new Date(order.created_at).toLocaleTimeString('ja-JP')}
                        </p>
                    </div>

                    {/* Itemized List */}
                    <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        {order.items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 text-xs font-bold">
                                        {(idx + 1).toString().padStart(2, '0')}
                                    </span>
                                    <span className="font-semibold text-slate-700">{item.menu?.name_ko || item.menu?.name_jp || `#${item.menu_item_id}`} (x{item.quantity})</span>
                                </div>
                                <span className="font-bold text-slate-900">{cur.fmt(item.unit_price * item.quantity)}</span>
                            </div>
                        ))}
                    </div>

                    {/* QR Code Section */}
                    <div className="bg-[#ffd900]/5 p-6 flex flex-col items-center gap-4 shrink-0">
                        <div className="p-3 bg-white rounded-xl shadow-inner border-2 border-[#ffd900]/30">
                            <div className="w-32 h-32 bg-slate-900 rounded-lg flex items-center justify-center relative overflow-hidden">
                                <div className="grid grid-cols-4 gap-1 opacity-80 p-2">
                                    {[...Array(16)].map((_, i) => (
                                        <div key={i} className={`w-4 h-4 rounded-sm ${i % 3 === 0 ? 'bg-[#ffd900]' : 'bg-white'}`}></div>
                                    ))}
                                </div>
                                <div className="absolute inset-0 border-4 border-slate-900 rounded-lg"></div>
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Transaction ID</p>
                            <p className="text-sm font-mono text-slate-700">TXN-{order.id.toString().padStart(6, '0')}-HIMW</p>
                        </div>
                    </div>

                    {/* Zig Zag Edge */}
                    <div className="h-4 w-full bg-white relative shrink-0">
                        <div className="absolute bottom-0 w-full h-3 opacity-20" style={{
                            backgroundImage: 'linear-gradient(135deg, transparent 25%, #ffd900 25%), linear-gradient(225deg, transparent 25%, #ffd900 25%)',
                            backgroundPosition: 'bottom left',
                            backgroundSize: '12px 12px',
                            backgroundRepeat: 'repeat-x'
                        }}></div>
                    </div>
                </div>

                {/* Bottom Nav */}
                <div className="mt-4 bg-white/70 backdrop-blur-md rounded-2xl flex items-center justify-around py-2 border border-slate-100 shrink-0">
                    <button onClick={() => navigate(`/${store?.id}/home`)} className="p-2 text-slate-400 hover:text-[#ffd900]"><Home size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/menu`)} className="p-2 text-slate-400 hover:text-[#ffd900]"><Utensils size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/orders`)} className="p-2 text-[#ffd900]"><Receipt size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/profile`)} className="p-2 text-slate-400 hover:text-[#ffd900]"><User size={24} /></button>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 flex flex-col gap-3 pb-8 shrink-0">
                    <button className="w-full bg-[#ffd900] hover:bg-[#ffd900]/90 text-slate-900 font-bold py-4 rounded-full flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95">
                        <Download className="w-5 h-5" />
                        Save Digital Receipt
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full bg-white text-slate-600 font-bold py-4 rounded-full border border-slate-200 transition-all hover:bg-slate-50"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
