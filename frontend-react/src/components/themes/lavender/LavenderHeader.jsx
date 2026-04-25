import { useLanguage } from '../../../context/LanguageContext'
import { useTheme } from '../../../context/ThemeContext'
import LanguageToggle from '../../common/LanguageToggle'
import { Palette } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function LavenderHeader({ storeName, devTheme, setDevTheme }) {
    const { t } = useLanguage()
    const { themes, setCurrentTheme, currentTheme: contextTheme } = useTheme()
    const [showThemes, setShowThemes] = useState(false)
    const currentTheme = devTheme || contextTheme

    return (
        <nav className="sticky top-0 z-50 border-b border-[#9c7aff]/10 px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <div className="max-w-md mx-auto flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#9c7aff]/10 rounded-xl flex items-center justify-center text-[#9c7aff]">
                        <span className="material-symbols-outlined text-2xl">local_florist</span>
                    </div>
                    <div>
                        <h1 className="text-base font-bold leading-tight text-slate-900">{storeName || 'Lavender Cuisine'}</h1>
                        <p className="text-[10px] text-[#6a5e8d] font-medium">{t('welcome') || 'Savor the elegant essence of Izu.'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <LanguageToggle />

                    <div className="relative">
                        <button
                            onClick={() => setShowThemes(!showThemes)}
                            className="text-[#6a5e8d] hover:text-[#9c7aff] transition-colors p-1 flex items-center justify-center"
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
                                                className={`w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${isSelected ? 'bg-[#9c7aff] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
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
            </div>
        </nav>
    )
}
