import { useState } from 'react'
import { useLanguage } from '../../context/LanguageContext'

export default function MagnoliaMenuCard({ item, onAdd, variant = 'default' }) {
    const isTakeout = variant === 'takeout'
    const { getMenuName, getMenuDescription } = useLanguage()

    const [isOptionsOpen, setIsOptionsOpen] = useState(false)
    const [selectedOptions, setSelectedOptions] = useState({})

    // Parse DB options safely
    let parsedOptions = []
    try {
        if (item.options && item.options !== "[]") {
            parsedOptions = typeof item.options === 'string' ? JSON.parse(item.options) : item.options;
        }
    } catch (e) {
        console.error("Failed to parse options for menu item", e)
    }

    const handleAddClick = (e) => {
        // If has options, open modal. Else, add immediately
        if (parsedOptions && parsedOptions.length > 0) {
            // Initialize defaults (first choice for each group)
            const initialOpts = {}
            parsedOptions.forEach(group => {
                if (group.choices && group.choices.length > 0) {
                    initialOpts[group.group_name] = group.choices[0].name
                }
            })
            setSelectedOptions(initialOpts)
            setIsOptionsOpen(true)
        } else {
            onAdd(e, item)
        }
    }

    const confirmOptionsAndAdd = (e) => {
        onAdd(e, item, 1, selectedOptions) // pass chosen options to cart
        setIsOptionsOpen(false)
    }

    // Dynamic price calculation in modal
    let extraPriceSum = 0;
    if (parsedOptions && parsedOptions.length > 0) {
        parsedOptions.forEach(group => {
            const selectedChoiceName = selectedOptions[group.group_name]
            if (selectedChoiceName) {
                const choice = group.choices?.find(c => c.name === selectedChoiceName)
                if (choice && choice.extra_price) {
                    extraPriceSum += Number(choice.extra_price)
                }
            }
        })
    }
    const modalTotalPrice = Number(item.price) + extraPriceSum;

    const imageUrl = item.image_url
        ? (item.image_url.startsWith('http') ? item.image_url : (item.image_url.startsWith('/uploads') ? item.image_url : (item.image_url.startsWith('/') ? `/api${item.image_url}` : `/api/${item.image_url}`)))
        : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=300';

    return (
        <div className={`toss-card p-4 rounded-3xl flex gap-4 items-center animate-in fade-in slide-in-from-bottom-2 duration-500 relative ${isTakeout ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-card-dark'}`}>
            <div className="w-28 h-28 rounded-2xl overflow-hidden shrink-0 relative bg-charcoal/50">
                <img
                    alt={getMenuName(item)}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                    src={imageUrl}
                    loading="lazy"
                />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
                {isTakeout && (
                    <span className="absolute top-2 right-2 text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full tracking-wider">🥡 テイクアウト</span>
                )}
                <div className="mb-1">
                    <h3 className={`font-serif text-[17px] leading-tight ${isTakeout ? 'text-amber-900' : 'text-white'}`}>{getMenuName(item)}</h3>
                    <p className={`text-[11px] uppercase tracking-widest font-medium ${isTakeout ? 'text-amber-700/70' : 'text-slate-500'}`}>
                        {item.name_jp !== getMenuName(item) ? item.name_jp : ""}
                    </p>
                </div>
                <p className={`text-xs line-clamp-2 leading-relaxed mb-3 ${isTakeout ? 'text-amber-800/80' : 'text-slate-400'}`}>{getMenuDescription(item)}</p>
                <div className="flex items-center justify-between">
                    <span className={`font-bold text-[15px] ${isTakeout ? 'text-amber-900' : 'text-white'}`}>¥{parseInt(item.price).toLocaleString()}</span>
                    {isTakeout ? (
                        <button
                            onClick={handleAddClick}
                            className="flex items-center gap-1 px-3 h-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[11px] font-black active:scale-90 transition-transform shadow-lg shadow-amber-500/30"
                        >
                            <span>🥡</span>
                            <span>포장 담기</span>
                        </button>
                    ) : (
                        <button
                            onClick={handleAddClick}
                            className="w-8 h-8 rounded-full bg-gold text-charcoal flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-gold/20"
                        >
                            <span className="material-symbols-outlined font-bold text-[20px]">add</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Options Modal */}
            {isOptionsOpen && (
                <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-card-dark w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border border-white/10 animate-in slide-in-from-bottom-8">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-serif text-xl text-white">{getMenuName(item)} - Options</h3>
                            <button onClick={() => setIsOptionsOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>

                        <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                            {parsedOptions.map((group, gIdx) => (
                                <div key={gIdx} className="space-y-3">
                                    <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider">{group.translations?.en || group.group_name}</h4>
                                    <div className="space-y-2">
                                        {group.choices.map((choice, cIdx) => {
                                            const isSelected = selectedOptions[group.group_name] === choice.name;
                                            return (
                                                <div
                                                    key={cIdx}
                                                    onClick={() => setSelectedOptions(prev => ({ ...prev, [group.group_name]: choice.name }))}
                                                    className={`p-3 rounded-2xl border flex justify-between items-center cursor-pointer transition-all ${isSelected ? 'bg-gold/10 border-gold text-gold' : 'border-white/10 text-slate-400 hover:bg-white/5 hover:text-white'}`}
                                                >
                                                    <span className="font-medium text-sm">{choice.translations?.en || choice.name}</span>
                                                    <div className="flex items-center gap-3">
                                                        {Number(choice.extra_price) > 0 && <span className="text-xs">+¥{Number(choice.extra_price).toLocaleString()}</span>}
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-gold' : 'border-slate-600'}`}>
                                                            {isSelected && <div className="w-2.5 h-2.5 bg-gold rounded-full"></div>}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-400 lowercase font-serif italic">Total</p>
                                <p className="text-xl font-bold text-white">¥{modalTotalPrice.toLocaleString()}</p>
                            </div>
                            <button onClick={confirmOptionsAndAdd} className="bg-gold text-charcoal px-8 py-3 rounded-2xl font-bold text-[15px] shadow-lg shadow-gold/20 active:scale-95 transition-transform">
                                Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
