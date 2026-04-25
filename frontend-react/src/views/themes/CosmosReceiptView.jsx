import { Download, Share2, X, Sparkles, Home, Utensils, Receipt, User } from 'lucide-react'

import { useSession } from '../../context/SessionContext'

export default function CosmosReceiptView({ store, order, onClose }) {
    const navigate = useNavigate()

    return (
        <div className="relative min-h-screen bg-[#f3f4f6] text-[#1f2937] font-display overflow-x-hidden pb-40">
            {/* Top Pink Header */}
            <div className="h-48 bg-[#d83473] relative overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[100%] bg-white rounded-full blur-[80px]"></div>
                    <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[100%] bg-[#ff4d94] rounded-full blur-[60px]"></div>
                </div>
                <div className="relative z-10 flex flex-col items-center justify-center h-full text-white pt-8">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                        <Sparkles size={28} className="text-white fill-white" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight mb-1">{store?.name || 'Cosmos Store'}</h1>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Transaction Confirmed</p>
                </div>
                {/* Wave effect at bottom of header */}
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-[#f3f4f6]" style={{ borderRadius: '60px 60px 0 0' }}></div>
            </div>

            <main className="px-6 relative z-10 max-w-md mx-auto -mt-10">
                <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-pink-100 p-8 pt-10 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-[#d83473]/10"></div>

                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Total Amount Paid</p>
                    <h2 className="text-4xl font-black text-[#1f2937] mb-2 tracking-tight">¥{(order.total_amount + Math.round(order.total_amount * 0.08)).toLocaleString()}</h2>
                    <p className="text-[10px] text-slate-400 font-bold mb-10">
                        {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </p>

                    <div className="space-y-6 text-left mb-10">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-sm text-slate-800">{item.menu?.name_ko || item.menu?.name_jp || item.menu_id}</div>
                                    <div className="text-[10px] text-slate-400 font-bold tracking-tight">Qty: {item.quantity}</div>
                                </div>
                                <div className="font-bold text-sm text-slate-800">¥{(item.menu?.price * item.quantity).toLocaleString()}</div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-6 border-t border-dashed border-pink-100 space-y-3 mb-10">
                        <div className="flex justify-between text-xs text-slate-400 font-bold">
                            <span>Subtotal</span>
                            <span>¥{order.total_amount?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-400 font-bold">
                            <span>Tax (8%)</span>
                            <span>¥{Math.round(order.total_amount * 0.08).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center pt-4 text-[10px] text-slate-800 font-black tracking-widest uppercase">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 bg-[#d83473] rounded-sm"></div>
                                Cosmos Card ****1234
                            </div>
                        </div>
                    </div>

                    {/* Scan for loyalty */}
                    <div className="bg-pink-50/50 rounded-3xl p-6 border border-pink-100">
                        <p className="text-[#d83473] text-[10px] font-black uppercase tracking-[0.2em] mb-4">Scan for Loyalty Points</p>
                        <div className="bg-white p-4 rounded-2xl shadow-xl shadow-pink-100 inline-block mb-4 overflow-hidden border border-pink-50">
                            <img src="https://via.placeholder.com/150" alt="Mock QR" className="w-32 h-32 object-cover rounded-lg mix-blend-multiply opacity-80" />
                        </div>
                        <p className="text-[8px] text-slate-400 font-bold leading-relaxed px-4">
                            Present this code at any Cosmos partner store to earn {Math.round(order.total_amount / 10)} Star Points.
                        </p>
                    </div>
                </div>

                {/* Bottom Nav */}
                <div className="mt-8 bg-white/70 backdrop-blur-md rounded-2xl flex items-center justify-around py-2 border border-pink-50">
                    <button onClick={() => navigate(`/${store?.id}/home`)} className="p-2 text-rose-300 transition-colors hover:text-[#ff7eb3]"><Home size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/menu`)} className="p-2 text-rose-300 transition-colors hover:text-[#ff7eb3]"><Utensils size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/orders`)} className="p-2 text-[#ff7eb3] transition-colors"><Receipt size={24} /></button>
                    <button onClick={() => navigate(`/${store?.id}/profile`)} className="p-2 text-rose-300 transition-colors hover:text-[#ff7eb3]"><User size={24} /></button>
                </div>

                {/* Actions */}
                <div className="mt-4 space-y-4 px-2">
                    <button className="w-full bg-[#d83473] hover:bg-[#c02a63] text-white font-bold py-4 rounded-full shadow-lg shadow-pink-200 flex items-center justify-center gap-2 transition-all active:scale-95">
                        <Download size={18} />
                        <span>Download Receipt</span>
                    </button>
                    <div className="grid grid-cols-2 gap-4">
                        <button className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-600 font-bold py-4 rounded-full shadow-sm transition-all border border-pink-50 active:scale-95">
                            <Share2 size={18} />
                            <span>Share</span>
                        </button>
                        <button onClick={onClose} className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-600 font-bold py-4 rounded-full shadow-sm transition-all border border-pink-50 active:scale-95">
                            <X size={18} />
                            <span>Close</span>
                        </button>
                    </div>
                </div>
            </main>

            {/* Decoration Pattern */}
            <div className="fixed bottom-0 left-0 right-0 h-10 flex justify-center items-center gap-2 pb-2">
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-slate-300"></div>
                ))}
            </div>
        </div>
    )
}
