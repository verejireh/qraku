import { useLanguage } from '../../../context/LanguageContext'
import { useTheme } from '../../../context/ThemeContext'
import LanguageToggle from '../../common/LanguageToggle'
import { Palette } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function CosmosHeader({ storeName, devTheme, setDevTheme }) {
    const { t } = useLanguage()
    const { themes, setCurrentTheme, currentTheme: contextTheme } = useTheme()
    const [showThemes, setShowThemes] = useState(false)
    const currentTheme = devTheme || contextTheme

    return (
        <header className="sticky top-0 z-50 bg-[#fdfbfc]/90 backdrop-blur-md px-4 py-4 flex items-center border-b border-[#e13370]/10 justify-between">
            <div className="flex flex-col">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">{storeName || 'Cosmos Kitchen'}</h1>
                <p className="text-[11px] text-slate-500">{t('welcome') || 'Delicate flavors, beautifully served.'}</p>
            </div>

            <div className="flex items-center gap-2">
                <LanguageToggle />

                <div className="relative">
                    <button
                        onClick={() => setShowThemes(!showThemes)}
                        className="px-3 py-1.5 rounded-full bg-[#fce7ef] text-[#e13370] text-[11px] font-bold border border-[#e13370]/10 hover:bg-[#fce7ef]/80 transition-colors flex items-center gap-1"
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
                                            className={`w-full text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${isSelected ? 'bg-[#e13370] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
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
