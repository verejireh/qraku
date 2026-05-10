import { motion } from 'framer-motion'
import { Plus, ShoppingCart, ArrowRight } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'

export default function SakuraThemeView({
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
        <div className="relative min-h-screen text-slate-900 font-display overflow-x-hidden">
            <style>{`
                .sakura-bg {
                    background-color: var(--background, #f8f5f6);
                    background-image: radial-gradient(var(--primary, #fb7185) 0.5px, transparent 0.5px), radial-gradient(var(--primary, #fb7185) 0.5px, var(--background, #f8f5f6) 0.5px);
                    background-size: 20px 20px;
                    background-position: 0 0, 10px 10px;
                    opacity: 0.4;
                }
                .glass {
                    background: rgba(255, 255, 255, 0.6);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                }
            `}</style>
            
            {/* Sakura Pattern Overlay */}
            <div className="fixed inset-0 sakura-bg pointer-events-none z-0"></div>

            <main className="relative z-10 pb-40">
                {/* Search Bar */}
                <div className="px-4 py-3 relative z-20">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
                        <input 
                            className="w-full bg-white/50 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 placeholder:text-slate-400 shadow-sm" 
                            placeholder={t('search_menu') || "Search for sushi, ramen..."} 
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Category Filter */}
                <div className="flex gap-3 p-4 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setActiveCategory('All')}
                        className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-5 transition-all ${activeCategory === 'All' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'glass text-slate-700'}`}
                    >
                        <span className="material-symbols-outlined text-lg">grid_view</span>
                        <span className="text-sm font-medium">{t('all') || 'All'}</span>
                    </button>
                    {categories.filter(c => c !== 'All').map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-5 transition-all ${activeCategory === cat ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'glass text-slate-700'}`}
                        >
                            {cat === 'Sushi' ? <span className="material-symbols-outlined text-lg">set_meal</span> :
                             cat === 'Ramen' ? <span className="material-symbols-outlined text-lg">ramen_dining</span> :
                             cat === 'Sake' ? <span className="material-symbols-outlined text-lg">wine_bar</span> :
                             <span className="material-symbols-outlined text-lg">restaurant</span>}
                            <span className="text-sm font-medium">{cat}</span>
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="px-4 space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 bg-primary/5 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <section className="px-4 py-2 space-y-8">
                        {categories.filter(cat => cat !== 'All' && (activeCategory === 'All' || activeCategory === cat)).map(cat => {
                            const catMenus = menus.filter(m => m.category === cat)
                            if (catMenus.length === 0) return null;
                            return (
                                <div key={cat} className="space-y-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xl font-bold border-l-4 border-primary pl-3 text-slate-800">{cat} Specials</h2>
                                    </div>
                                    <div className="grid gap-4">
                                        {catMenus.map((item, idx) => (
                                            <motion.div
                                                key={item.id || `sakura-${idx}`}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className={`glass rounded-xl p-4 flex gap-4 shadow-sm ${!item.is_available ? 'opacity-60 grayscale relative' : ''}`}
                                            >
                                                {!item.is_available && (
                                                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[2px]">
                                                        <span className="bg-slate-800/90 text-white font-bold px-4 py-2 rounded-lg tracking-widest text-sm shadow-xl transform -rotate-12 border border-white/20 uppercase">SOLD OUT</span>
                                                    </div>
                                                )}
                                                <div className="flex-1 flex flex-col justify-between">
                                                    <div>
                                                        {tabehoudaiMenuIds?.has(item.id) && (
                                                            <span className="inline-flex items-center gap-1 bg-rose-500 text-white px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider mb-1">
                                                                <span className="material-symbols-outlined text-[11px]">restaurant</span>
                                                                食べ放題対象
                                                            </span>
                                                        )}
                                                        <p className="text-primary font-bold text-lg">¥{item.price.toLocaleString()}</p>
                                                        <h3 className="text-base font-bold text-slate-800 mt-1">{getMenuName(item)}</h3>
                                                        {item.name_jp && item.name_jp !== getMenuName(item) && (
                                                            <p className="text-xs text-slate-500 font-medium mb-1 mt-0.5">{item.name_jp}</p>
                                                        )}
                                                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                                            {getMenuDescription(item) || "Fresh and seasonal specialty."}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={(e) => item.is_available && onAddToCart(e, item)}
                                                        disabled={!item.is_available}
                                                        className="mt-4 bg-primary hover:bg-primary/90 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-1 transition-all w-fit disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">add</span>
                                                        {t('add_to_cart') || 'Add to Order'}
                                                    </button>
                                                </div>
                                                <div
                                                    className="w-32 h-32 rounded-lg bg-cover bg-center flex-shrink-0"
                                                    style={{ backgroundImage: `url(${item.image_url || 'https://via.placeholder.com/150'})` }}
                                                ></div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </section>
                )}
            </main>

            {/* Floating Checkout Bar */}
            {totalQuantity > 0 && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-[60]">
                    <div className="glass shadow-2xl rounded-full p-2 flex items-center justify-between gap-4 border-2 border-primary/20">
                        <div className="flex items-center gap-3 pl-4">
                            <div className="relative">
                                <span className="material-symbols-outlined text-primary text-2xl">shopping_cart</span>
                                <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                    {totalQuantity}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Total Order</p>
                                <p className="text-base font-bold text-slate-900 leading-tight">¥{totalAmount.toLocaleString()}</p>
                            </div>
                        </div>
                        <button
                            onClick={onCheckout}
                            className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-full font-bold text-sm shadow-lg shadow-primary/30 flex items-center gap-2 transition-all"
                        >
                            {t('checkout') || 'Checkout'}
                            <span className="material-symbols-outlined text-sm">arrow_forward_ios</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
