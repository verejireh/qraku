import { motion } from 'framer-motion'
import { useParams } from 'react-router-dom'
import { User, Gift, Award, Settings, Bell, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'

export default function ProfileView() {
    const { shop_id } = useParams()
    const { t } = useLanguage()
    const { currentTheme, themes } = useTheme()
    const themeColor = themes[currentTheme]?.color || '#fb7185'
    const [customer, setCustomer] = useState({ visit_count: 5, total_points: 1250 }) // Mocking for now
    const [loading, setLoading] = useState(false)

    return (
        <div className="relative pb-32">
            <main className="px-6 pt-12 space-y-10">
                <header className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full border-2 p-1" style={{ borderColor: `${themeColor}50` }}>
                        <div className="w-full h-full glass rounded-full flex items-center justify-center">
                            <User className="w-10 h-10" style={{ color: themeColor }} />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-2xl font-serif italic text-inherit leading-tight">Gourmet Guest</h1>
                        <p className="text-xs font-bold uppercase tracking-widest mt-1" style={{ color: themeColor }}>{t('profile')}</p>
                    </div>
                </header>

                {/* Membership Card */}
                <motion.div
                    whileHover={{ rotateY: 5, rotateX: 5 }}
                    className="relative w-full aspect-[1.6/1] border border-white/20 rounded-[2.5rem] p-8 overflow-hidden shadow-2xl"
                    style={{
                        background: `linear-gradient(to bottom right, ${themeColor}40, ${themeColor}10, transparent)`,
                        boxShadow: `0 25px 50px -12px ${themeColor}20`
                    }}
                >
                    <div className="absolute top-0 right-0 w-40 h-40 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" style={{ backgroundColor: `${themeColor}20` }}></div>
                    <div className="relative h-full flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <Award className="w-8 h-8" style={{ color: themeColor }} />
                            <div className="text-right">
                                <div className="text-[10px] text-black/50 font-bold uppercase tracking-widest">Points Balance</div>
                                <div className="text-3xl font-bold text-inherit tracking-tighter">{customer.total_points.toLocaleString()} pt</div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] text-black/50 font-bold uppercase tracking-widest">Membership Tier</div>
                            <div className="text-xl font-serif italic" style={{ color: themeColor }}>Magnolia Excellence</div>
                        </div>
                    </div>
                </motion.div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 glass rounded-3xl text-center space-y-1 shadow-sm">
                        <div className="text-2xl font-bold text-inherit">{customer.visit_count}</div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Total Visits</div>
                    </div>
                    <div className="p-5 glass rounded-3xl text-center space-y-1 shadow-sm">
                        <div className="text-2xl font-bold text-inherit">3</div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Active Rewards</div>
                    </div>
                </div>

                {/* Menu List */}
                <section className="space-y-3">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-2 pb-2">Account Settings</div>
                    {[
                        { icon: <Gift className="w-4 h-4" />, label: 'Redeem Coupons' },
                        { icon: <Bell className="w-4 h-4" />, label: 'Notification Settings' },
                        { icon: <Settings className="w-4 h-4" />, label: 'Preferences' }
                    ].map((item, idx) => (
                        <button key={idx} className="w-full flex items-center justify-between p-5 glass rounded-2xl hover:bg-white/20 transition-colors shadow-sm">
                            <div className="flex items-center gap-4">
                                <div style={{ color: themeColor }}>{item.icon}</div>
                                <span className="text-inherit text-sm font-medium">{item.label}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                        </button>
                    ))}
                </section>
            </main>
        </div>
    )
}
