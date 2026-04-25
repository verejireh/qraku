import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Globe, Palette } from 'lucide-react'

export default function MagnoliaHeader({ storeName, devTheme, setDevTheme }) {
    const { currentTheme: contextTheme, setCurrentTheme: setContextTheme, themes } = useTheme()
    const { language, setLanguage, t } = useLanguage()
    const [showThemes, setShowThemes] = useState(false)
    const [showLangs, setShowLangs] = useState(false)
    const [hoveredTheme, setHoveredTheme] = useState(null)

    // Current effective theme
    const currentTheme = devTheme || contextTheme
    const displayTitle = storeName || themes[currentTheme]?.name || 'Magnolia'

    const languages = [
        { code: 'ko', label: '한국어' },
        { code: 'ja', label: '日本語' },
        { code: 'en', label: 'English' }
    ]

    return (
        <header className="sticky top-0 z-50 bg-card-dark/80 backdrop-blur-xl border-b border-white/[0.05]">
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <div className="flex flex-col">
                    <h1 className="font-serif italic text-2xl tracking-tight text-white">{displayTitle}</h1>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{t('welcome')}</div>
                </div>

                <div className="flex gap-2">
                    {/* Language Toggle */}
                    <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10 mr-2">
                        <button onClick={() => setLanguage('ko')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${language === 'ko' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>KOR</button>
                        <button onClick={() => setLanguage('ja')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${language === 'ja' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>JPN</button>
                        <button onClick={() => setLanguage('en')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${language === 'en' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>ENG</button>
                        <button onClick={() => setLanguage('chn')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${language === 'chn' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>CHN</button>
                    </div>

                    {/* 7 Themes Toggle */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowThemes(!showThemes); setShowLangs(false); }}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-slate-400 hover:text-primary transition-colors"
                        >
                            <Palette size={18} />
                        </button>
                        <AnimatePresence>
                            {showThemes && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute right-0 mt-2 p-2 bg-card-dark border border-white/10 rounded-2xl shadow-xl flex flex-col gap-1 w-[140px]"
                                >
                                    {Object.keys(themes).map(tName => {
                                        const tColor = themes[tName]?.color || '#fb7185'
                                        const isSelected = currentTheme === tName
                                        const isHovered = hoveredTheme === tName

                                        return (
                                            <button
                                                key={tName}
                                                onMouseEnter={() => setHoveredTheme(tName)}
                                                onMouseLeave={() => setHoveredTheme(null)}
                                                onClick={() => {
                                                    setContextTheme(tName)
                                                    if (setDevTheme) {
                                                        setDevTheme(tName === 'magnolia' ? null : tName)
                                                    }
                                                    setShowThemes(false)
                                                }}
                                                style={{
                                                    backgroundColor: isHovered && !isSelected ? tColor : undefined,
                                                    color: isHovered && !isSelected ? '#ffffff' : undefined,
                                                    boxShadow: isHovered && !isSelected ? `0 4px 14px 0 ${tColor}40` : undefined
                                                }}
                                                className={`w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all duration-300 ${isSelected ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-300'
                                                    }`}
                                            >
                                                {themes[tName]?.name || tName}
                                            </button>
                                        )
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </header>
    )
}
