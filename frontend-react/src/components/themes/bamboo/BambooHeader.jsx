import { useLanguage } from '../../../context/LanguageContext'
import { useTheme } from '../../../context/ThemeContext'
import LanguageToggle from '../../common/LanguageToggle'
import { Palette } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function BambooHeader({ storeName, devTheme, setDevTheme }) {
    const { t } = useLanguage()
    const { themes, setCurrentTheme, currentTheme: contextTheme } = useTheme()
    const [showThemes, setShowThemes] = useState(false)
    const currentTheme = devTheme || contextTheme

    return (
        <header className="sticky top-0 z-50 bg-[#f8f8f5]/90 backdrop-blur-md px-4 py-4 flex justify-between border-b border-[#7f8000]/10 items-center">
            <div className="flex flex-col">
                <h1 className="text-lg font-bold tracking-tight text-[#7f8000] uppercase">{storeName || 'Bamboo Zen Garden'}</h1>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">{t('welcome') || 'Harmonious flavors in a natural setting.'}</p>
            </div>

            <div className="flex items-center gap-2">
                <LanguageToggle />

                <div className="relative">
                    <button
                        onClick={() => setShowThemes(!showThemes)}
                        className="flex items-center gap-1 px-3 py-2 rounded-full border border-[#7f8000]/20 bg-[#7f8000]/5 hover:bg-[#7f8000]/10 transition-colors"
                    >
                        <Palette size={16} className="text-[#7f8000]" />
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
                                            className={`w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${isSelected ? 'bg-[#7f8000] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
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
