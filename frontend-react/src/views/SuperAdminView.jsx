import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import axios from 'axios'
import {
    LayoutDashboard, Store as StoreIcon, Settings, TrendingUp, Users, CreditCard,
    Activity, Save, RefreshCw, Languages, AlertCircle, CheckCircle2,
    Search, ChevronRight, X, Clock, Calendar, ArrowUpRight, ArrowDownRight,
    Package, UtensilsCrossed, QrCode, MapPin, Phone, ExternalLink,
    CalendarPlus, Shield, Zap, Eye, ChevronDown, BarChart3, Timer,
    MessageCircle, Send, Megaphone, Trash2, ArrowLeft, Plus, Bell
} from 'lucide-react'

// ──────────────────────────────────────────────────
// Helper: days remaining text
// ──────────────────────────────────────────────────
function daysLeftText(days) {
    if (days === null || days === undefined) return '—'
    if (days < 0) return `${Math.abs(days)}日超過`
    if (days === 0) return '本日満了'
    return `残り${days}日`
}

function daysLeftColor(days) {
    if (days === null || days === undefined) return 'text-slate-500'
    if (days < 0) return 'text-rose-400'
    if (days <= 3) return 'text-rose-400'
    if (days <= 7) return 'text-amber-400'
    return 'text-emerald-400'
}

function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatCurrency(val) {
    return `¥${(val || 0).toLocaleString()}`
}

function timeAgo(iso) {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}分前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}時間前`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}日前`
    return formatDate(iso)
}


