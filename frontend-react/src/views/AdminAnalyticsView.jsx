import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useLanguage } from '../context/LanguageContext'
import { currencyHelpers } from '../config/currency'

export default function AdminAnalyticsView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const { setLanguage } = useLanguage()

    const [days, setDays] = useState(7)
    const [loading, setLoading] = useState(true)
    const [storeId, setStoreId] = useState(null) // numeric store id for future use

    const [summary, setSummary] = useState({ total_sales: 0, total_orders: 0, avg_order_value: 0 })
    const [dailyData, setDailyData] = useState([])
    const [hourlyData, setHourlyData] = useState([])
    const [topMenus, setTopMenus] = useState([])
    const [storeMeta, setStoreMeta] = useState(null)

    const fetchAll = useCallback(async (selectedDays) => {
        setLoading(true)
        try {
            const [sumRes, dailyRes, hourlyRes, menuRes] = await Promise.all([
                axios.get('/api/stats/summary', { params: { shop_id, days: selectedDays } }),
                axios.get('/api/stats/daily', { params: { shop_id, days: selectedDays } }),
                axios.get('/api/stats/hourly', { params: { shop_id } }),
                axios.get('/api/stats/top-menus', { params: { shop_id, days: selectedDays, limit: 5 } }),
            ])
            setSummary(sumRes.data)
            setDailyData(Array.isArray(dailyRes.data) ? dailyRes.data : [])
            setHourlyData(Array.isArray(hourlyRes.data) ? hourlyRes.data : [])
            setTopMenus(Array.isArray(menuRes.data) ? menuRes.data : [])
        } catch (e) {
            console.error('Analytics fetch error:', e)
        } finally {
            setLoading(false)
        }
    }, [shop_id])

    useEffect(() => {
        setLanguage('ja')
        fetchAll(days)
        const id = setInterval(() => fetchAll(days), 60000)
        return () => clearInterval(id)
    }, [shop_id, days, fetchAll, setLanguage])

    // 통화 메타(심볼/소수) — 분석 뷰는 store 를 직접 fetch (CurrencyProvider 밖)
    useEffect(() => {
        if (!shop_id) return
        axios.get(`/api/stores/${shop_id}`).then(r => setStoreMeta(r.data)).catch(() => {})
    }, [shop_id])

    /* ── helpers ── */
    const cur = currencyHelpers(storeMeta)
    const fmt = (num) => Number(num || 0).toLocaleString()
    const fmtYen = (num) => cur.fmt(num)

    // 일별 바 차트: 최대값 대비 비율 계산
    const maxSales = Math.max(...dailyData.map(d => d.sales), 1)

    // 시간대별 히트맵: 최대 count 대비 강도
    const maxHourly = Math.max(...hourlyData.map(d => d.count), 1)

    // 시간대에 따른 배경색 강도
    const heatColor = (count) => {
        const ratio = count / maxHourly
        if (ratio === 0) return 'bg-slate-100 text-slate-400'
        if (ratio < 0.25) return 'bg-pink-100 text-pink-600'
        if (ratio < 0.5) return 'bg-pink-200 text-pink-700'
        if (ratio < 0.75) return 'bg-adminprimary/40 text-pink-800'
        return 'bg-adminprimary text-white font-bold'
    }

    // 요일 약칭
    const dayLabel = (dateStr) => {
        const days = ['일', '월', '화', '수', '목', '금', '토']
        return days[new Date(dateStr).getDay()]
    }

    // CSV 다운로드
    const handleDownloadCSV = () => {
        // 일별 data CSV
        const header = `Date,Sales (${cur.symbol}),Orders\n`
        const body = dailyData.map(d => `${d.day},${cur.toMajorString(d.sales)},${d.orders}`).join('\n')
        const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `analytics_${shop_id}_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    // 인기 메뉴 이름 (다국어 우선순위)
    const menuName = (item) => item.name_ko || item.name_jp || item.name_en || `Item #${item.menu_item_id}`

    /* ── render ── */
    return (
        <div className="flex h-screen overflow-hidden bg-[#f8f6f6] text-slate-900 font-display">
            <style>{`.tsubaki-pattern { background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='3' fill='%23c21e2f' fill-opacity='0.05'/%3E%3Ccircle cx='10' cy='10' r='2' fill='%23c21e2f' fill-opacity='0.04'/%3E%3Ccircle cx='50' cy='50' r='2' fill='%23c21e2f' fill-opacity='0.04'/%3E%3C/svg%3E"); }`}</style>

            <main className="flex-1 flex flex-col overflow-y-auto tsubaki-pattern scroll-smooth">
                {/* ── HEADER ── */}
                <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-adminprimary/20 px-4 md:px-10 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/${shop_id}/admin`)}>
                            <div className="size-10 bg-adminprimary/20 rounded-full flex items-center justify-center text-adminprimary">
                                <span className="material-symbols-outlined text-2xl">spa</span>
                            </div>
                            <div className="hidden md:block">
                                <h1 className="text-xl font-extrabold tracking-tight uppercase">Tsubaki Admin</h1>
                                <p className="text-xs text-slate-500 font-medium">Kitchen Operations</p>
                            </div>
                        </div>
                        <nav className="hidden lg:flex items-center gap-6 ml-6">
                            <a className="text-sm font-semibold text-slate-500 hover:text-adminprimary transition-colors cursor-pointer" onClick={() => navigate(`/${shop_id}/admin`)}>Dashboard</a>
                            <a className="text-sm font-semibold text-slate-500 hover:text-adminprimary transition-colors cursor-pointer" onClick={() => navigate(`/${shop_id}/admin/menu`)}>Menu</a>
                            <a className="text-sm font-semibold text-slate-500 hover:text-adminprimary transition-colors cursor-pointer" onClick={() => navigate(`/${shop_id}/admin/orders`)}>Orders</a>
                            <a className="text-sm font-bold text-adminprimary border-b-2 border-adminprimary pb-1 cursor-pointer">Analytics</a>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                    </div>
                </header>

                <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">

                    {/* ── 제목 + 필터 ── */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
                                <span className="material-symbols-outlined text-3xl text-adminprimary">monitoring</span>
                                Store Analytics
                            </h2>
                            <p className="text-slate-500 mt-1 text-sm">실제 주문 데이터 기반 매출 분석</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* 기간 필터 버튼 */}
                            <div className="flex rounded-xl border border-adminprimary/20 overflow-hidden bg-white shadow-sm">
                                {[
                                    { label: '오늘', value: 1 },
                                    { label: '7일', value: 7 },
                                    { label: '30일', value: 30 },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setDays(opt.value)}
                                        className={`px-4 py-2 text-xs font-bold transition-all ${days === opt.value ? 'bg-adminprimary text-white' : 'text-slate-500 hover:bg-adminprimary/10'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleDownloadCSV}
                                className="flex items-center gap-2 bg-white border border-adminprimary/20 px-4 py-2 rounded-xl text-xs font-bold text-adminprimary hover:bg-adminprimary/10 transition-all shadow-sm"
                            >
                                <span className="material-symbols-outlined text-sm">cloud_download</span>
                                CSV
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <div className="w-12 h-12 rounded-full border-4 border-adminprimary/20 border-t-adminprimary animate-spin mx-auto mb-3"></div>
                                <p className="text-sm text-slate-400 font-medium">데이터 불러오는 중...</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ── KPI 카드 3개 ── */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {[
                                    {
                                        label: '총 매출',
                                        value: fmtYen(summary.total_sales),
                                        icon: 'payments',
                                        trend: summary.total_orders > 0 ? 'up' : null,
                                    },
                                    {
                                        label: '총 주문 수',
                                        value: `${fmt(summary.total_orders)}건`,
                                        icon: 'receipt_long',
                                        trend: summary.total_orders > 0 ? 'up' : null,
                                    },
                                    {
                                        label: '평균 객단가',
                                        value: fmtYen(summary.avg_order_value),
                                        icon: 'shopping_basket',
                                        trend: null,
                                    },
                                ].map((card, i) => (
                                    <div key={i} className="bg-white rounded-2xl border border-adminprimary/10 p-6 relative overflow-hidden shadow-sm">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{card.label}</p>
                                        <p className="text-3xl font-extrabold">{card.value}</p>
                                        {card.trend === 'up' && (
                                            <div className="flex items-center gap-1 mt-3 text-emerald-500 text-xs font-bold">
                                                <span className="material-symbols-outlined text-sm">trending_up</span>
                                                <span>최근 {days}일</span>
                                            </div>
                                        )}
                                        {!card.trend && (
                                            <div className="flex items-center gap-1 mt-3 text-slate-400 text-xs font-medium">
                                                <span className="material-symbols-outlined text-sm">calendar_today</span>
                                                <span>최근 {days}일 기준</span>
                                            </div>
                                        )}
                                        <span className="material-symbols-outlined absolute right-5 top-1/2 -translate-y-1/2 text-[80px] text-adminprimary/5">{card.icon}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── 일별 매출 바 차트 + 인기 메뉴 Top 5 ── */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                {/* 일별 매출 바 차트 */}
                                <div className="bg-white rounded-2xl border border-adminprimary/10 p-6 shadow-sm">
                                    <h3 className="font-bold text-base mb-1">일별 매출</h3>
                                    <p className="text-xs text-slate-400 mb-5">최근 {days}일간 매출 추이</p>

                                    {dailyData.length === 0 ? (
                                        <div className="h-48 flex flex-col items-center justify-center text-slate-300 gap-2">
                                            <span className="material-symbols-outlined text-4xl">bar_chart</span>
                                            <p className="text-xs">해당 기간의 주문 데이터가 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="flex items-end gap-1.5 h-44 relative">
                                            {/* 그리드 라인 */}
                                            <div className="absolute inset-0 flex flex-col justify-between pb-6 pointer-events-none">
                                                {[0, 1, 2, 3].map(i => (
                                                    <div key={i} className="border-t border-dashed border-slate-100 w-full" />
                                                ))}
                                            </div>

                                            {dailyData.map((d, i) => {
                                                const heightPct = Math.max((d.sales / maxSales) * 100, 4)
                                                return (
                                                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5 z-10 group">
                                                        <div
                                                            className="w-full rounded-t-md bg-adminprimary/50 group-hover:bg-adminprimary transition-colors relative"
                                                            style={{ height: `${heightPct}%` }}
                                                        >
                                                            {/* 툴팁 */}
                                                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                                                {fmtYen(d.sales)}<br />
                                                                <span className="font-normal opacity-70">{d.orders}건</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-center">
                                                            <span className="text-[9px] font-bold text-slate-400">{dayLabel(d.day)}</span>
                                                            <br />
                                                            <span className="text-[8px] text-slate-300">{d.day?.slice(5)}</span>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* 인기 메뉴 Top 5 */}
                                <div className="bg-white rounded-2xl border border-adminprimary/10 p-6 shadow-sm flex flex-col">
                                    <h3 className="font-bold text-base mb-1 text-adminprimary">인기 메뉴 Top 5</h3>
                                    <p className="text-xs text-slate-400 mb-5">최근 {days}일간 판매량 기준</p>

                                    {topMenus.length === 0 ? (
                                        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2">
                                            <span className="material-symbols-outlined text-4xl">restaurant_menu</span>
                                            <p className="text-xs">해당 기간의 주문 데이터가 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            {topMenus.map((item, idx) => {
                                                const barWidth = topMenus[0]?.total_qty > 0
                                                    ? Math.round((item.total_qty / topMenus[0].total_qty) * 100)
                                                    : 0
                                                return (
                                                    <div key={idx} className="flex items-center gap-3 group">
                                                        <div className="w-7 h-7 flex-shrink-0 rounded-full bg-adminprimary/10 flex items-center justify-center text-adminprimary font-extrabold text-xs">
                                                            {idx + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <p className="text-sm font-bold truncate">{menuName(item)}</p>
                                                                <p className="text-xs font-bold text-adminprimary ml-2 flex-shrink-0">{fmtYen(item.total_revenue)}</p>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-adminprimary/60 group-hover:bg-adminprimary rounded-full transition-all duration-500"
                                                                    style={{ width: `${barWidth}%` }}
                                                                />
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 mt-1">{fmt(item.total_qty)}개 판매</p>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── 시간대별 주문 히트맵 ── */}
                            <div className="bg-white rounded-2xl border border-adminprimary/10 p-6 shadow-sm">
                                <h3 className="font-bold text-base mb-1">오늘 시간대별 주문 히트맵</h3>
                                <p className="text-xs text-slate-400 mb-5">오늘 어느 시간대에 주문이 집중되는지 확인하세요</p>

                                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
                                    {hourlyData.map((h) => (
                                        <div
                                            key={h.hour}
                                            className={`rounded-xl p-2 text-center transition-all cursor-default ${heatColor(h.count)}`}
                                            title={`${h.label}: ${h.count}건`}
                                        >
                                            <p className="text-[10px] font-bold opacity-70">{h.label.slice(0, 2)}시</p>
                                            <p className="text-base font-extrabold leading-tight">{h.count}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* 범례 */}
                                <div className="flex items-center gap-3 mt-4 justify-end">
                                    <span className="text-[10px] text-slate-400 font-medium">낮음</span>
                                    {['bg-slate-100', 'bg-pink-100', 'bg-pink-200', 'bg-adminprimary/40', 'bg-adminprimary'].map((cls, i) => (
                                        <div key={i} className={`w-5 h-3 rounded ${cls}`} />
                                    ))}
                                    <span className="text-[10px] text-slate-400 font-medium">높음</span>
                                </div>
                            </div>

                        </>
                    )}
                </div>
            </main>
        </div>
    )
}
