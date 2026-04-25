import { useTheme } from '../../context/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'

export default function ThemeWrapper({ children }) {
    const { currentTheme } = useTheme()

    const themeBackgrounds = {
        sakura: <div key="sakura" className="fixed inset-0 sakura-bg opacity-40 z-[-1]" />,
        cosmos: <div key="cosmos" className="fixed inset-0 cosmos-bg z-[-1]" />,
        sunflower: <div key="sunflower" className="fixed inset-0 sunflower-bg z-[-1]" />,
        lavender: <div key="lavender" className="fixed inset-0 bg-gradient-to-br from-lavender-soft/30 to-background-light z-[-1]" />,
        ajisai: <div key="ajisai" className="fixed inset-0 hydrangea-bg opacity-30 z-[-1]" />,
        tsubaki: (
            <div key="tsubaki" className="fixed inset-0 z-[-1] camellia-overlay">
                <div className="absolute inset-0 camellia-pattern"></div>
            </div>
        ),
        bamboo: (
            <div key="bamboo" className="fixed inset-0 z-[-1] bamboo-bg">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background-dark opacity-50"></div>
            </div>
        )
    }

    const themeClasses = {
        sakura: 'bg-[#fdfafb] text-slate-800',
        cosmos: 'bg-[#fdf4ff] text-slate-900',
        sunflower: 'bg-[#f8f8f5] text-slate-900',
        lavender: 'bg-white text-slate-900',
        ajisai: 'bg-white text-slate-800',
        tsubaki: 'bg-[#f8f6f6] text-slate-900',
        bamboo: 'bg-[#f8f8f5] text-slate-800',
    }

    return (
        <div data-theme={currentTheme || 'tsubaki'} className={`relative min-h-screen transition-colors duration-500 overflow-x-hidden ${themeClasses[currentTheme] || themeClasses.tsubaki}`}>
            <AnimatePresence mode="popLayout">
                <motion.div
                    key={currentTheme}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="fixed inset-0 z-[-1]"
                >
                    {themeBackgrounds[currentTheme] || themeBackgrounds.tsubaki}
                </motion.div>
            </AnimatePresence>

            <div className="relative z-0">
                {children}
            </div>
        </div>
    )
}
