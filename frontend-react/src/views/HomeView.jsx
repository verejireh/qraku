import { motion } from 'framer-motion'
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Utensils, Clock, Star, ArrowRight, Sparkles } from 'lucide-react'
import { useState, useEffect } from 'react'
import axios from 'axios'
import { useLanguage } from '../context/LanguageContext'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'

export default function HomeView() {
    const { shop_id: paramShopId, tableNumber: paramTableNumber } = useParams()
    const { storeId: sessionStoreId, tableNumber: sessionTableNumber } = useSession()

    const shop_id = paramShopId || sessionStoreId
    const tableNumber = paramTableNumber || sessionTableNumber

    const { t, language } = useLanguage()
    const { currentTheme, themes } = useTheme()
    const themeColor = themes[currentTheme]?.color || '#fb7185'
    const navigate = useNavigate();
    const location = useLocation();

    const getPath = (route) => {
        const queryParams = location.search;
        if (tableNumber) {
            return `/${shop_id}/table/${tableNumber}/${route}${queryParams}`;
        }
        return `/${shop_id}/${route}${queryParams}`;
    };
    const [storeName, setStoreName] = useState('Store')
    const [dailySpecials, setDailySpecials] = useState([])
    const [showSpecials, setShowSpecials] = useState(true)

    useEffect(() => {
        if (!shop_id) {
            navigate('/', { replace: true })
        }
    }, [shop_id, navigate])

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [storeRes, menusRes] = await Promise.all([
                    axios.get(`/api/stores/${shop_id}`),
                    axios.get(`/api/menus/${shop_id}`)
                ])
                setStoreName(storeRes.data.name_jp || storeRes.data.name_ko || storeRes.data.name)
                setShowSpecials(storeRes.data.show_daily_specials !== false)
                const menus = Array.isArray(menusRes.data) ? menusRes.data : (menusRes.data?.data || [])
                setDailySpecials(menus.filter(m => m.is_daily_special && m.is_available && m.is_active))
            } catch (e) { console.error(e) }
        }
        if (shop_id) fetchData()
    }, [shop_id])

    const getMenuName = (item) => {
        const langMap = { ko: 'name_ko', en: 'name_en', zh: 'name_zh', ja: 'name_jp' }
        return item[langMap[language]] || item.name_jp || item.name_ko || item.name_en || ''
    }
    const getMenuDesc = (item) => {
        const langMap = { ko: 'description_ko', en: 'description_en', zh: 'description_zh', ja: 'description_jp' }
        return item[langMap[language]] || item.description_jp || item.description_ko || ''
    }

    const goToMenu = () => navigate(getPath('menu'))
    const goToHistory = () => navigate(getPath('orders'))
    const goToProfile = () => navigate(getPath('profile'))

    return (
        <div className="relative pb-32">
            <main className="px-6 pt-12 space-y-12">
                {/* Hero Section */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest">
                        <Star className="w-3 h-3 fill-primary" />
                        Premium Dining Experience
                    </div>
                    <h1 className="text-4xl font-serif italic text-inherit leading-tight">
                        {t('welcome')} <br />
                        <span className="text-primary not-italic font-bold tracking-tight">{storeName}</span>
                    </h1>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-[280px]">
                        Indulge in a world where flavor meets elegance. We've prepared something special for Table {tableNumber}.
                    </p>
                </motion.section>

                {/* Status Cards */}
                <section className="grid grid-cols-2 gap-4">
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="p-4 glass rounded-3xl space-y-2 shadow-sm"
                    >
                        <Clock className="text-primary w-5 h-5" />
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{t('kitchen_status')}</div>
                        <div className="text-inherit font-medium">{t('active')}</div>
                    </motion.div>
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="p-4 glass rounded-3xl space-y-2 shadow-sm"
                    >
                        <Utensils className="text-primary w-5 h-5" />
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{t('your_table')}</div>
                        <div className="text-inherit font-medium">No. {tableNumber}</div>
                    </motion.div>
                </section>

                {/* Featured Cta */}
                <section className="relative group">
                    <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <button
                        onClick={goToMenu}
                        className="relative w-full aspect-[16/9] glass rounded-[2.5rem] overflow-hidden flex flex-col items-center justify-center gap-4 transition-all border-transparent hover:border-primary/50 shadow-md"
                    >
                        <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center shadow-2xl shadow-primary/20">
                            <Utensils className="text-white w-8 h-8" />
                        </div>
                        <div className="text-center">
                            <div className="text-inherit font-serif text-xl italic">{t('explore_menu')}</div>
                        </div>
                    </button>
                </section>

                {/* Daily Specials */}
                {showSpecials && dailySpecials.length > 0 && (
                    <section className="space-y-6">
                        <div className="flex items-end justify-between px-2">
                            <h2 className="font-serif text-2xl text-inherit flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-primary" />
                                Daily Specials
                            </h2>
                            <button onClick={goToMenu} className="text-[10px] text-primary font-bold uppercase underline">
                                {t('see_all') || 'See All'}
                            </button>
                        </div>
                        <div className="space-y-4">
                            {dailySpecials.map(item => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    onClick={goToMenu}
                                    className="flex gap-4 p-4 glass rounded-3xl shadow-sm cursor-pointer hover:scale-[1.01] transition-transform"
                                    style={{ borderLeft: `3px solid ${themeColor}` }}
                                >
                                    <div className="w-20 h-20 bg-primary/10 rounded-2xl overflow-hidden shrink-0">
                                        {item.image_url ? (
                                            <img src={item.image_url.startsWith('/uploads') ? item.image_url : (item.image_url.startsWith('http') ? item.image_url : `/api/${item.image_url}`)} alt={getMenuName(item)} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Utensils className="w-8 h-8 text-primary/30" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-1 flex-1 min-w-0">
                                        <div className="text-inherit font-medium truncate">{getMenuName(item)}</div>
                                        <div className="text-slate-500 text-xs line-clamp-2">{getMenuDesc(item)}</div>
                                        <div className="flex items-center gap-2">
                                            {item.special_price != null ? (
                                                <>
                                                    <span className="text-primary font-bold text-sm">¥{item.special_price.toLocaleString()}</span>
                                                    <span className="text-slate-400 text-xs line-through">¥{item.price.toLocaleString()}</span>
                                                </>
                                            ) : (
                                                <span className="text-primary font-bold text-sm">¥{item.price.toLocaleString()}</span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    )
}
