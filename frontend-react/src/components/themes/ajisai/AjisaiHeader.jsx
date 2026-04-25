import { useLanguage } from '../../../context/LanguageContext'
import { useTheme } from '../../../context/ThemeContext'
import LanguageToggle from '../../common/LanguageToggle'
import { Palette } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function AjisaiHeader({ storeName, devTheme, setDevTheme }) {
    const { t } = useLanguage()
    const { themes, setCurrentTheme, currentTheme: contextTheme } = useTheme()
    const [showThemes, setShowThemes] = useState(false)
    const currentTheme = devTheme || contextTheme

    return (
        <header className="sticky top-0 z-50 px-4 py-4 border-b border-[#5cd0f0]/20"
            style={{ background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.5)' }}>
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">{storeName || 'Hydrangea Izakaya'}</h1>
                    <p className="text-xs text-slate-500 font-medium">{t('welcome') || 'A refreshing retreat by the sea.'}</p>
                </div>

                <div className="flex items-center gap-2">
                    <LanguageToggle />

                    <div className="relative">
                        <button
                            onClick={() => setShowThemes(!showThemes)}
                            className="h-10 px-3 flex items-center justify-center rounded-full border border-[#5cd0f0]/30 bg-[#5cd0f0]/10 text-[#5cd0f0] hover:bg-[#5cd0f0]/20 transition-colors"
                        >
                            <Palette size={18} />
                        </button>
                        <AnimatePresence>
                            {showThemes && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute right-0 mt-2 p-2 bg-white border border-slate-100 rounded-2xl shadow-xl flex flex-col gap-1 w-[140px] z-[999]"
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
                                                className={`w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all ${isSelected ? 'bg-[#5cd0f0] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
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
        </header>
    )
}
