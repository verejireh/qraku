import { motion } from 'framer-motion'
import { Plus, ShoppingBag, ArrowRight } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { useCurrency } from '../../context/CurrencyContext'

export default function TsubakiThemeView({
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
    onCheckout
}) {
    const { getMenuName, getMenuDescription } = useLanguage()
    const { fmt } = useCurrency()

    return (
        <div className="relative min-h-screen text-slate-100 overflow-x-hidden font-sans pb-40">
            <style>{`
                .camellia-pattern {
                    background-image: radial-gradient(circle at 2px 2px, rgba(194, 30, 47, 0.05) 1px, transparent 0);
                    background-size: 40px 40px;
                }
                .camellia-overlay {
                    background: linear-gradient(rgba(32, 18, 19, 0.97), rgba(32, 18, 19, 0.97)),
                                url('https://images.unsplash.com/photo-1595853035070-59a39fe84de3?auto=format&fit=crop&q=80&w=1000');
                    background-size: cover;
                    background-attachment: fixed;
                }
                body {
                    /* Ensure font loads */
                    font-family: 'Noto Sans', sans-serif;
                }
                .font-display {
                    font-family: 'Noto Serif', serif;
                }
            `}</style>

            {/* Background Image / Overlay */}
            <div className="fixed inset-0 camellia-overlay z-0 pointer-events-none"></div>

            {/* Huge Floating Camellia SVG Decorative Elements */}
            <div className="fixed top-20 -right-20 opacity-5 pointer-events-none z-0">
                <svg height="400" viewBox="0 0 200 200" width="400" xmlns="http://www.w3.org/2000/svg">
                    <path d="M100 0 C120 40 180 40 200 100 C180 160 120 160 100 200 C80 160 20 160 0 100 C20 40 80 40 100 0" fill="var(--primary, #c21e2f)"></path>
                </svg>
            </div>
            <div className="fixed bottom-40 -left-20 opacity-5 pointer-events-none z-0">
                <svg height="300" viewBox="0 0 200 200" width="300" xmlns="http://www.w3.org/2000/svg">
                    <path d="M100 0 C120 40 180 40 200 100 C180 160 120 160 100 200 C80 160 20 160 0 100 C20 40 80 40 100 0" fill="var(--primary, #c21e2f)"></path>
                </svg>
            </div>

            <main className="relative z-10 max-w-4xl mx-auto camellia-pattern">
                {/* Search Bar - explicitly added */}
                <div className="px-4 mt-6">
                    <div className="relative group">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
                        <input 
                            className="w-full h-12 pl-12 pr-4 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary/40 text-sm placeholder:text-slate-500 text-slate-100 transition-all shadow-sm" 
                            placeholder={t('search_menu') || "Search for sushi, ramen..."} 
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Category Tabs */}
                <div className="sticky top-[64px] z-40 bg-[#201213]/90 backdrop-blur-md pt-4 pb-2 border-b border-primary/20 mt-4">
                    <div className="flex overflow-x-auto gap-6 px-6 no-scrollbar">
                        <button
                            onClick={() => setActiveCategory('All')}
                            className={`flex flex-col items-center min-w-max pb-2 border-b-2 transition-colors ${activeCategory === 'All' ? 'border-primary' : 'border-transparent hover:border-primary/50'}`}
                        >
                            <span className={`font-display text-sm font-bold ${activeCategory === 'All' ? 'text-primary' : 'text-slate-400 font-medium'}`}>{t('all') || 'All'}</span>
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`flex flex-col items-center min-w-max pb-2 border-b-2 transition-colors ${activeCategory === cat ? 'border-primary' : 'border-transparent hover:border-primary/50'}`}
                            >
                                <span className={`font-display text-sm font-bold ${activeCategory === cat ? 'text-primary' : 'text-slate-400 font-medium'}`}>{cat}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="p-4 space-y-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-40 bg-primary/10 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="p-4 space-y-10">
                        {categories.filter(cat => activeCategory === 'All' || activeCategory === cat).map(cat => {
                            const catMenus = menus.filter(m => m.category === cat)
                            if (catMenus.length === 0) return null;
                            
                            const featuredItem = catMenus[0];
                            const regularItems = catMenus.slice(1);

                            return (
                                <div key={cat} className="space-y-8">
                                    {/* Featured Item */}
                                    <section>
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="font-display text-2xl font-bold tracking-tight">{cat} Specials</h2>
                                            <span className="text-[10px] font-bold text-primary px-2 py-1 bg-primary/10 rounded uppercase">Recommended</span>
                                        </div>
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`group flex gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10 hover:border-primary/30 transition-all shadow-xl ${!featuredItem.is_available ? 'opacity-60 grayscale relative' : ''}`}
                                        >
                                            {!featuredItem.is_available && (
                                                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-[2px]">
                                                    <span className="bg-slate-800/90 text-white font-bold px-4 py-2 rounded-lg tracking-widest text-sm shadow-xl transform -rotate-12 outline outline-1 outline-white/20 uppercase">SOLD OUT</span>
                                                </div>
                                            )}
                                            
                                            <div className="flex-1 flex flex-col justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">Signature</span>
                                                    <h3 className="font-display text-lg font-bold text-slate-100">{getMenuName(featuredItem)}</h3>
                                                    {featuredItem.name_jp && featuredItem.name_jp !== getMenuName(featuredItem) && (
                                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1 mt-0.5">{featuredItem.name_jp}</p>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-400 leading-relaxed line-clamp-2 mt-2">
                                                    {getMenuDescription(featuredItem) || "Chef's meticulously prepared signature selection."}
                                                </p>
                                                <div className="flex items-center justify-between pt-4 mt-auto">
                                                    <span className="font-display text-xl font-bold text-primary">{fmt(featuredItem.price)}</span>
                                                    <button 
                                                        onClick={(e) => featuredItem.is_available && onAddToCart(e, featuredItem)}
                                                        disabled={!featuredItem.is_available}
                                                        className="flex items-center justify-center size-10 rounded-lg bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
                                                    >
                                                        <Plus className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div className="w-32 h-32 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-white/5">
                                                <img 
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                                    src={featuredItem.image_url || 'https://via.placeholder.com/300'} 
                                                    alt={getMenuName(featuredItem)}
                                                />
                                            </div>
                                        </motion.div>
                                    </section>

                                    {/* Regular Grid Cards */}
                                    {regularItems.length > 0 && (
                                        <section>
                                            <h2 className="font-display text-lg font-bold tracking-tight mb-4 text-slate-300">Popular {cat}</h2>
                                            <div className="grid grid-cols-2 gap-4">
                                                {regularItems.map((item, idx) => (
                                                    <motion.div 
                                                        key={item.id || `tsubaki-reg-${idx}`}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className={`bg-primary/5 border border-primary/5 hover:border-primary/20 rounded-xl p-3 flex flex-col gap-3 transition-colors ${!item.is_available ? 'opacity-60 grayscale relative' : ''}`}
                                                    >
                                                        {!item.is_available && (
                                                            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-[2px]">
                                                                <span className="bg-slate-800/90 text-white font-bold px-3 py-1 rounded-lg tracking-widest text-[10px] shadow-xl transform -rotate-12 outline outline-1 outline-white/20 uppercase">SOLD OUT</span>
                                                            </div>
                                                        )}
                                                        
                                                        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-slate-800 border border-white/5">
                                                            <img 
                                                                className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" 
                                                                src={item.image_url || 'https://via.placeholder.com/300'} 
                                                                alt={getMenuName(item)}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-1 flex-1">
                                                            <h4 className="font-display text-sm font-bold truncate text-slate-100">{getMenuName(item)}</h4>
                                                            {item.name_jp && item.name_jp !== getMenuName(item) && (
                                                                <p className="text-[9px] text-slate-500 uppercase tracking-widest truncate">{item.name_jp}</p>
                                                            )}
                                                            <p className="text-[10px] text-slate-400 leading-tight mt-1 line-clamp-2 pb-2">
                                                                {getMenuDescription(item) || "Classic traditional choice."}
                                                            </p>
                                                            <div className="flex items-center justify-between mt-auto">
                                                                <span className="font-bold text-primary font-display text-sm">{fmt(item.price)}</span>
                                                                <button 
                                                                    onClick={(e) => item.is_available && onAddToCart(e, item)}
                                                                    disabled={!item.is_available}
                                                                    className="bg-primary/20 p-1.5 rounded-md text-primary hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                                                                >
                                                                    <Plus className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </main>

            {/* Floating Checkout Bar */}
            {totalQuantity > 0 && (
                <div className="fixed left-0 right-0 p-4 bg-gradient-to-t from-[#201213] via-[#201213]/90 to-transparent bottom-[72px] z-50">
                    <div className="max-w-md mx-auto">
                        <div className="bg-primary text-white p-4 rounded-xl shadow-2xl shadow-primary/40 flex items-center justify-between relative overflow-hidden">
                            {/* Subtle embedded pattern in checkout banner */}
                            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>
                            
                            <div className="flex items-center gap-3 relative z-10 pl-2">
                                <div className="bg-white/20 size-10 rounded-lg flex items-center justify-center relative">
                                    <ShoppingBag className="w-5 h-5 text-white" />
                                    <span className="absolute -top-1 -right-1 bg-white text-primary text-[10px] font-bold size-4 flex items-center justify-center rounded-full">
                                        {totalQuantity}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] opacity-80 font-bold uppercase tracking-widest leading-none mb-0.5">Order Total</span>
                                    <span className="font-display text-lg font-bold leading-none">{fmt(totalAmount)}</span>
                                </div>
                            </div>
                            <button 
                                onClick={onCheckout}
                                className="bg-white text-primary font-bold px-6 py-2.5 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-2 relative z-10 active:scale-95 shadow-md"
                            >
                                <span className="text-sm">{t('checkout') || 'View Order'}</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