export default function SuperAdminView() {
    const [stats, setStats] = useState(null)
    const [stores, setStores] = useState([])
    const [configs, setConfigs] = useState({})
    const [loading, setLoading] = useState(true)
    const [savingConfig, setSavingConfig] = useState(false)
    const [geminiKey, setGeminiKey] = useState('')
    const [qrBaseUrl, setQrBaseUrl] = useState('')
    const [activeTab, setActiveTab] = useState('dashboard')
    const [feedback, setFeedback] = useState({ type: '', message: '' })

    // Stores tab state
    const [storeSearch, setStoreSearch] = useState('')
    const [storeFilter, setStoreFilter] = useState('ALL') // ALL, ACTIVE, TRIAL, EXPIRED
    const [selectedStore, setSelectedStore] = useState(null)
    const [storeDetail, setStoreDetail] = useState(null)
    const [loadingDetail, setLoadingDetail] = useState(false)

    // Subscription tab state
    const [subSummary, setSubSummary] = useState(null)
    const [extendStoreId, setExtendStoreId] = useState(null)
    const [extendDays, setExtendDays] = useState(30)
    const [extending, setExtending] = useState(false)

    // Analytics
    const [revenueData, setRevenueData] = useState([])
    const [storeRanking, setStoreRanking] = useState([])

    // Messaging tab state
    const [conversations, setConversations] = useState([])
    const [selectedConvo, setSelectedConvo] = useState(null) // store_id
    const [convoMessages, setConvoMessages] = useState([])
    const [convoStoreName, setConvoStoreName] = useState('')
    const [replyText, setReplyText] = useState('')
    const [sendingReply, setSendingReply] = useState(false)
    const [announcements, setAnnouncements] = useState([])
    const [msgSubTab, setMsgSubTab] = useState('conversations') // conversations | announcements
    const [newAnnTitle, setNewAnnTitle] = useState('')
    const [newAnnContent, setNewAnnContent] = useState('')
    const [newAnnImportant, setNewAnnImportant] = useState(false)
    const [creatingAnn, setCreatingAnn] = useState(false)
    const [showAnnForm, setShowAnnForm] = useState(false)
    const [totalUnread, setTotalUnread] = useState(0)
    const chatEndRef = useRef(null)

    useEffect(() => { fetchData() }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [statsRes, storesRes, configRes] = await Promise.all([
                axios.get('/api/super-admin/stats'),
                axios.get('/api/super-admin/stores'),
                axios.get('/api/super-admin/config')
            ])
            setStats(statsRes.data)
            setStores(storesRes.data)
            setConfigs(configRes.data)
            setGeminiKey(configRes.data.GEMINI_API_KEY || '')
            setQrBaseUrl(configRes.data.QR_BASE_URL || 'http://localhost:5173')
        } catch (e) {
            console.error("Failed to fetch super admin data", e)
            showFeedback('error', 'データの読み込みに失敗しました')
        } finally {
            setLoading(false)
        }
    }

    const fetchSubscriptionSummary = async () => {
        try {
            const res = await axios.get('/api/super-admin/subscription-summary')
            setSubSummary(res.data)
        } catch (e) { console.error(e) }
    }

    const fetchAnalytics = async () => {
        try {
            const [revRes, rankRes] = await Promise.all([
                axios.get('/api/super-admin/analytics/revenue?days=30'),
                axios.get('/api/super-admin/analytics/store-ranking?days=30'),
            ])
            setRevenueData(revRes.data)
            setStoreRanking(rankRes.data)
        } catch (e) { console.error(e) }
    }

    // ── Messaging functions ──
    const fetchConversations = useCallback(async () => {
        try {
            const res = await axios.get('/api/messaging/admin/conversations')
            setConversations(res.data)
            const unread = res.data.reduce((sum, c) => sum + (c.unread_count || 0), 0)
            setTotalUnread(unread)
        } catch (e) { console.error(e) }
    }, [])

    const fetchConvoMessages = useCallback(async (storeId) => {
        try {
            const res = await axios.get(`/api/messaging/admin/messages/${storeId}`)
            setConvoMessages(res.data.messages || [])
            setConvoStoreName(res.data.store_name || `Store #${storeId}`)
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        } catch (e) { console.error(e) }
    }, [])

    const fetchAnnouncements = useCallback(async () => {
        try {
            const res = await axios.get('/api/messaging/announcements')
            setAnnouncements(res.data)
        } catch (e) { console.error(e) }
    }, [])

    const handleSendReply = async () => {
        if (!replyText.trim() || sendingReply || !selectedConvo) return
        setSendingReply(true)
        try {
            await axios.post(`/api/messaging/admin/messages/${selectedConvo}`, { content: replyText.trim() })
            setReplyText('')
            await fetchConvoMessages(selectedConvo)
            await fetchConversations()
        } catch (e) {
            console.error(e)
            showFeedback('error', 'メッセージ送信に失敗しました')
        } finally {
            setSendingReply(false)
        }
    }

    const handleCreateAnnouncement = async () => {
        if (!newAnnTitle.trim() || !newAnnContent.trim() || creatingAnn) return
        setCreatingAnn(true)
        try {
            await axios.post('/api/messaging/admin/announcements', {
                title: newAnnTitle.trim(),
                content: newAnnContent.trim(),
                is_important: newAnnImportant,
            })
            setNewAnnTitle('')
            setNewAnnContent('')
            setNewAnnImportant(false)
            setShowAnnForm(false)
            showFeedback('success', '公告を作成しました')
            await fetchAnnouncements()
        } catch (e) {
            showFeedback('error', '公告作成に失敗しました')
        } finally {
            setCreatingAnn(false)
        }
    }

    const handleDeleteAnnouncement = async (annId) => {
        if (!confirm('この公告を削除しますか？')) return
        try {
            await axios.delete(`/api/messaging/admin/announcements/${annId}`)
            showFeedback('success', '公告を削除しました')
            await fetchAnnouncements()
        } catch (e) {
            showFeedback('error', '削除に失敗しました')
        }
    }

    const openConversation = (storeId) => {
        setSelectedConvo(storeId)
        fetchConvoMessages(storeId)
    }

    useEffect(() => {
        if (activeTab === 'subscription') fetchSubscriptionSummary()
        if (activeTab === 'dashboard') fetchAnalytics()
        if (activeTab === 'messaging') {
            fetchConversations()
            fetchAnnouncements()
        }
    }, [activeTab])

    // Auto-refresh conversations when messaging tab is active
    useEffect(() => {
        if (activeTab !== 'messaging') return
        const interval = setInterval(fetchConversations, 15000)
        return () => clearInterval(interval)
    }, [activeTab, fetchConversations])

    // Auto-refresh selected conversation messages
    useEffect(() => {
        if (activeTab !== 'messaging' || !selectedConvo) return
        const interval = setInterval(() => fetchConvoMessages(selectedConvo), 10000)
        return () => clearInterval(interval)
    }, [activeTab, selectedConvo, fetchConvoMessages])

    const showFeedback = (type, message) => {
        setFeedback({ type, message })
        setTimeout(() => setFeedback({ type: '', message: '' }), 3000)
    }

    const handleSaveConfig = async () => {
        setSavingConfig(true)
        try {
            await Promise.all([
                axios.post('/api/super-admin/config', null, { params: { key: 'GEMINI_API_KEY', value: geminiKey } }),
                axios.post('/api/super-admin/config', null, { params: { key: 'QR_BASE_URL', value: qrBaseUrl } })
            ])
            showFeedback('success', '設定を保存しました')
            fetchData()
        } catch (e) {
            showFeedback('error', '設定の保存に失敗しました')
        } finally {
            setSavingConfig(false)
        }
    }

    const updateStoreStatus = async (storeId, status) => {
        try {
            await axios.patch(`/api/super-admin/stores/${storeId}`, null, { params: { status } })
            showFeedback('success', 'ステータスを更新しました')
            fetchData()
            if (activeTab === 'subscription') fetchSubscriptionSummary()
        } catch (e) {
            showFeedback('error', 'ステータスの更新に失敗しました')
        }
    }

    const handleExtendSubscription = async (storeId) => {
        setExtending(true)
        try {
            await axios.patch(`/api/super-admin/stores/${storeId}`, null, {
                params: { extend_days: extendDays }
            })
            showFeedback('success', `${extendDays}日間延長しました`)
            setExtendStoreId(null)
            fetchData()
            fetchSubscriptionSummary()
        } catch (e) {
            showFeedback('error', '延長に失敗しました')
        } finally {
            setExtending(false)
        }
    }

    const openStoreDetail = async (store) => {
        setSelectedStore(store)
        setLoadingDetail(true)
        try {
            const res = await axios.get(`/api/super-admin/stores/${store.id}/detail`)
            setStoreDetail(res.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingDetail(false)
        }
    }

    // Filtered stores
    const filteredStores = useMemo(() => {
        let list = stores
        if (storeFilter !== 'ALL') {
            list = list.filter(s => s.subscription_status === storeFilter)
        }
        if (storeSearch.trim()) {
            const q = storeSearch.toLowerCase()
            list = list.filter(s =>
                (s.name || '').toLowerCase().includes(q) ||
                (s.slug || '').toLowerCase().includes(q) ||
                (s.owner_name || '').toLowerCase().includes(q)
            )
        }
        return list
    }, [stores, storeFilter, storeSearch])

    // Revenue chart max for bar heights
    const revenueMax = useMemo(() => Math.max(...revenueData.map(d => d.revenue), 1), [revenueData])

    if (loading && !stats) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">
                <RefreshCw className="animate-spin mr-2" size={20} /> <span className="text-sm">Loading...</span>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#050505] text-slate-200 font-sans flex overflow-hidden">
            {/* ── Sidebar ── */}
            <aside className="w-60 bg-slate-900/50 border-r border-white/5 flex flex-col shrink-0">
                <div className="p-5 border-b border-white/5">
                    <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                        Super Admin
                    </h1>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Platform Control</p>
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {[
                        { key: 'dashboard', icon: <LayoutDashboard size={17} />, label: 'Dashboard' },
                        { key: 'stores', icon: <StoreIcon size={17} />, label: 'Stores' },
                        { key: 'messaging', icon: <MessageCircle size={17} />, label: 'Messages', badge: totalUnread },
                        { key: 'subscription', icon: <CreditCard size={17} />, label: 'Subscription' },
                        { key: 'settings', icon: <Settings size={17} />, label: 'Settings' },
                    ].map(t => (
                        <button key={t.key} onClick={() => setActiveTab(t.key)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === t.key
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                            }`}
                        >
                            {t.icon}
                            <span className="flex-1 text-left">{t.label}</span>
                            {t.badge > 0 && (
                                <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full min-w-[18px] text-center animate-pulse">
                                    {t.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/5">
                    <div className="flex items-center gap-3 px-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold">SA</div>
                        <div>
                            <p className="text-xs font-bold text-white">Super Admin</p>
                            <p className="text-[10px] text-slate-500">Root Access</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* ── Main ── */}
            <main className="flex-1 overflow-y-auto">
                {/* Header */}
                <header className="h-16 border-b border-white/5 px-6 flex items-center justify-between sticky top-0 bg-[#050505]/90 backdrop-blur-md z-30">
                    <div className="flex items-center gap-3">
                        <h2 className="text-base font-bold text-white capitalize">{activeTab}</h2>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-tight">Online</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {feedback.message && (
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${feedback.type === 'success'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                                {feedback.type === 'success' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                                {feedback.message}
                            </div>
                        )}
                        <button onClick={fetchData} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors" title="Refresh">
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </header>

                <div className="p-6 max-w-7xl mx-auto space-y-6">

                    {/* ══════════════════════ DASHBOARD ══════════════════════ */}
                    {activeTab === 'dashboard' && stats && (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <MiniCard icon={<StoreIcon size={18} className="text-indigo-400" />} label="全店舗" value={stats.total_stores}
                                    sub={<span className="text-emerald-400">Active {stats.active_stores}</span>} />
                                <MiniCard icon={<Activity size={18} className="text-cyan-400" />} label="総注文数" value={stats.total_orders.toLocaleString()}
                                    sub={<span className="text-white/40">7日間 {stats.orders_7d}</span>} />
                                <MiniCard icon={<TrendingUp size={18} className="text-emerald-400" />} label="総売上" value={formatCurrency(stats.total_revenue)}
                                    sub={<span className="text-white/40">7日間 {formatCurrency(stats.revenue_7d)}</span>} />
                                <MiniCard icon={<Users size={18} className="text-amber-400" />} label="顧客数" value={stats.total_customers.toLocaleString()}
                                    sub={<span className="text-white/40">メニュー {stats.total_menus} / テーブル {stats.total_tables}</span>} />
                            </div>

                            {/* Subscription Breakdown */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
                                    <p className="text-2xl font-black text-emerald-400">{stats.active_stores}</p>
                                    <p className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-widest mt-1">Active</p>
                                </div>
                                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 text-center">
                                    <p className="text-2xl font-black text-indigo-400">{stats.trial_stores}</p>
                                    <p className="text-[10px] font-bold text-indigo-500/60 uppercase tracking-widest mt-1">Trial</p>
                                </div>
                                <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 text-center">
                                    <p className="text-2xl font-black text-rose-400">{stats.expired_stores}</p>
                                    <p className="text-[10px] font-bold text-rose-500/60 uppercase tracking-widest mt-1">Expired</p>
                                </div>
                            </div>

                            {/* Revenue Chart (Bar) */}
                            <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-white">売上推移（30日間）</h3>
                                        <p className="text-[10px] text-slate-500 mt-0.5">日別売上と注文数</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-black text-white">{formatCurrency(stats.revenue_30d)}</p>
                                        <p className="text-[10px] text-slate-500">{stats.orders_30d} orders</p>
                                    </div>
                                </div>
                                {revenueData.length > 0 ? (
                                    <div className="flex items-end gap-[2px] h-32">
                                        {revenueData.map((d, i) => (
                                            <div key={i} className="flex-1 group relative">
                                                <div
                                                    className="w-full bg-indigo-500/40 hover:bg-indigo-400/60 rounded-t transition-colors cursor-pointer"
                                                    style={{ height: `${Math.max((d.revenue / revenueMax) * 100, 2)}%` }}
                                                    title={`${d.date}\n${formatCurrency(d.revenue)} / ${d.orders}件`}
                                                />
                                                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-[9px] text-white px-2 py-1 rounded whitespace-nowrap z-10 border border-white/10">
                                                    {d.date.slice(5)}<br />{formatCurrency(d.revenue)}<br />{d.orders}件
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-32 flex items-center justify-center text-slate-600 text-sm">データなし</div>
                                )}
                            </div>

                            {/* Store Ranking */}
                            {storeRanking.length > 0 && (
                                <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-5">
                                    <h3 className="text-sm font-bold text-white mb-3">店舗ランキング（30日間売上）</h3>
                                    <div className="space-y-2">
                                        {storeRanking.slice(0, 10).map((s, i) => (
                                            <div key={s.shop_id} className="flex items-center gap-3">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-amber-500/20 text-amber-400' : i === 1 ? 'bg-slate-400/20 text-slate-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-white/40'}`}>
                                                    {i + 1}
                                                </span>
                                                <span className="flex-1 text-xs font-medium text-white truncate">{s.store_name}</span>
                                                <span className="text-xs font-bold text-indigo-300">{formatCurrency(s.revenue)}</span>
                                                <span className="text-[10px] text-white/30">{s.orders}件</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ══════════════════════ STORES ══════════════════════ */}
                    {activeTab === 'stores' && (
                        <>
                            {/* Search & Filter */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        value={storeSearch} onChange={e => setStoreSearch(e.target.value)}
                                        placeholder="店舗名・Slug・オーナーで検索..."
                                        className="w-full pl-9 pr-4 py-2.5 bg-slate-900/50 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                                    />
                                </div>
                                <div className="flex gap-1.5">
                                    {['ALL', 'ACTIVE', 'TRIAL', 'EXPIRED'].map(f => (
                                        <button key={f} onClick={() => setStoreFilter(f)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${storeFilter === f
                                                ? f === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                                                : f === 'TRIAL' ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'
                                                : f === 'EXPIRED' ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30'
                                                : 'bg-white/10 text-white'
                                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                            }`}
                                        >
                                            {f === 'ALL' ? `全て (${stores.length})` :
                                             f === 'ACTIVE' ? `Active (${stores.filter(s => s.subscription_status === 'ACTIVE').length})` :
                                             f === 'TRIAL' ? `Trial (${stores.filter(s => s.subscription_status === 'TRIAL').length})` :
                                             `Expired (${stores.filter(s => s.subscription_status === 'EXPIRED').length})`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Store Cards */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {filteredStores.map(store => (
                                    <div key={store.id}
                                        onClick={() => openStoreDetail(store)}
                                        className="bg-slate-900/40 rounded-2xl border border-white/5 hover:border-indigo-500/20 p-4 cursor-pointer transition-all hover:bg-slate-900/60 group"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-bold text-white truncate">{store.name}</h3>
                                                    {store.is_open && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                                                </div>
                                                <p className="text-[10px] text-slate-500 mt-0.5">
                                                    {store.slug} · {store.owner_name || store.owner_id} · {store.category}
                                                </p>
                                            </div>
                                            <StatusBadge status={store.subscription_status} />
                                        </div>

                                        <div className="grid grid-cols-4 gap-3 mb-3">
                                            <div>
                                                <p className="text-[10px] text-slate-500">売上</p>
                                                <p className="text-xs font-bold text-white">{formatCurrency(store.total_revenue)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500">注文</p>
                                                <p className="text-xs font-bold text-white">{store.total_orders}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500">メニュー</p>
                                                <p className="text-xs font-bold text-white">{store.menu_count}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500">テーブル</p>
                                                <p className="text-xs font-bold text-white">{store.table_count}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                                {store.square_connected && <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded font-bold">Square</span>}
                                                {store.takeout_enabled && <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded font-bold">テイクアウト</span>}
                                                <span>最終注文: {timeAgo(store.last_order_at)}</span>
                                            </div>
                                            <ChevronRight size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
                                        </div>
                                    </div>
                                ))}

                                {filteredStores.length === 0 && (
                                    <div className="col-span-2 py-16 text-center text-slate-500 text-sm">
                                        該当する店舗がありません
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ══════════════════════ SUBSCRIPTION ══════════════════════ */}
                    {activeTab === 'subscription' && subSummary && (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-4">
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Total</p>
                                    <p className="text-2xl font-black text-white mt-1">{subSummary.summary.total}</p>
                                </div>
                                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
                                    <p className="text-[10px] text-emerald-500/60 font-bold uppercase tracking-widest">Active</p>
                                    <p className="text-2xl font-black text-emerald-400 mt-1">{subSummary.summary.active}</p>
                                </div>
                                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4">
                                    <p className="text-[10px] text-indigo-500/60 font-bold uppercase tracking-widest">Trial</p>
                                    <p className="text-2xl font-black text-indigo-400 mt-1">{subSummary.summary.trial}</p>
                                </div>
                                <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-rose-500/60 font-bold uppercase tracking-widest">Expired</p>
                                        {subSummary.summary.expiring_soon > 0 && (
                                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[9px] font-bold animate-pulse">
                                                {subSummary.summary.expiring_soon} 期限間近
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-2xl font-black text-rose-400 mt-1">{subSummary.summary.expired}</p>
                                </div>
                            </div>

                            {/* Plan Breakdown */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-400"><Zap size={18} /></div>
                                    <div>
                                        <p className="text-lg font-black text-white">{subSummary.summary.free}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Free Plan</p>
                                    </div>
                                </div>
                                <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400"><Calendar size={18} /></div>
                                    <div>
                                        <p className="text-lg font-black text-white">{subSummary.summary.monthly}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Monthly</p>
                                    </div>
                                </div>
                                <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400"><Shield size={18} /></div>
                                    <div>
                                        <p className="text-lg font-black text-white">{subSummary.summary.yearly}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Yearly</p>
                                    </div>
                                </div>
                            </div>

                            {/* Subscription Table */}
                            <div className="bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden">
                                <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-white">全店舗サブスクリプション</h3>
                                    <span className="text-[10px] text-slate-500">{subSummary.stores.length} stores</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-white/[0.02] text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                                            <tr>
                                                <th className="px-5 py-3">店舗</th>
                                                <th className="px-5 py-3">プラン</th>
                                                <th className="px-5 py-3">ステータス</th>
                                                <th className="px-5 py-3">有効期限</th>
                                                <th className="px-5 py-3">残り</th>
                                                <th className="px-5 py-3 text-right">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.03]">
                                            {subSummary.stores.map(store => (
                                                <tr key={store.id} className={`hover:bg-white/[0.02] transition-colors ${store.is_expiring_soon ? 'bg-amber-500/[0.03]' : ''}`}>
                                                    <td className="px-5 py-3">
                                                        <p className="text-xs font-bold text-white">{store.name}</p>
                                                        <p className="text-[10px] text-slate-500">{store.owner_name || '—'}</p>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className={`text-[10px] font-bold uppercase ${
                                                            store.subscription_type === 'FREE' ? 'text-slate-400' :
                                                            store.subscription_type === 'MONTHLY' ? 'text-indigo-400' : 'text-amber-400'
                                                        }`}>{store.subscription_type}</span>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <StatusBadge status={store.subscription_status} />
                                                    </td>
                                                    <td className="px-5 py-3 text-xs text-slate-400">
                                                        {formatDate(store.subscription_expires_at)}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className={`text-xs font-bold ${daysLeftColor(store.days_left)}`}>
                                                            {daysLeftText(store.days_left)}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {extendStoreId === store.id ? (
                                                                <div className="flex items-center gap-1.5">
                                                                    <select value={extendDays} onChange={e => setExtendDays(Number(e.target.value))}
                                                                        className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white">
                                                                        <option value={7}>+7日</option>
                                                                        <option value={14}>+14日</option>
                                                                        <option value={30}>+30日</option>
                                                                        <option value={90}>+90日</option>
                                                                        <option value={365}>+365日</option>
                                                                    </select>
                                                                    <button onClick={() => handleExtendSubscription(store.id)} disabled={extending}
                                                                        className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-bold hover:bg-emerald-500/30">
                                                                        {extending ? '...' : '確認'}
                                                                    </button>
                                                                    <button onClick={() => setExtendStoreId(null)}
                                                                        className="px-2 py-1 bg-white/5 text-slate-400 rounded-lg text-[10px] hover:bg-white/10">
                                                                        取消
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <button onClick={(e) => { e.stopPropagation(); setExtendStoreId(store.id) }}
                                                                        className="px-2 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg text-[10px] font-bold hover:bg-indigo-500/20 transition-colors"
                                                                        title="延長">
                                                                        <CalendarPlus size={13} />
                                                                    </button>
                                                                    {store.subscription_status !== 'ACTIVE' && (
                                                                        <button onClick={(e) => { e.stopPropagation(); updateStoreStatus(store.id, 'ACTIVE') }}
                                                                            className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[10px] font-bold hover:bg-emerald-500/20">
                                                                            有効化
                                                                        </button>
                                                                    )}
                                                                    {store.subscription_status !== 'EXPIRED' && (
                                                                        <button onClick={(e) => { e.stopPropagation(); updateStoreStatus(store.id, 'EXPIRED') }}
                                                                            className="px-2 py-1 bg-rose-500/10 text-rose-400 rounded-lg text-[10px] font-bold hover:bg-rose-500/20">
                                                                            停止
                                                                        </button>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ══════════════════════ MESSAGING ══════════════════════ */}
                    {activeTab === 'messaging' && (
                        <div className="flex flex-col h-[calc(100vh-7rem)]">
                            {/* Sub-tab switcher */}
                            <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                                <button onClick={() => { setMsgSubTab('conversations'); setSelectedConvo(null) }}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                        msgSubTab === 'conversations'
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                    }`}>
                                    <MessageCircle size={14} /> 1:1 メッセージ
                                    {totalUnread > 0 && (
                                        <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full">{totalUnread}</span>
                                    )}
                                </button>
                                <button onClick={() => setMsgSubTab('announcements')}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                        msgSubTab === 'announcements'
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                    }`}>
                                    <Megaphone size={14} /> 全体公告
                                    <span className="px-1.5 py-0.5 bg-white/10 text-slate-400 text-[9px] font-bold rounded-full">{announcements.length}</span>
                                </button>
                            </div>

                            {/* ── Conversations Sub-tab ── */}
                            {msgSubTab === 'conversations' && (
                                <div className="flex-1 flex gap-4 min-h-0">
                                    {/* Left: Conversation List */}
                                    <div className={`${selectedConvo ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden flex-shrink-0`}>
                                        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                                            <MessageCircle size={15} className="text-indigo-400" />
                                            <h3 className="text-sm font-bold text-white">受信トレイ</h3>
                                            <span className="text-[10px] text-slate-500 ml-auto">{conversations.length} 件</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            {conversations.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                                                    <MessageCircle size={32} className="mb-2 opacity-30" />
                                                    <p className="text-xs">メッセージはまだありません</p>
                                                </div>
                                            ) : (
                                                conversations.map(c => (
                                                    <button key={c.store_id}
                                                        onClick={() => openConversation(c.store_id)}
                                                        className={`w-full text-left px-4 py-3.5 border-b border-white/[0.03] transition-all hover:bg-white/[0.03] ${
                                                            selectedConvo === c.store_id ? 'bg-indigo-600/10 border-l-2 border-l-indigo-500' : ''
                                                        }`}>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                                                                    c.unread_count > 0
                                                                        ? 'bg-indigo-500/20 text-indigo-400 ring-2 ring-indigo-500/30'
                                                                        : 'bg-white/5 text-slate-400'
                                                                }`}>
                                                                    {(c.store_name || '?')[0]}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-white truncate">{c.store_name}</p>
                                                                    <p className="text-[10px] text-slate-500 truncate">{c.last_message || '—'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                                                                {c.last_at && (
                                                                    <span className="text-[9px] text-slate-600">{timeAgo(c.last_at)}</span>
                                                                )}
                                                                {c.unread_count > 0 && (
                                                                    <span className="px-1.5 py-0.5 bg-indigo-500 text-white text-[9px] font-black rounded-full min-w-[16px] text-center">
                                                                        {c.unread_count}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Chat Area */}
                                    <div className={`${selectedConvo ? 'flex' : 'hidden lg:flex'} flex-col flex-1 bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden min-w-0`}>
                                        {!selectedConvo ? (
                                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                                                <MessageCircle size={48} className="mb-3 opacity-20" />
                                                <p className="text-sm font-medium">会話を選択してください</p>
                                                <p className="text-[10px] text-slate-700 mt-1">左側のリストから店舗を選んでメッセージを確認</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Chat Header */}
                                                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3 flex-shrink-0">
                                                    <button onClick={() => setSelectedConvo(null)} className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
                                                        <ArrowLeft size={16} />
                                                    </button>
                                                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-black">
                                                        {(convoStoreName || '?')[0]}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-white truncate">{convoStoreName}</p>
                                                        <p className="text-[10px] text-slate-500">{convoMessages.length} メッセージ</p>
                                                    </div>
                                                    <button onClick={() => fetchConvoMessages(selectedConvo)} className="ml-auto p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition-colors" title="更新">
                                                        <RefreshCw size={14} />
                                                    </button>
                                                </div>

                                                {/* Messages */}
                                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                                    {convoMessages.length === 0 && (
                                                        <div className="flex flex-col items-center justify-center py-8 text-slate-600">
                                                            <p className="text-xs">メッセージはまだありません</p>
                                                        </div>
                                                    )}
                                                    {convoMessages.map(m => (
                                                        <div key={m.id} className={`flex ${m.sender_type === 'SUPER_ADMIN' ? 'justify-end' : 'justify-start'}`}>
                                                            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                                                                m.sender_type === 'SUPER_ADMIN'
                                                                    ? 'bg-indigo-600 text-white rounded-br-md'
                                                                    : 'bg-white/[0.06] text-slate-200 rounded-bl-md'
                                                            }`}>
                                                                {m.sender_type === 'ADMIN' && (
                                                                    <p className="text-[10px] font-bold text-indigo-400 mb-0.5">🏪 店舗オーナー</p>
                                                                )}
                                                                <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                                                                <p className={`text-[10px] mt-1 ${m.sender_type === 'SUPER_ADMIN' ? 'text-white/50' : 'text-slate-500'}`}>
                                                                    {new Date(m.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div ref={chatEndRef} />
                                                </div>

                                                {/* Reply Input */}
                                                <div className="px-4 py-3 border-t border-white/5 flex gap-2 flex-shrink-0">
                                                    <input
                                                        type="text"
                                                        value={replyText}
                                                        onChange={e => setReplyText(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendReply()}
                                                        placeholder="返信を入力..."
                                                        className="flex-1 px-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                                                    />
                                                    <button
                                                        onClick={handleSendReply}
                                                        disabled={!replyText.trim() || sendingReply}
                                                        className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-95"
                                                    >
                                                        <Send size={14} />
                                                        <span className="hidden sm:inline">送信</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── Announcements Sub-tab ── */}
                            {msgSubTab === 'announcements' && (
                                <div className="flex-1 overflow-y-auto space-y-4">
                                    {/* New Announcement Button / Form */}
                                    {!showAnnForm ? (
                                        <button onClick={() => setShowAnnForm(true)}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-indigo-600/10 border-2 border-dashed border-indigo-500/30 rounded-2xl text-indigo-400 text-sm font-bold hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all">
                                            <Plus size={16} /> 新しい公告を作成
                                        </button>
                                    ) : (
                                        <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-5 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                    <Megaphone size={16} className="text-indigo-400" /> 新規公告
                                                </h3>
                                                <button onClick={() => setShowAnnForm(false)} className="p-1 rounded-lg hover:bg-white/10 text-slate-500">
                                                    <X size={16} />
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                <input
                                                    type="text"
                                                    value={newAnnTitle}
                                                    onChange={e => setNewAnnTitle(e.target.value)}
                                                    placeholder="タイトル（例: システムメンテナンスのお知らせ）"
                                                    className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
                                                />
                                                <textarea
                                                    value={newAnnContent}
                                                    onChange={e => setNewAnnContent(e.target.value)}
                                                    placeholder="公告の内容を入力してください..."
                                                    rows={4}
                                                    className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none"
                                                />
                                                <div className="flex items-center justify-between">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={newAnnImportant} onChange={e => setNewAnnImportant(e.target.checked)}
                                                            className="w-4 h-4 rounded border-white/20 bg-white/5 text-rose-500 focus:ring-rose-500" />
                                                        <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                                                            <AlertCircle size={12} /> 重要マーク
                                                        </span>
                                                    </label>
                                                    <button
                                                        onClick={handleCreateAnnouncement}
                                                        disabled={!newAnnTitle.trim() || !newAnnContent.trim() || creatingAnn}
                                                        className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 transition-all disabled:opacity-40 flex items-center gap-1.5 active:scale-95"
                                                    >
                                                        {creatingAnn ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                                                        公告を発行
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Existing Announcements */}
                                    {announcements.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                                            <Megaphone size={32} className="mb-2 opacity-30" />
                                            <p className="text-xs">公告はまだありません</p>
                                        </div>
                                    ) : (
                                        announcements.map(a => (
                                            <div key={a.id} className={`bg-slate-900/40 rounded-2xl border p-5 transition-all ${
                                                a.is_important ? 'border-rose-500/20 bg-rose-500/[0.03]' : 'border-white/5'
                                            }`}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {a.is_important && (
                                                                <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-400 text-[9px] font-black rounded-full flex items-center gap-1">
                                                                    <AlertCircle size={10} /> 重要
                                                                </span>
                                                            )}
                                                            <h4 className="text-sm font-bold text-white">{a.title}</h4>
                                                        </div>
                                                        <p className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                                                        <p className="text-[10px] text-slate-600 mt-3 flex items-center gap-1">
                                                            <Clock size={10} />
                                                            {new Date(a.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                    <button onClick={() => handleDeleteAnnouncement(a.id)}
                                                        className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 transition-colors flex-shrink-0"
                                                        title="削除">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════ SETTINGS ══════════════════════ */}
                    {activeTab === 'settings' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-6 space-y-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                        <Languages size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white">Gemini API Configuration</h3>
                                        <p className="text-[10px] text-slate-500">翻訳APIキーとQRコードの基本URL</p>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">API Key</label>
                                        <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                                            placeholder="Gemini API Key..."
                                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">QR Code Base URL</label>
                                        <input type="text" value={qrBaseUrl} onChange={e => setQrBaseUrl(e.target.value)}
                                            placeholder="e.g. https://qraku.com"
                                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors" />
                                    </div>
                                    <button onClick={handleSaveConfig} disabled={savingConfig}
                                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50">
                                        {savingConfig ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                                        Save Config
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-6">
                                    <h3 className="text-sm font-bold text-white mb-3">システム情報</h3>
                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                                            <span className="text-slate-500">全店舗数</span>
                                            <span className="font-bold text-white">{stats?.total_stores || 0}</span>
                                        </div>
                                        <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                                            <span className="text-slate-500">総注文数</span>
                                            <span className="font-bold text-white">{stats?.total_orders?.toLocaleString() || 0}</span>
                                        </div>
                                        <div className="flex justify-between py-1.5 border-b border-white/[0.03]">
                                            <span className="text-slate-500">総メニュー数</span>
                                            <span className="font-bold text-white">{stats?.total_menus || 0}</span>
                                        </div>
                                        <div className="flex justify-between py-1.5">
                                            <span className="text-slate-500">総テーブル数</span>
                                            <span className="font-bold text-white">{stats?.total_tables || 0}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-6">
                                    <h3 className="text-sm font-bold text-white mb-3">クイックリンク</h3>
                                    <div className="space-y-2">
                                        <a href="/" target="_blank" rel="noreferrer"
                                            className="flex items-center justify-between px-3 py-2.5 bg-white/[0.03] rounded-xl hover:bg-white/[0.06] transition-colors">
                                            <span className="text-xs text-slate-300">ランディングページ</span>
                                            <ExternalLink size={13} className="text-slate-500" />
                                        </a>
                                        <a href="/demo" target="_blank" rel="noreferrer"
                                            className="flex items-center justify-between px-3 py-2.5 bg-white/[0.03] rounded-xl hover:bg-white/[0.06] transition-colors">
                                            <span className="text-xs text-slate-300">デモページ</span>
                                            <ExternalLink size={13} className="text-slate-500" />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ── Store Detail Modal ── */}
            {selectedStore && (
                <StoreDetailModal
                    store={selectedStore}
                    detail={storeDetail}
                    loading={loadingDetail}
                    onClose={() => { setSelectedStore(null); setStoreDetail(null) }}
                    onStatusChange={(status) => { updateStoreStatus(selectedStore.id, status); setSelectedStore(null); setStoreDetail(null) }}
                    onExtend={(days) => {
                        handleExtendSubscription(selectedStore.id)
                        setSelectedStore(null); setStoreDetail(null)
                    }}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    timeAgo={timeAgo}
                />
            )}
        </div>
    )
}


// ──────────────────────────────────────────────────
// Sub-Components
// ──────────────────────────────────────────────────

function MiniCard({ icon, label, value, sub }) {
    return (
        <div className="bg-slate-900/40 rounded-2xl border border-white/5 p-4">
            <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">{icon}</div>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{label}</p>
            <p className="text-xl font-black text-white mt-0.5">{value}</p>
            {sub && <p className="text-[10px] mt-1">{sub}</p>}
        </div>
    )
}

function StatusBadge({ status }) {
    const styles = {
        ACTIVE: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
        TRIAL: 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20',
        EXPIRED: 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20',
    }
    return (
        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${styles[status] || styles.TRIAL}`}>
            {status}
        </span>
    )
}

function StoreDetailModal({ store, detail, loading, onClose, onStatusChange, formatCurrency, formatDate, timeAgo }) {
    const revenueMax = useMemo(() => {
        if (!detail?.daily_data?.length) return 1
        return Math.max(...detail.daily_data.map(d => d.revenue), 1)
    }, [detail])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#0a0a0f] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-base font-bold text-white">{store.name}</h2>
                        <p className="text-[10px] text-slate-500">{store.slug} · ID: {store.id}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-slate-500">
                            <RefreshCw className="animate-spin mr-2" size={18} /> Loading...
                        </div>
                    ) : detail ? (
                        <>
                            {/* Store Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <InfoRow label="オーナー" value={detail.store.owner_name || detail.store.owner_id} />
                                <InfoRow label="カテゴリ" value={detail.store.category} />
                                <InfoRow label="テーマ" value={detail.store.theme} />
                                <InfoRow label="作成日" value={formatDate(detail.store.created_at)} />
                                <InfoRow label="電話番号" value={detail.store.phone || '—'} />
                                <InfoRow label="営業状態" value={detail.store.is_open ? '🟢 営業中' : '🔴 休業中'} />
                            </div>

                            {/* Subscription Info */}
                            <div className="bg-slate-900/50 rounded-xl p-4">
                                <h4 className="text-xs font-bold text-white mb-3">サブスクリプション</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <InfoRow label="プラン" value={detail.store.subscription_type} />
                                    <InfoRow label="ステータス" value={<StatusBadge status={detail.store.subscription_status} />} />
                                    <InfoRow label="有効期限" value={formatDate(detail.store.subscription_expires_at)} />
                                    <InfoRow label="トライアル開始" value={formatDate(detail.store.trial_start_date)} />
                                    <InfoRow label="Stripe Customer" value={detail.store.stripe_customer_id || '—'} />
                                    <InfoRow label="Stripe Sub" value={detail.store.stripe_subscription_id || '—'} />
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <StatMini label="総注文" value={detail.stats.total_orders} />
                                <StatMini label="総売上" value={formatCurrency(detail.stats.total_revenue)} />
                                <StatMini label="7日注文" value={detail.stats.orders_7d} />
                                <StatMini label="7日売上" value={formatCurrency(detail.stats.revenue_7d)} />
                                <StatMini label="メニュー数" value={detail.stats.total_menus} />
                                <StatMini label="テーブル数" value={detail.stats.total_tables} />
                                <StatMini label="利用中テーブル" value={detail.stats.occupied_tables} />
                                <StatMini label="最終注文" value={timeAgo(detail.stats.last_order_at)} />
                            </div>

                            {/* Features */}
                            <div className="flex flex-wrap gap-2">
                                <FeatureTag label="Kitchen Mode" value={detail.store.kitchen_mode} />
                                <FeatureTag label="Square" value={detail.store.square_connected ? 'Connected' : 'No'} active={detail.store.square_connected} />
                                <FeatureTag label="テイクアウト" value={detail.store.takeout_enabled ? 'ON' : 'OFF'} active={detail.store.takeout_enabled} />
                                <FeatureTag label="ポイント" value={detail.store.points_enabled ? 'ON' : 'OFF'} active={detail.store.points_enabled} />
                                <FeatureTag label="税率" value={`${detail.store.tax_rate}% ${detail.store.tax_included ? '税込' : '税別'}`} />
                            </div>

                            {/* Mini revenue chart */}
                            {detail.daily_data.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-white mb-2">売上推移（14日間）</h4>
                                    <div className="flex items-end gap-1 h-20 bg-slate-900/30 rounded-xl p-2">
                                        {detail.daily_data.map((d, i) => (
                                            <div key={i} className="flex-1 group relative">
                                                <div
                                                    className="w-full bg-indigo-500/50 hover:bg-indigo-400/70 rounded-t transition-colors"
                                                    style={{ height: `${Math.max((d.revenue / revenueMax) * 100, 3)}%` }}
                                                />
                                                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-[8px] text-white px-1.5 py-0.5 rounded whitespace-nowrap z-10 border border-white/10">
                                                    {d.date.slice(5)} · {formatCurrency(d.revenue)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between shrink-0">
                    <a href={`/${store.slug}/admin`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/5 text-slate-300 rounded-lg text-xs font-bold hover:bg-white/10 transition-colors">
                        <ExternalLink size={13} /> Admin Page
                    </a>
                    <div className="flex gap-2">
                        {store.subscription_status !== 'ACTIVE' && (
                            <button onClick={() => onStatusChange('ACTIVE')}
                                className="px-4 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-500/25 transition-colors">
                                有効化
                            </button>
                        )}
                        {store.subscription_status !== 'EXPIRED' && (
                            <button onClick={() => onStatusChange('EXPIRED')}
                                className="px-4 py-2 bg-rose-500/15 text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-500/25 transition-colors">
                                停止
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function InfoRow({ label, value }) {
    return (
        <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</p>
            <div className="text-xs text-white mt-0.5">{value}</div>
        </div>
    )
}

function StatMini({ label, value }) {
    return (
        <div className="bg-white/[0.03] rounded-xl px-3 py-2.5">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{label}</p>
            <p className="text-sm font-black text-white mt-0.5">{value}</p>
        </div>
    )
}

function FeatureTag({ label, value, active }) {
    return (
        <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${active === false ? 'bg-white/[0.03] text-slate-500' : active === true ? 'bg-indigo-500/10 text-indigo-400' : 'bg-white/5 text-slate-300'}`}>
            {label}: {value}
        </div>
    )
}
