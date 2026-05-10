import { motion } from 'framer-motion'
import { PlusCircle, ShoppingBasket, ChevronRight } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'

export default function AjisaiThemeView({
    storeId,
    tableNumber,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    categories,
    menus,
    loading,
    t,
    cart,
    totalQuantity,
    totalAmount,
    onAddToCart,
    onCheckout,
    tabehoudaiMenuIds = new Set()
}) {
    const { getMenuName, getMenuDescription } = useLanguage()

    return (
        <div className="relative min-h-screen bg-[var(--background-light)] text-slate-900 font-display overflow-x-hidden pb-48">
            {/* Pattern Overlay */}
            <div className="fixed inset-0 hydrangea-bg pointer-events-none z-0"></div>

            <style>{`
                .glass-card {
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                }
                /* 카테고리 가로 스크롤 힌트 */
                .cat-scroll { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.15) transparent; }
                .cat-scroll::-webkit-scrollbar { height: 4px; }
                .cat-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
                
                /* 480px+ 가로 모드: 사이드바 레이아웃 */
                @media (min-width: 481px) and (max-height: 500px) {
                    .theme-layout { display: flex !important; flex-direction: row !important; }
                    .cat-sidebar {
                        position: sticky !important; top: 64px; 
                        width: 140px !important; min-width: 140px; height: calc(100vh - 64px);
                        overflow-y: auto; flex-direction: column !important;
                        padding: 12px 8px !important; gap: 6px !important;
                        border-right: 1px solid rgba(0,0,0,0.06);
                    }
                    .cat-sidebar button { font-size: 12px !important; padding: 8px 12px !important; white-space: nowrap; }
                    .theme-main { flex: 1 !important; max-width: none !important; }
                }
            `}</style>
            
            {/* Search Bar */}
            <div className="relative z-10 max-w-md mx-auto px-4 pt-4">
                <div className="relative group">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
                    <input 
                        className="w-full h-12 pl-12 pr-4 bg-white/60 border border-white/40 rounded-xl focus:ring-2 focus:ring-primary/40 text-sm placeholder:text-slate-400 transition-all shadow-sm" 
                        placeholder={t('search_menu') || "Search for sushi, ramen..."} 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Theme Layout: 세로=상단탭, 가로=사이드바 */}
            <div className="theme-layout relative z-10">
                {/* Category Tabs / Sidebar */}
                <div className="cat-sidebar sticky top-[64px] z-40 bg-[#e8f8fc]/90 backdrop-blur-md py-3">
                    <div className="max-w-md mx-auto px-4">
                        <div className="flex gap-3 overflow-x-auto cat-scroll pb-1">
                            <button
                                onClick={() => setActiveCategory('All')}
                                className={`flex-shrink-0 px-5 py-2 rounded-full text-sm font-bold shadow-md transition-all ${activeCategory === 'All' ? 'bg-primary text-white shadow-primary/20' : 'bg-white border border-primary/20 text-primary/70 hover:bg-primary/5'}`}
                            >
                                {t('all') || 'All'}
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`flex-shrink-0 px-5 py-2 rounded-full text-sm font-bold shadow-md transition-all ${activeCategory === cat ? 'bg-primary text-white shadow-primary/20' : 'bg-white border border-primary/20 text-primary/70 hover:bg-primary/5'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <main className="theme-main max-w-md mx-auto p-4 space-y-8">
                    {loading ? (
                        <div className="space-y-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-64 bg-primary/10 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-10">
                            {categories.filter(cat => activeCategory === 'All' || activeCategory === cat).map(cat => {
                                const catMenus = menus.filter(m => m.category === cat)
                                if (catMenus.length === 0) return null;
                                
                                return (
                                    <div key={cat} className="pt-2">
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="text-xl font-bold flex items-center gap-2">
                                                <span className="w-1.5 h-6 bg-primary rounded-full"></span>
                                                {cat} <span className="text-primary/70 font-normal text-base ml-1">Specials</span>
                                            </h2>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 gap-6">
                                            {catMenus.map((item, idx) => (
                                                <motion.div
                                                    key={item.id || `ajisai-${idx}`}
                                                    initial={{ opacity: 0, y: 15 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className={`group glass-card rounded-xl overflow-hidden shadow-lg shadow-primary/5 border border-white ${!item.is_available ? 'opacity-60 grayscale relative' : ''}`}
                                                >
                                                    {!item.is_available && (
                                                        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-[2px]">
                                                            <span className="bg-slate-800/90 text-white font-bold px-4 py-2 rounded-lg tracking-widest text-sm shadow-xl transform -rotate-12 outline outline-2 outline-white/20 uppercase">SOLD OUT</span>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                                                        <img 
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                                            src={item.image_url || 'https://via.placeholder.com/600x400'} 
                                                            alt={getMenuName(item)}
                                                        />
                                                        {tabehoudaiMenuIds?.has(item.id) && (
                                                            <div className="absolute top-3 left-3 z-10 bg-rose-500 text-white px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[12px]">restaurant</span>
                                                                <span className="text-[10px] font-black tracking-wider">食べ放題対象</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                                                            <p className="text-primary font-bold text-sm">¥{item.price.toLocaleString()}</p>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="p-4">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <h3 className="text-lg font-bold">{getMenuName(item)}</h3>
                                                                {item.name_jp && item.name_jp !== getMenuName(item) && (
                                                                    <p className="text-primary/70 text-sm mt-0.5">{item.name_jp}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <p className="text-slate-500 text-xs mb-4 leading-relaxed line-clamp-2">
                                                            {getMenuDescription(item) || "Experience the unique style of Ajisai."}
                                                        </p>
                                                        <button
                                                            onClick={(e) => item.is_available && onAddToCart(e, item)}
                                                            disabled={!item.is_available}
                                                            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-lg transition-all active:scale-95 shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <PlusCircle className="w-5 h-5" />
                                                            <span>{t('add_to_cart') || 'Add to Order'}</span>
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </main>
            </div>

            {/* Floating Order Bar */}
            {totalQuantity > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-20 pt-4 pointer-events-none">
                    <div className="max-w-md mx-auto bg-white/80 backdrop-blur-xl border border-primary/20 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 pointer-events-auto">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <ShoppingBasket className="text-primary w-8 h-8" />
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                                        {totalQuantity}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-primary/70 font-semibold uppercase tracking-widest">Total</p>
                                    <p className="text-xl font-bold text-slate-900 leading-tight">¥{totalAmount.toLocaleString()}</p>
                                </div>
                            </div>
                            <button
                                onClick={onCheckout}
                                className="bg-primary text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2 active:scale-95 hover:bg-primary/90 transition-all"
                            >
                                <span>{t('checkout') || 'Checkout'}</span>
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
