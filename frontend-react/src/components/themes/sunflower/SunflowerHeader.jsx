import { useLanguage } from '../../../context/LanguageContext'
import { useTheme } from '../../../context/ThemeContext'
import LanguageToggle from '../../common/LanguageToggle'
import { Palette } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function SunflowerHeader({ storeName, devTheme, setDevTheme }) {
    const { t } = useLanguage()
    const { themes, setCurrentTheme, currentTheme: contextTheme } = useTheme()
    const [showThemes, setShowThemes] = useState(false)
    const currentTheme = devTheme || contextTheme

    return (
        <header className="sticky top-0 z-50 px-4 pt-4 pb-2 border-b border-[#ffd900]/10"
            style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.3)' }}>
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="bg-[#ffd900] p-2 rounded-full flex items-center justify-center shadow-md">
                            <span className="material-symbols-outlined text-slate-900 text-xl">local_florist</span>
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 leading-tight">
                            {storeName || 'Sunflower Cafe'}
                            <span className="block text-xs font-normal opacity-70 mt-0.5">{t('welcome') || 'Bask in the warmth of local flavors.'}</span>
                        </h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <LanguageToggle />

                        <div className="relative">
                            <button
                                onClick={() => setShowThemes(!showThemes)}
                                className="px-3 py-1.5 rounded-full text-xs font-bold transition-all border border-[#ffd900]/20 bg-[#ffd900]/20 hover:bg-[#ffd900]/30 flex items-center gap-1"
                            >
                                <Palette size={15} />
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
                                                    className={`w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${isSelected ? 'bg-[#ffd900] text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
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
            </div>
        </header>
    )
}
