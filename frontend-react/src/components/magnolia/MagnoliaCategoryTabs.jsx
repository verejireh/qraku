import { useLanguage } from '../../context/LanguageContext'

export default function MagnoliaCategoryTabs({ categories, activeId, onSelect }) {
    const { t } = useLanguage()

    return (
        <div className="sticky top-[72px] z-40 bg-charcoal/80 backdrop-blur-xl border-b border-white/[0.05] overflow-x-auto hide-scrollbar px-6 py-4 flex gap-6 scroll-smooth">
            {categories.map((cat) => (
                <button
                    key={cat.id}
                    onClick={() => onSelect(cat.id)}
                    className={`flex flex-col items-center shrink-0 group relative transition-colors ${activeId === cat.id ? 'text-gold' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <span className={`text-[13px] tracking-wide ${activeId === cat.id ? 'font-semibold' : 'font-medium'}`}>
                        {t(cat.name)}
                    </span>
                    {activeId === cat.id && (
                        <div className="absolute -bottom-[17px] h-[2px] w-full bg-gold rounded-full"></div>
                    )}
                </button>
            ))}
        </div>
    )
}
