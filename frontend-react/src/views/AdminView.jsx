import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'
import { clearAdminToken } from '../hooks/useAdminApi'
import SubscriptionView from './SubscriptionView'
// Pure CSS charts — no recharts dependency

const DAYS_OF_WEEK = ['月', '火', '水', '木', '金', '土', '日']
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

// ─── Admin Navigation Bar (Shared across all admin tabs) ───────────
export function AdminNavBar({ storeData, shop_id }) {
    const navigate = useNavigate()
    const location = useLocation()
    const { language, setLanguage, t } = useLanguage()
    const { themes, currentTheme } = useTheme()

    const tabs = [
        { key: 'home', label: t?.('admin.nav.dashboard') || 'Home', path: `/${shop_id}/admin`, exact: true, icon: 'dashboard' },
        { key: 'mypage', label: 'My Page', path: `/${shop_id}/admin/homepage`, icon: 'home' },
        { key: 'menu', label: t?.('admin.nav.menu_manage') || 'Menu', path: `/${shop_id}/admin/menu`, icon: 'restaurant_menu' },
        { key: 'operation', label: t?.('admin.nav.operation') || 'Operation', path: `/${shop_id}/admin/operation`, icon: 'settings_suggest' },
        { key: 'staff', label: t?.('admin.nav.staff') || 'Staff', path: `/${shop_id}/admin/staff-manage`, icon: 'badge' },
        { key: 'payment', label: t?.('admin.nav.payment') || 'Payment', path: `/${shop_id}/admin/payment`, icon: 'payments' },
    ]

    const isActive = (tab) => tab.exact
        ? location.pathname === tab.path
        : location.pathname.startsWith(tab.path)

    return (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-200 px-4 md:px-10 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/${shop_id}/admin`)}>
                    <div className="size-10 bg-adminprimary/20 rounded-full flex items-center justify-center text-adminprimary">
                        <span className="material-symbols-outlined text-2xl">spa</span>
                    </div>
                    <div className="hidden md:block">
                        <h1 className="text-lg font-black tracking-tight text-slate-900">{storeData?.name || 'QRaku'}</h1>
                        <p className="text-[10px] text-slate-400 -mt-0.5">Admin Dashboard</p>
                    </div>
                </div>
                <nav className="flex items-center gap-1 ml-2 bg-slate-100 rounded-xl p-1">
                    {tabs.map(tab => (
                        <button key={tab.key} onClick={() => navigate(tab.path)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                                isActive(tab) ? 'bg-white text-adminprimary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}>
                            <span className="material-symbols-outlined text-base w-5 h-5 overflow-hidden inline-flex items-center justify-center flex-shrink-0">{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </nav>
            </div>
            <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                    {[['ja','日'], ['en','EN'], ['ko','한'], ['zh','中']].map(([code, label]) => (
                        <button key={code} onClick={() => setLanguage(code)}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${language === code ? 'bg-white text-adminprimary shadow-sm' : 'text-slate-400'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => { clearAdminToken(); navigate(`/${shop_id}/admin/login`, { replace: true }) }}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="ログアウト"
                >
                    <span className="material-symbols-outlined text-base">logout</span>
                    <span className="hidden md:inline">Logout</span>
                </button>
            </div>
        </header>
    )
}

// ─── Toggle Switch Component ───────────────────────────────────────
function Toggle({ value, onChange, disabled }) {
    return (
        <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
            className={`w-11 h-6 rounded-full relative transition-colors ${value ? 'bg-adminprimary' : 'bg-slate-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <div className={`absolute top-1 size-4 bg-white rounded-full transition-all shadow-sm ${value ? 'left-6' : 'left-1'}`} />
        </button>
    )
}

export default function AdminView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const { t } = useLanguage()
    const { themes } = useTheme()

    const [storeData, setStoreData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [showSubscription, setShowSubscription] = useState(false)
    const [subStatus, setSubStatus] = useState(null)

    // Stats
    const [summary, setSummary] = useState({ total_sales: 0, total_orders: 0, avg_order_value: 0 })
    const [dailyData, setDailyData] = useState([])
    const [hourlyData, setHourlyData] = useState([])
    const [hourlyGuests, setHourlyGuests] = useState([])
    const [topMenus, setTopMenus] = useState([])
    const [categoryData, setCategoryData] = useState([])
    const [monthlyData, setMonthlyData] = useState([])
    const [weeklyData, setWeeklyData] = useState([])
    const [chartMode, setChartMode] = useState('sales') // sales | orders
    const [chartView, setChartView] = useState('daily') // daily | hourly | monthly | weekly
    const [statDays, setStatDays] = useState(7)

    // Chart View mode

    // Data Fetching
    useEffect(() => {
        async function load() {
            try {
                const [storeRes, subRes] = await Promise.all([
                    axios.get(`/api/stores/${shop_id}`),
                    axios.get(`/api/billing/subscription-status/${shop_id}`).catch(() => null)
                ])
                const store = storeRes.data?.data || storeRes.data
                setStoreData(store)
                if (subRes?.data) setSubStatus(subRes.data)
            } catch (e) { console.error(e) }
            setLoading(false)
        }
        load()
    }, [shop_id])

    // Load stats
    useEffect(() => {
        if (!shop_id) return
        async function loadStats() {
            try {
                const [sumRes, dailyRes, hourlyRes, topRes, catRes, monthRes, weekRes, guestRes] = await Promise.all([
                    axios.get(`/api/stats/summary?shop_id=${shop_id}&days=${statDays}`).catch(() => ({ data: {} })),
                    axios.get(`/api/stats/daily?shop_id=${shop_id}&days=${statDays}`).catch(() => ({ data: [] })),
                    axios.get(`/api/stats/hourly?shop_id=${shop_id}`).catch(() => ({ data: [] })),
                    axios.get(`/api/stats/top-menus?shop_id=${shop_id}&days=${statDays}&limit=5`).catch(() => ({ data: [] })),
                    axios.get(`/api/stats/sales-by-category?shop_id=${shop_id}&days=${statDays}`).catch(() => ({ data: [] })),
                    axios.get(`/api/stats/monthly?shop_id=${shop_id}`).catch(() => ({ data: [] })),
                    axios.get(`/api/stats/weekly?shop_id=${shop_id}`).catch(() => ({ data: [] })),
                    axios.get(`/api/stats/hourly-guests?shop_id=${shop_id}`).catch(() => ({ data: [] })),
                ])
                setSummary(sumRes.data || {})
                setDailyData(Array.isArray(dailyRes.data) ? dailyRes.data : [])
                setHourlyData(Array.isArray(hourlyRes.data) ? hourlyRes.data : [])
                setTopMenus(Array.isArray(topRes.data) ? topRes.data : [])
                setCategoryData(Array.isArray(catRes.data) ? catRes.data : [])
                setMonthlyData(Array.isArray(monthRes.data) ? monthRes.data : [])
                setWeeklyData(Array.isArray(weekRes.data) ? weekRes.data : [])
                setHourlyGuests(Array.isArray(guestRes.data) ? guestRes.data : [])
            } catch (e) { console.error(e) }
        }
        loadStats()
    }, [shop_id, statDays])

    // Handlers
    const handleDownloadReport = async () => {
        try {
            const res = await axios.get(`/api/stats/summary?shop_id=${shop_id}&days=30`)
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = `report_${shop_id}.json`; a.click()
        } catch {}
    }



    const handleStoreUpdate = async (field, value) => {
        try {
            await axios.patch(`/api/stores/${shop_id}`, { [field]: value })
            setStoreData(prev => ({ ...prev, [field]: value }))
        } catch (e) { console.error(e) }
    }

    const handleDisplayToggle = async (field) => {
        const ds = storeData?.display_settings || {}
        const current = ds[field] !== false
        const updated = { ...ds, [field]: !current }
        const allOff = !updated.use_kitchen_page && !updated.use_register_page && !updated.use_staff_page
        if (allOff && storeData?.pos_mode !== 'square') {
            alert('外部POS未連携の場合、最低1つの画面を有効にする必要があります。')
            return
        }
        try {
            await axios.patch(`/api/admin/stores/${storeData.id}/display-settings`, { [field]: !current })
            setStoreData(prev => ({ ...prev, display_settings: updated }))
        } catch (e) { console.error(e) }
    }

    // Chart data selector — must be before any early return to maintain hooks order
    const chartData = useMemo(() => {
        if (chartView === 'hourly') return Array.isArray(hourlyData) ? hourlyData : []
        if (chartView === 'monthly') return Array.isArray(monthlyData) ? monthlyData : []
        if (chartView === 'weekly') return Array.isArray(weeklyData) ? weeklyData : []
        return Array.isArray(dailyData) ? dailyData : []
    }, [chartView, chartMode, hourlyData, dailyData, monthlyData, weeklyData])

    const chartKey = chartView === 'hourly' ? 'count' : (chartMode === 'sales' ? 'sales' : 'orders')
    const chartLabel = chartView === 'hourly' ? 'label' : (chartView === 'monthly' ? 'month' : chartView === 'weekly' ? 'day_name' : 'day')

    if (loading) return <div className="min-h-screen bg-[#f8f6f6] tsubaki-pattern-bg flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-adminprimary border-t-transparent rounded-full" /></div>

    return (
        <div className="min-h-screen bg-[#f8f6f6] tsubaki-pattern-bg font-display">
            <AdminNavBar storeData={storeData} shop_id={shop_id} />

            {/* Subscription modal */}
            <AnimatePresence>
                {showSubscription && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
                        onClick={() => setShowSubscription(false)}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}>
                            <SubscriptionView onClose={() => setShowSubscription(false)} storeData={storeData} />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

                {/* ════════ SUBSCRIPTION STATUS BADGE ════════ */}
                {subStatus && (() => {
                    const days = subStatus.days_remaining
                    const status = subStatus.subscription_status
                    const isExpired = status === 'EXPIRED'
                    const isTrial = status === 'TRIAL'
                    const bgColor = isExpired ? 'bg-red-50 border-red-200' : days <= 3 ? 'bg-red-50 border-red-200' : days <= 7 ? 'bg-amber-50 border-amber-200' : isTrial ? 'bg-indigo-50 border-indigo-200' : 'bg-emerald-50 border-emerald-200'
                    const textColor = isExpired ? 'text-red-600' : days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : isTrial ? 'text-indigo-600' : 'text-emerald-600'
                    const icon = isExpired ? '❌' : isTrial ? '🆓' : '✅'
                    const label = isExpired ? '만료됨' : isTrial ? '무료 체험' : '구독 중'
                    const planLabel = subStatus.subscription_type === 'YEARLY' ? '연간' : subStatus.subscription_type === 'MONTHLY' ? '월간' : ''
                    return (
                        <button onClick={() => setShowSubscription(true)}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl border ${bgColor} transition-all hover:shadow-md`}>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{icon}</span>
                                <div className="text-left">
                                    <p className={`text-sm font-bold ${textColor}`}>{label} {planLabel && `(${planLabel})`}</p>
                                    {subStatus.subscription_expires_at && (
                                        <p className="text-xs text-slate-400">
                                            {new Date(subStatus.subscription_expires_at).toLocaleDateString('ja-JP')} まで
                                        </p>
                                    )}
                                </div>
                            </div>
                            {!isExpired && days != null && (
                                <div className={`text-right`}>
                                    <p className={`text-2xl font-black ${textColor}`}>D-{days}</p>
                                    <p className="text-[10px] text-slate-400 font-bold">残り日数</p>
                                </div>
                            )}
                            {isExpired && (
                                <div className="px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-xl">
                                    プラン選択 →
                                </div>
                            )}
                        </button>
                    )
                })()}

                {/* ════════ 0.1 TODAY'S SALES — BIG ════════ */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="p-6 md:p-8">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
                            <div>
                                <p className="text-sm font-medium text-slate-400 mb-1">Today's Total Sales</p>
                                <h2 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
                                    ¥{(summary.total_sales || 0).toLocaleString()}
                                </h2>
                                <div className="flex items-center gap-4 mt-3">
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-adminprimary/10 rounded-lg">
                                        <span className="material-symbols-outlined text-sm text-adminprimary">receipt_long</span>
                                        <span className="text-sm font-bold text-adminprimary">{summary.total_orders || 0} 件</span>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg">
                                        <span className="material-symbols-outlined text-sm text-emerald-500">person</span>
                                        <span className="text-sm font-bold text-emerald-600">Avg ¥{Math.round(summary.avg_order_value || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex bg-slate-100 rounded-lg p-1">
                                    {[7, 14, 30].map(d => (
                                        <button key={d} onClick={() => setStatDays(d)}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${statDays === d ? 'bg-white text-adminprimary shadow-sm' : 'text-slate-400'}`}>
                                            {d}日
                                        </button>
                                    ))}
                                </div>
                                <button onClick={handleDownloadReport}
                                    className="flex items-center gap-1 text-xs font-bold text-adminprimary bg-adminprimary/10 hover:bg-adminprimary/20 transition-colors px-3 py-2 rounded-lg">
                                    <span className="material-symbols-outlined text-sm">download</span>CSV
                                </button>
                            </div>
                        </div>

                        {/* Chart Controls */}
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                {[
                                    { key: 'daily', label: '日別', icon: 'calendar_month' },
                                    { key: 'hourly', label: '時間帯', icon: 'schedule' },
                                    { key: 'monthly', label: '月別', icon: 'date_range' },
                                    { key: 'weekly', label: '曜日別', icon: 'view_week' },
                                ].map(v => (
                                    <button key={v.key} onClick={() => setChartView(v.key)}
                                        className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${chartView === v.key ? 'bg-white text-adminprimary shadow-sm' : 'text-slate-400'}`}>
                                        <span className="material-symbols-outlined text-xs">{v.icon}</span>{v.label}
                                    </button>
                                ))}
                            </div>
                            {chartView !== 'hourly' && (
                                <div className="flex bg-slate-100 rounded-lg p-1">
                                    <button onClick={() => setChartMode('sales')}
                                        className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${chartMode === 'sales' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>
                                        売上
                                    </button>
                                    <button onClick={() => setChartMode('orders')}
                                        className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${chartMode === 'orders' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>
                                        注文数
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Main Bar Chart (CSS-based) */}
                        {(() => {
                            const maxVal = Math.max(...chartData.map(d => Number(d[chartKey]) || 0), 1)
                            return (
                                <div className="h-64 md:h-80 flex flex-col justify-end">
                                    <div className="flex-1 flex items-end gap-1 px-1">
                                        {chartData.map((d, i) => {
                                            const val = Number(d[chartKey]) || 0
                                            const pct = (val / maxVal) * 100
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] px-2 py-1 rounded-lg whitespace-nowrap z-10 pointer-events-none">
                                                        {chartMode === 'sales' ? `¥${val.toLocaleString()}` : `${val}件`}
                                                    </div>
                                                    <div className="w-full rounded-t-md bg-adminprimary hover:bg-adminprimary/50 transition-all relative"
                                                        style={{ height: `${Math.max(pct, 2)}%`, minHeight: val > 0 ? 4 : 1 }} />
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex gap-1 px-1 mt-2 border-t border-slate-100 pt-1">
                                        {chartData.map((d, i) => (
                                            <div key={i} className="flex-1 text-center">
                                                <span className="text-[8px] text-slate-400 block truncate">{d[chartLabel]}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Category + Guest charts side by side */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            {/* Category Horizontal Bars */}
                            <div className="bg-slate-50 rounded-xl p-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">カテゴリ別売上</h4>
                                {categoryData.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">データなし</p>}
                                <div className="space-y-2">
                                    {(() => {
                                        const maxRev = Math.max(...categoryData.map(c => Number(c.revenue) || 0), 1)
                                        return categoryData.map((c, i) => (
                                            <div key={i} className="space-y-1">
                                                <div className="flex justify-between text-[11px]">
                                                    <span className="font-bold text-slate-600 flex items-center gap-1.5">
                                                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                                        {c.category}
                                                    </span>
                                                    <span className="font-bold text-slate-500">¥{(Number(c.revenue) || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all" style={{
                                                        width: `${((Number(c.revenue) || 0) / maxRev) * 100}%`,
                                                        background: CHART_COLORS[i % CHART_COLORS.length]
                                                    }} />
                                                </div>
                                            </div>
                                        ))
                                    })()}
                                </div>
                            </div>

                            {/* Hourly Guests Bar Chart */}
                            <div className="bg-slate-50 rounded-xl p-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">時間帯別客数</h4>
                                {(() => {
                                    const filtered = hourlyGuests.filter(h => h.hour >= 8 && h.hour <= 23)
                                    const maxG = Math.max(...filtered.map(h => Number(h.guests) || 0), 1)
                                    return (
                                        <div className="h-40 flex items-end gap-0.5">
                                            {filtered.map((h, i) => {
                                                const val = Number(h.guests) || 0
                                                const pct = (val / maxG) * 100
                                                return (
                                                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                                                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none">
                                                            {h.label}: {val}人
                                                        </div>
                                                        <div className="w-full rounded-t-sm bg-emerald-500 hover:bg-emerald-400 transition-all"
                                                            style={{ height: `${Math.max(pct, 1)}%`, minHeight: val > 0 ? 3 : 1 }} />
                                                        <span className="text-[7px] text-slate-400 mt-0.5">{h.hour}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )
                                })()}
                            </div>
                        </div>
                    </div>
                </section>



                {/* ════════ 2-Column Grid: 人気メニュー + ポイント設定 ════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* ── 0.2 本日の人気メニュー ── */}
                    <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        <h4 className="font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-adminprimary">star</span>
                            本日の人気メニュー
                        </h4>
                        <div className="space-y-3">
                            {topMenus.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">まだ注文データがありません</p>}
                            {topMenus.map((item, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                    <div className="w-8 h-8 rounded-lg bg-adminprimary/20 flex items-center justify-center text-adminprimary text-sm font-black">
                                        {i + 1}
                                    </div>
                                    {item.image_url && (
                                        <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold truncate">{item.name_jp || item.name}</p>
                                        <p className="text-[10px] text-slate-400">{item.total_qty}個 sold</p>
                                    </div>
                                    <p className="text-sm font-bold text-emerald-500">¥{item.total_revenue?.toLocaleString()}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* ── 0.3 ポイント設定 ── */}
                    <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        <h4 className="font-bold mb-1 flex items-center gap-2">
                            <span className="material-symbols-outlined text-adminprimary">loyalty</span>
                            ポイント設定
                        </h4>
                        <p className="text-xs text-slate-400 mb-4">お客様にポイントを付与して、再来店時に割引特典を提供できます。</p>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-adminprimary/10/50 rounded-xl">
                                <div>
                                    <span className="text-sm font-bold">ポイントシステムを有効にする</span>
                                    <p className="text-[10px] text-slate-400 mt-0.5">再方問時に割引特典が適用されます</p>
                                </div>
                                <Toggle value={storeData?.points_enabled} onChange={v => handleStoreUpdate('points_enabled', v)} />
                            </div>

                            {storeData?.points_enabled && (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => handleStoreUpdate('point_accrual_type', 'PERCENT')}
                                            className={`py-3 text-xs font-bold rounded-xl border-2 transition-all ${storeData.point_accrual_type === 'PERCENT' ? 'bg-adminprimary/10 border-adminprimary/50 text-adminprimary' : 'border-slate-200 text-slate-400'}`}>
                                            パーセント (%)
                                        </button>
                                        <button onClick={() => handleStoreUpdate('point_accrual_type', 'FIXED')}
                                            className={`py-3 text-xs font-bold rounded-xl border-2 transition-all ${storeData.point_accrual_type === 'FIXED' ? 'bg-adminprimary/10 border-adminprimary/50 text-adminprimary' : 'border-slate-200 text-slate-400'}`}>
                                            固定ポイント
                                        </button>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                            {storeData.point_accrual_type === 'PERCENT' ? 'ポイント率 (100円あたり)' : '固定ポイント数'}
                                        </label>
                                        <input type="number"
                                            value={storeData.point_accrual_type === 'PERCENT' ? storeData.point_rate : storeData.point_fixed_amount}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value)
                                                const field = storeData.point_accrual_type === 'PERCENT' ? 'point_rate' : 'point_fixed_amount'
                                                setStoreData({ ...storeData, [field]: val })
                                            }}
                                            onBlur={e => {
                                                const val = parseFloat(e.target.value)
                                                const field = storeData.point_accrual_type === 'PERCENT' ? 'point_rate' : 'point_fixed_amount'
                                                handleStoreUpdate(field, val)
                                            }}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                </div>

                {/* ════════ 0.4 基本情報 ════════ */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">storefront</span>
                        基本情報
                        {(!storeData?.phone || !storeData?.address) && (
                            <span className="ml-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">未設定あり</span>
                        )}
                    </h4>
                    <p className="text-xs text-slate-400 mb-4">店舗の基本情報を入力してください。</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            { label: '店舗名', key: 'name', placeholder: '例: 麺屋 さくら' },
                            { label: '住所', key: 'address', placeholder: '例: 東京都渋谷区○○ 1-2-3', required: true },
                            { label: '電話番号', key: 'phone', placeholder: '例: 03-1234-5678', required: true, type: 'tel' },
                            { label: '代表者名', key: 'owner_name', placeholder: '例: 田中 太郎' },
                            { label: 'LINE 友だち追加 URL', key: 'line_friend_url', placeholder: '例: https://lin.ee/xxxxxxx', type: 'url' },
                        ].map(f => (
                            <div key={f.key}>
                                <label className="text-xs font-bold text-slate-500 block mb-1 flex items-center gap-2">
                                    <span>{f.label}{f.required && <span className="text-adminprimary ml-1">*</span>}</span>
                                    {f.key === 'line_friend_url' && (
                                        <a href="/guide/line-friend" target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#06C755]/10 text-[#06C755] hover:bg-[#06C755]/20 transition-colors no-underline">
                                            <span className="material-symbols-outlined text-[12px] leading-none">help</span>
                                            設定方法
                                        </a>
                                    )}
                                </label>
                                <input type={f.type || 'text'} defaultValue={storeData?.[f.key] || ''}
                                    onBlur={e => {
                                        const val = e.target.value.trim()
                                        if (val !== (storeData?.[f.key] || '')) handleStoreUpdate(f.key, val)
                                    }}
                                    placeholder={f.placeholder}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-adminprimary/50 focus:ring-1 focus:ring-indigo-100" />
                            </div>
                        ))}
                    </div>
                </section>

                {/* ════════ 0.45 テーマ選択 ════════ */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">palette</span>
                        テーマ
                    </h4>
                    <p className="text-xs text-slate-400 mb-4">お客様の注文画面の雰囲気を選んでください。</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                        {Object.entries(themes).map(([key, t]) => {
                            const selected = storeData?.theme === key
                            return (
                                <button
                                    key={key}
                                    onClick={() => handleStoreUpdate('theme', key)}
                                    className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all hover:scale-[1.03] ${
                                        selected
                                            ? 'border-adminprimary bg-adminprimary/5 shadow-md'
                                            : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <div
                                        className="w-12 h-12 rounded-full shadow-inner ring-2 ring-white"
                                        style={{ backgroundColor: t.color }}
                                    />
                                    <span className={`text-xs font-bold ${selected ? 'text-adminprimary' : 'text-slate-600'}`}>
                                        {t.name}
                                    </span>
                                    {selected && (
                                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-adminprimary flex items-center justify-center">
                                            <span className="material-symbols-outlined text-white text-[14px]">check</span>
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </section>

                {/* ════════ 0.5 My Home Page (간단 안내 + 이동 버튼) ════════ */}
                <section className="bg-gradient-to-br from-rose-50 to-amber-50 rounded-2xl border border-rose-200 p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                            <h4 className="font-bold mb-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-rose-500">home</span>
                                My Home Page
                            </h4>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                {storeData?.allow_public_listing
                                    ? <>公開ホームページが <a href={`/${shop_id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-rose-500 underline">qraku.com/{shop_id}</a> で公開中です。内装・外観・周辺情報を充実させて集客アップ。</>
                                    : <>無料の公開ホームページを有効にすると、お客様が訪れる専用ページが作成されます。月額¥1,000割引も適用されます。</>
                                }
                            </p>
                        </div>
                        <button
                            onClick={() => navigate(`/${shop_id}/admin/homepage`)}
                            className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition-all uppercase text-xs tracking-widest flex items-center gap-1 shrink-0"
                        >
                            設定 <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </button>
                    </div>
                </section>

                {/* ════════ 0.6 Generate Table QRs ════════ */}
                <section className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border-2 border-dashed border-adminprimary/30 p-8 text-center">
                    <span className="material-symbols-outlined text-5xl text-adminprimary/40 mb-3">qr_code_scanner</span>
                    <h4 className="text-lg font-bold mb-2">Generate Table QRs</h4>
                    <p className="text-sm text-slate-500 mb-4 max-w-xs mx-auto">テーブルごとのQRコードを美しいデザインで作成できます。</p>
                    <button onClick={() => navigate(`/${shop_id}/admin/qr-builder`)}
                        className="bg-adminprimary text-white font-bold px-6 py-2.5 rounded-xl shadow-md hover:bg-indigo-700 transition-all uppercase text-xs tracking-widest">
                        Launch QR Builder
                    </button>
                </section>

                {/* ════════ 0.7 スタッフ画面の表示設定 ════════ */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">display_settings</span>
                        スタッフ画面の表示設定
                    </h4>
                    <p className="text-xs text-slate-400 mb-4">各ディスプレイ画面の有効 / 無効を切り替えます。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { key: 'use_kitchen_page', label: 'Kitchen', icon: 'kitchen', desc: 'キッチンディスプレイ(KDS)画面' },
                            { key: 'use_register_page', label: 'Register', icon: 'point_of_sale', desc: '卓番管理・レジカウンター画面' },
                            { key: 'use_staff_page', label: 'Staff', icon: 'concierge', desc: 'ホールスタッフ向けモバイル画面' },
                        ].map(item => {
                            const on = storeData?.display_settings?.[item.key] !== false
                            return (
                                <button key={item.key} onClick={() => handleDisplayToggle(item.key)}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all ${on ? 'border-adminprimary/50 bg-adminprimary/5' : 'border-slate-200 opacity-60'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="material-symbols-outlined text-adminprimary">{item.icon}</span>
                                        <span className="font-black text-sm">{item.label}</span>
                                        <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full ${on ? 'bg-adminprimary text-white' : 'bg-slate-200 text-slate-500'}`}>
                                            {on ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">{item.desc}</p>
                                </button>
                            )
                        })}
                    </div>
                </section>

                {/* Staff Page URLs */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Staff Page URLs</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { label: 'レジページ', path: 'register' },
                            { label: 'キッチンページ', path: 'kitchen' },
                            { label: 'スタッフページ', path: 'staff' },
                        ].map(p => (
                            <div key={p.path} className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs font-bold text-slate-600 mb-1">{p.label}</p>
                                <p className="text-[11px] font-mono text-adminprimary break-all">qraku.com/{shop_id}/{p.path}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* ════════ Floating Chat Button + Panel ════════ */}
            <AdminChatWidget storeData={storeData} shop_id={shop_id} />
        </div>
    )
}


// ─── Admin Chat Widget (Floating) ────────────────────────────────────
function AdminChatWidget({ storeData, shop_id }) {
    const [open, setOpen] = useState(false)
    const [tab, setTab] = useState('chat') // chat | announcements
    const [messages, setMessages] = useState([])
    const [announcements, setAnnouncements] = useState([])
    const [newMsg, setNewMsg] = useState('')
    const [unread, setUnread] = useState(0)
    const [sending, setSending] = useState(false)

    // Poll for unread count
    useEffect(() => {
        if (!storeData?.id) return
        const check = async () => {
            try {
                const res = await axios.get(`/api/messaging/unread-count/${storeData.id}`)
                setUnread(res.data.unread_messages || 0)
            } catch {}
        }
        check()
        const interval = setInterval(check, 30000)
        return () => clearInterval(interval)
    }, [storeData?.id])

    // Load data when panel opens
    useEffect(() => {
        if (!open || !storeData?.id) return
        const load = async () => {
            try {
                const [msgRes, annRes] = await Promise.all([
                    axios.get(`/api/messaging/messages/${storeData.id}`),
                    axios.get('/api/messaging/announcements'),
                ])
                setMessages(msgRes.data)
                setAnnouncements(annRes.data)
                setUnread(0)
            } catch (e) { console.error(e) }
        }
        load()
    }, [open, storeData?.id])

    const handleSend = async () => {
        if (!newMsg.trim() || sending) return
        setSending(true)
        try {
            await axios.post(`/api/messaging/messages/${storeData.id}`, { content: newMsg.trim() })
            setNewMsg('')
            // Reload messages
            const res = await axios.get(`/api/messaging/messages/${storeData.id}`)
            setMessages(res.data)
        } catch (e) { console.error(e) }
        setSending(false)
    }

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-adminprimary text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all flex items-center justify-center"
            >
                <span className="material-symbols-outlined text-2xl">chat</span>
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                        {unread}
                    </span>
                )}
            </button>

            {/* Chat Panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
                        onClick={() => setOpen(false)}
                    >
                        <motion.div
                            initial={{ y: 100, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 100, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 25 }}
                            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
                            style={{ height: 'min(85vh, 600px)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="bg-adminprimary text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-xl">support_agent</span>
                                    <div>
                                        <p className="text-sm font-bold">QRaku サポート</p>
                                        <p className="text-[10px] opacity-80">お問い合わせ・お知らせ</p>
                                    </div>
                                </div>
                                <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-slate-200 flex-shrink-0">
                                <button
                                    onClick={() => setTab('chat')}
                                    className={`flex-1 py-2.5 text-xs font-bold transition-all ${tab === 'chat' ? 'text-adminprimary border-b-2 border-adminprimary' : 'text-slate-400'}`}
                                >
                                    💬 お問い合わせ
                                </button>
                                <button
                                    onClick={() => setTab('announcements')}
                                    className={`flex-1 py-2.5 text-xs font-bold transition-all ${tab === 'announcements' ? 'text-adminprimary border-b-2 border-adminprimary' : 'text-slate-400'}`}
                                >
                                    📢 お知らせ {announcements.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-rose-100 text-rose-500 text-[10px] rounded-full">{announcements.length}</span>}
                                </button>
                            </div>

                            {/* Content */}
                            {tab === 'chat' ? (
                                <>
                                    {/* Messages */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {messages.length === 0 && (
                                            <div className="text-center py-12">
                                                <span className="material-symbols-outlined text-5xl text-slate-200 mb-2 block">forum</span>
                                                <p className="text-sm text-slate-400">メッセージはまだありません</p>
                                                <p className="text-xs text-slate-300 mt-1">お気軽にお問い合わせください</p>
                                            </div>
                                        )}
                                        {messages.map(m => (
                                            <div key={m.id} className={`flex ${m.sender_type === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                                                    m.sender_type === 'ADMIN'
                                                        ? 'bg-adminprimary text-white rounded-br-md'
                                                        : 'bg-slate-100 text-slate-800 rounded-bl-md'
                                                }`}>
                                                    {m.sender_type === 'SUPER_ADMIN' && (
                                                        <p className="text-[10px] font-bold text-adminprimary mb-1">QRaku サポート</p>
                                                    )}
                                                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                                                    <p className={`text-[10px] mt-1 ${m.sender_type === 'ADMIN' ? 'text-white/60' : 'text-slate-400'}`}>
                                                        {new Date(m.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Input */}
                                    <div className="border-t border-slate-200 p-3 flex gap-2 flex-shrink-0">
                                        <input
                                            type="text"
                                            value={newMsg}
                                            onChange={e => setNewMsg(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                            placeholder="メッセージを入力..."
                                            className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-adminprimary/30"
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={!newMsg.trim() || sending}
                                            className="px-4 py-2.5 bg-adminprimary text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-40"
                                        >
                                            <span className="material-symbols-outlined text-lg">send</span>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                /* Announcements */
                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {announcements.length === 0 && (
                                        <div className="text-center py-12">
                                            <span className="material-symbols-outlined text-5xl text-slate-200 mb-2 block">campaign</span>
                                            <p className="text-sm text-slate-400">お知らせはありません</p>
                                        </div>
                                    )}
                                    {announcements.map(a => (
                                        <div key={a.id} className={`p-4 rounded-xl border ${a.is_important ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                {a.is_important && <span className="text-[10px] px-1.5 py-0.5 bg-rose-500 text-white rounded-full font-bold">重要</span>}
                                                <h4 className="text-sm font-bold text-slate-800">{a.title}</h4>
                                            </div>
                                            <p className="text-xs text-slate-600 whitespace-pre-wrap">{a.content}</p>
                                            <p className="text-[10px] text-slate-400 mt-2">
                                                {new Date(a.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}