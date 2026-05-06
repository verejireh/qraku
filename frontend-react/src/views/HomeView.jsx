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
    const [lineFriendUrl, setLineFriendUrl] = useState('')

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
                    axios.get(`/api/menus/${shop_id}?filter_groups=true`)
                ])
                setStoreName(storeRes.data.name_jp || storeRes.data.name_ko || storeRes.data.name)
                setShowSpecials(storeRes.data.show_daily_specials !== false)
                setLineFriendUrl(storeRes.data.line_friend_url || '')
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

                {/* LINE 友だち追加 */}
                {lineFriendUrl && (
                    <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2"
                    >
                        <a
                            href={lineFriendUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-3 w-full py-4 px-6 rounded-2xl text-white font-bold shadow-lg transition-transform active:scale-[0.98] hover:brightness-110"
                            style={{ backgroundColor: '#06C755' }}
                        >
                            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden="true">
                                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                            </svg>
                            LINE 友だち追加
                        </a>
                        <p className="text-[10px] text-slate-400 text-center">最新メニュー・クーポン情報をお届け</p>
                    </motion.section>
                )}

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
