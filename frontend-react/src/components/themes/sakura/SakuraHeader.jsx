import { useLanguage } from '../../../context/LanguageContext'
import { useTheme } from '../../../context/ThemeContext'
import LanguageToggle from '../../common/LanguageToggle'
import { Palette } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function SakuraHeader({ storeName, devTheme, setDevTheme }) {
    const { t } = useLanguage()
    const { themes, setCurrentTheme, currentTheme: contextTheme } = useTheme()
    const [showThemes, setShowThemes] = useState(false)
    const currentTheme = devTheme || contextTheme

    return (
        <header className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm border-b border-[#ffb8c6]/20"
            style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#ffb8c6] text-2xl">filter_vintage</span>
                    <h1 className="text-xl font-bold tracking-tighter text-slate-900">{storeName || 'Sakura-Tei'}</h1>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{t('welcome') || 'Experience the art of Japanese minimalist dining.'}</p>
            </div>

            <div className="flex items-center gap-3">
                <LanguageToggle />

                <div className="relative">
                    <button
                        onClick={() => setShowThemes(!showThemes)}
                        className="p-2 rounded-full hover:bg-[#ffb8c6]/10 text-slate-600 transition-colors flex items-center justify-center"
                    >
                        <Palette size={20} />
                    </button>
                    <AnimatePresence>
                        {showThemes && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute right-0 mt-2 p-2 bg-white border border-slate-100 rounded-xl shadow-xl flex flex-col gap-1 w-[140px] z-[999]"
                            >
                                {Object.keys(themes).map(tName => {
                                    const isSelected = currentTheme === tName
                                    return (
                                        <button
                                            key={tName}
                                            onClick={() => {
                                                setCurrentTheme(tName)
                                                if (setDevTheme) setDevTheme(tName)
                                                setShowThemes(false)
                                            }}
                                            className={`w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${isSelected ? 'bg-[#ffb8c6] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            {themes[tName]?.name}
                                        </button>
                                    )
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </header>
    )
}
