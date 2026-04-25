import { useLanguage } from '../../context/LanguageContext'

export default function LanguageToggle() {
    const { language, setLanguage, availableLanguages, languageNames } = useLanguage()

    return (
        <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10 gap-1">
            {availableLanguages.map(langCode => (
                <button
                    key={langCode}
                    onClick={(e) => { e.stopPropagation(); setLanguage(langCode); }}
                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all whitespace-nowrap ${language === langCode ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                    title={languageNames[langCode] || langCode}
                >
                    {langCode.toUpperCase()}
                </button>
            ))}
        </div>
    )
}
