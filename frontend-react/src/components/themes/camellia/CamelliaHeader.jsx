import { useLanguage } from '../../../context/LanguageContext'
import { useTheme } from '../../../context/ThemeContext'
import LanguageToggle from '../../common/LanguageToggle'
import { Palette } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function CamelliaHeader({ storeName, devTheme, setDevTheme }) {
    const { t } = useLanguage()
    const { themes, setCurrentTheme, currentTheme: contextTheme } = useTheme()
    const [showThemes, setShowThemes] = useState(false)
    const currentTheme = devTheme || contextTheme

    return (
        <header className="sticky top-0 z-50 bg-[#f8f6f6]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-[#c21e2f]/20">
            <div className="flex flex-col">
                <h1 className="font-serif text-xl font-bold text-[#c21e2f] tracking-tight">{storeName || 'Camellia Dining'}</h1>
                <p className="text-[10px] text-slate-400 font-medium italic">{t('welcome') || 'Rich tradition in every bite.'}</p>
            </div>

            <div className="flex items-center gap-2">
                <LanguageToggle />

                <div className="relative">
                    <button
                        onClick={() => setShowThemes(!showThemes)}
                        className="flex items-center px-3 py-2 rounded-full bg-[#c21e2f]/10 hover:bg-[#c21e2f]/20 transition-colors"
                    >
                        <Palette size={16} className="text-[#c21e2f]" />
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
                                            className={`w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${isSelected ? 'bg-[#c21e2f] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
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
