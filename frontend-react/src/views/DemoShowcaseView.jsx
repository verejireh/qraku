import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'

/**
 * DemoShowcaseView — 4-panel demo showcase
 * Row 1: Order (phone) + Kitchen (tablet)
 * Row 2: Staff/Register (phone) + Staff/Register (tablet with left sidebar)
 */

function buildUrl(slug, tableNumber, sessionToken, panelKey) {
    const base = `/${slug}`
    switch (panelKey) {
        case 'order':    return `${base}/table/${tableNumber}/home?session_token=${sessionToken}`
        case 'kitchen':  return `${base}/kitchen?hidenav=1&demo=1`
        case 'staff':    return `${base}/staff?demo=1`
        case 'register': return `${base}/register?demo=1`
        default:         return base
    }
}

/* ── iPhone Frame with optional Table Tabs ──────────────── */
function PhoneFrame({ children, tables, activeTable, onSelectTable }) {
    return (
        <div className="dsc-phone-wrapper">
            {tables && tables.length > 0 && (
                <div className="dsc-table-tabs">
                    {tables.map(t => (
                        <button
                            key={t.table_number}
                            onClick={() => onSelectTable(t)}
                            className={`dsc-table-tab ${activeTable === t.table_number ? 'dsc-table-tab-active' : ''}`}
                        >
                            <span className="dsc-table-tab-icon">🍽</span>
                            <span className="dsc-table-tab-num">{t.table_number}</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="dsc-phone">
                <div className="dsc-phone-notch"><div className="dsc-phone-notch-pill" /></div>
                <div className="dsc-phone-screen">{children}</div>
                <div className="dsc-phone-bottom"><div className="dsc-phone-home" /></div>
            </div>
        </div>
    )
}

/* ── iPad Frame (landscape) ──────────────────────────── */
function TabletLandscapeFrame({ children }) {
    return (
        <div className="dsc-tablet-land">
            <div className="dsc-tablet-land-cam" />
            <div className="dsc-tablet-land-screen">{children}</div>
        </div>
    )
}

/* ── iPad Frame with Left Sidebar Nav ────────────────── */
function TabletWithSidebar({ slug, activeTab, onTabChange }) {
    const tabs = [
        { key: 'staff',    icon: '👥', label: 'Staff' },
        { key: 'register', icon: '💰', label: 'Register' },
        { key: 'settings', icon: '⚙️', label: 'Settings' },
    ]

    const iframeSrc = activeTab === 'register'
        ? `/${slug}/register?hidenav=1&demo=1`
        : activeTab === 'settings'
            ? `/${slug}/admin`
            : `/${slug}/staff?hidenav=1&demo=1`

    return (
        <div className="dsc-tablet-land">
            <div className="dsc-tablet-land-cam" />
            <div className="dsc-tablet-land-screen" style={{ display: 'flex' }}>
                {/* Left sidebar (1/12 width) */}
                <div className="dsc-tablet-sidebar">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => onTabChange(t.key)}
                            className={`dsc-sidebar-tab ${activeTab === t.key ? 'dsc-sidebar-tab-active' : ''}`}
                        >
                            <span className="dsc-sidebar-icon">{t.icon}</span>
                            <span className="dsc-sidebar-label">{t.label}</span>
                        </button>
                    ))}
                </div>
                {/* Main content */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <iframe
                        src={iframeSrc}
                        className="dsc-iframe"
                        title={`Tablet ${activeTab}`}
                        allow="clipboard-write"
                        key={`tablet-${activeTab}`}
                    />
                </div>
            </div>
        </div>
    )
}

export default function DemoShowcaseView() {
    const [searchParams] = useSearchParams()
    const slugParam = searchParams.get('slug') || ''

    const [device, setDevice] = useState('pc')
    const [slug, setSlug] = useState(slugParam)
    const [tables, setTables] = useState([])
    const [activeTable, setActiveTable] = useState('1')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // Staff/Register phone view tab state
    const [phoneStaffTab, setPhoneStaffTab] = useState('staff')
    // Staff/Register tablet sidebar tab state
    const [tabletStaffTab, setTabletStaffTab] = useState('staff')

    useEffect(() => {
        document.title = 'QRaku — デモ体験'
        const setup = async () => {
            try {
                const res = await axios.post('/api/demo/start-showcase')
                setSlug(res.data.store_slug)
                setTables(res.data.tables)
                setActiveTable('1')
            } catch (e) {
                console.error('Demo showcase setup failed:', e)
                setError('デモ環境の準備に失敗しました。')
            } finally {
                setLoading(false)
            }
        }
        setup()
    }, [])

    useEffect(() => {
        const check = () => {
            const w = window.innerWidth
            setDevice(w <= 480 ? 'mobile' : w <= 768 ? 'tablet' : 'pc')
        }
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    const getActiveToken = () => {
        const t = tables.find(t => t.table_number === activeTable)
        return t?.session_token || ''
    }

    const url = (key) => buildUrl(slug, activeTable, getActiveToken(), key)

    const handleSelectTable = (t) => {
        setActiveTable(t.table_number)
    }

    const renderPanel = (key, label, desc, frameType) => {
        const iframeSrc = url(key)
        const iframe = <iframe src={iframeSrc} className="dsc-iframe" title={label} allow="clipboard-write" key={`${key}-${activeTable}`} />

        let content
        if (device === 'mobile') {
            if (key === 'order') {
                content = (
                    <div className="dsc-bare-wrapper">
                        {tables.length > 0 && (
                            <div className="dsc-table-tabs-mobile">
                                {tables.map(t => (
                                    <button
                                        key={t.table_number}
                                        onClick={() => handleSelectTable(t)}
                                        className={`dsc-table-tab-m ${activeTable === t.table_number ? 'dsc-table-tab-m-active' : ''}`}
                                    >
                                        Table {t.table_number}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="dsc-bare">{iframe}</div>
                    </div>
                )
            } else {
                content = <div className="dsc-bare">{iframe}</div>
            }
        } else if (key === 'order') {
            content = (
                <PhoneFrame tables={tables} activeTable={activeTable} onSelectTable={handleSelectTable}>
                    {iframe}
                </PhoneFrame>
            )
        } else if (frameType === 'tablet') {
            content = <TabletLandscapeFrame>{iframe}</TabletLandscapeFrame>
        } else {
            content = <PhoneFrame tables={[]} activeTable="" onSelectTable={() => {}}>{iframe}</PhoneFrame>
        }

        return (
            <div className={`dsc-panel dsc-panel-${frameType}`} key={key}>
                <div className="dsc-panel-label">
                    <span className="dsc-panel-title">{label}</span>
                    <span className="dsc-panel-desc">{desc}</span>
                </div>
                {content}
            </div>
        )
    }

    /* ── Phone frame for Staff/Register with bottom nav ── */
    const renderStaffPhone = () => {
        const phoneUrl = phoneStaffTab === 'register'
            ? `/${slug}/register?demo=1`
            : phoneStaffTab === 'settings'
                ? `/${slug}/admin`
                : `/${slug}/staff?demo=1`

        const tabs = [
            { key: 'register', icon: '💰', label: 'Register' },
            { key: 'staff',    icon: '👥', label: 'Staff' },
            { key: 'settings', icon: '⚙️', label: 'Settings' },
        ]

        if (device === 'mobile') {
            return (
                <div className="dsc-panel dsc-panel-phone" key="staff-phone">
                    <div className="dsc-panel-label">
                        <span className="dsc-panel-title">📱 スタッフ・レジ画面</span>
                        <span className="dsc-panel-desc">スマートフォン表示</span>
                    </div>
                    <div className="dsc-bare-wrapper">
                        <div className="dsc-table-tabs-mobile">
                            {tabs.map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => setPhoneStaffTab(t.key)}
                                    className={`dsc-table-tab-m ${phoneStaffTab === t.key ? 'dsc-table-tab-m-active' : ''}`}
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="dsc-bare">
                            <iframe src={phoneUrl} className="dsc-iframe" title="Staff Phone" allow="clipboard-write" key={`staff-phone-${phoneStaffTab}`} />
                        </div>
                    </div>
                </div>
            )
        }

        return (
            <div className="dsc-panel dsc-panel-phone" key="staff-phone">
                <div className="dsc-panel-label">
                    <span className="dsc-panel-title">📱 スタッフ・レジ画面</span>
                    <span className="dsc-panel-desc">スマートフォン表示</span>
                </div>
                <PhoneFrame tables={[]} activeTable="" onSelectTable={() => {}}>
                    <iframe src={phoneUrl} className="dsc-iframe" title="Staff Phone" allow="clipboard-write" key={`staff-phone-${phoneStaffTab}`} />
                </PhoneFrame>
            </div>
        )
    }

    /* ── Tablet frame for Staff/Register with left sidebar ── */
    const renderStaffTablet = () => {
        if (device === 'mobile') {
            const tabletUrl = tabletStaffTab === 'register'
                ? `/${slug}/register?demo=1`
                : tabletStaffTab === 'settings'
                    ? `/${slug}/admin`
                    : `/${slug}/staff?demo=1`
            const tabs = [
                { key: 'register', icon: '💰', label: 'Register' },
                { key: 'staff',    icon: '👥', label: 'Staff' },
                { key: 'settings', icon: '⚙️', label: 'Settings' },
            ]
            return (
                <div className="dsc-panel dsc-panel-tablet" key="staff-tablet">
                    <div className="dsc-panel-label">
                        <span className="dsc-panel-title">🖥 スタッフ・レジ画面</span>
                        <span className="dsc-panel-desc">タブレット表示</span>
                    </div>
                    <div className="dsc-bare-wrapper">
                        <div className="dsc-table-tabs-mobile">
                            {tabs.map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => setTabletStaffTab(t.key)}
                                    className={`dsc-table-tab-m ${tabletStaffTab === t.key ? 'dsc-table-tab-m-active' : ''}`}
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="dsc-bare">
                            <iframe src={tabletUrl} className="dsc-iframe" title="Staff Tablet" allow="clipboard-write" key={`staff-tablet-${tabletStaffTab}`} />
                        </div>
                    </div>
                </div>
            )
        }

        return (
            <div className="dsc-panel dsc-panel-tablet" key="staff-tablet">
                <div className="dsc-panel-label">
                    <span className="dsc-panel-title">🖥 スタッフ・レジ画面</span>
                    <span className="dsc-panel-desc">タブレット表示（サイドバー付き）</span>
                </div>
                <TabletWithSidebar slug={slug} activeTab={tabletStaffTab} onTabChange={setTabletStaffTab} />
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#fff8f7]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-[#e11d48] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-[#514345] font-semibold">デモ環境を準備中...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#fff8f7]">
                <div className="text-center space-y-4">
                    <p className="text-red-600 bg-red-50 border border-red-200 px-6 py-4 rounded-2xl text-sm">{error}</p>
                    <button onClick={() => window.location.reload()} className="px-8 py-3 bg-[#e11d48] rounded-full text-white font-bold hover:opacity-90 transition-opacity">再試行</button>
                </div>
            </div>
        )
    }

    return (
        <div className="dsc-root">
            <style>{STYLES}</style>

            {/* ── Header ── */}
            <header className="dsc-header">
                <div className="dsc-header-inner">
                    <Link to="/" className="dsc-logo">
                        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                            <rect width="32" height="32" rx="8" fill="#fb7185"/>
                            <rect x="6" y="6" width="8" height="8" rx="1.5" fill="white"/>
                            <rect x="8" y="8" width="4" height="4" rx="0.5" fill="#fb7185"/>
                            <rect x="18" y="6" width="8" height="8" rx="1.5" fill="white"/>
                            <rect x="20" y="8" width="4" height="4" rx="0.5" fill="#fb7185"/>
                            <rect x="6" y="18" width="8" height="8" rx="1.5" fill="white"/>
                            <rect x="8" y="20" width="4" height="4" rx="0.5" fill="#fb7185"/>
                            <rect x="18" y="18" width="3" height="3" rx="0.5" fill="white"/>
                            <rect x="23" y="18" width="3" height="3" rx="0.5" fill="white"/>
                            <rect x="18" y="23" width="3" height="3" rx="0.5" fill="white"/>
                            <rect x="23" y="23" width="3" height="3" rx="0.5" fill="white"/>
                        </svg>
                        <span>QRaku <span className="dsc-badge">DEMO</span></span>
                    </Link>
                    <div className="dsc-header-right">
                        <span className="dsc-table-tag">Table {activeTable}</span>
                        <Link to="/" className="dsc-back">&larr; ホームに戻る</Link>
                    </div>
                </div>
            </header>

            {/* ── Banner ── */}
            <div className="dsc-banner">
                <p className="dsc-banner-main">👇 テーブルタブを切り替えて、複数テーブルからの注文をお試しください！</p>
                <p className="dsc-banner-sub">実際のサービス利用とは多少異なる場合がございます。全体的な注文の流れをご理解いただけるよう制作されています。</p>
            </div>

            {/* ── Panels ── */}
            <main className="dsc-main">
                {/* Row 1: Order (phone) + Kitchen (tablet) */}
                <div className="dsc-row">
                    {renderPanel('order', '📱 注文画面', 'テーブルタブで切替', 'phone')}
                    {renderPanel('kitchen', '🍳 キッチン画面', '厨房で注文を確認します', 'tablet')}
                </div>
                {/* Row 2: Staff/Register phone (left) + Staff/Register tablet with sidebar (right) */}
                <div className="dsc-row">
                    {renderStaffPhone()}
                    {renderStaffTablet()}
                </div>
            </main>

            {/* ── CTA ── */}
            <footer className="dsc-footer">
                <p>気に入りましたか？</p>
                <Link to="/owner/signup" className="dsc-cta">🚀 無料で始める</Link>
            </footer>
        </div>
    )
}

/* ───────────────────── CSS ───────────────────── */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');

/* ── Root ── */
.dsc-root {
    min-height: 100vh;
    background: linear-gradient(180deg, #fff8f7 0%, #f8f0f0 40%, #f2e8e8 100%);
    font-family: 'Inter', sans-serif;
    color: #201a1b;
}

/* ── Header ── */
.dsc-header {
    position: sticky; top: 0; z-index: 100;
    background: rgba(255,248,247,0.88);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(0,0,0,0.06);
}
.dsc-header-inner {
    max-width: 1400px; margin: 0 auto; padding: 12px 20px;
    display: flex; align-items: center; justify-content: space-between;
}
.dsc-logo {
    display: flex; align-items: center; gap: 10px;
    text-decoration: none; color: #201a1b; font-size: 18px; font-weight: 800;
}
.dsc-badge {
    font-size: 10px; background: linear-gradient(135deg, #fb7185, #e11d48);
    color: white;
    padding: 2px 8px; border-radius: 100px; font-weight: 700; letter-spacing: 1px;
}
.dsc-header-right { display: flex; align-items: center; gap: 12px; }
.dsc-table-tag {
    font-size: 11px; background: rgba(251,113,133,0.12); color: #e11d48;
    padding: 4px 12px; border-radius: 100px; font-weight: 700;
}
.dsc-back {
    font-size: 13px; color: rgba(0,0,0,0.4); text-decoration: none;
    transition: color 0.2s;
}
.dsc-back:hover { color: #e11d48; }

/* ── Banner ── */
.dsc-banner { max-width: 1400px; margin: 16px auto 0; padding: 0 20px; }
.dsc-banner .dsc-banner-main {
    background: rgba(251,113,133,0.06); border: 1px solid rgba(251,113,133,0.15);
    border-radius: 12px 12px 0 0; padding: 14px 20px; font-size: 16px;
    text-align: center; color: #be123c; font-weight: 700;
    border-bottom: none;
}
.dsc-banner .dsc-banner-sub {
    background: rgba(251,113,133,0.03); border: 1px solid rgba(251,113,133,0.15);
    border-radius: 0 0 12px 12px; padding: 10px 20px; font-size: 12px;
    text-align: center; color: #9f1239; font-weight: 500;
    border-top: none;
}

/* ── Main ── */
.dsc-main {
    max-width: 1400px; margin: 24px auto; padding: 0 20px 40px;
    display: flex; flex-direction: column; gap: 48px;
}

/* ── Row ── */
.dsc-row {
    display: flex; gap: 40px; align-items: flex-start; justify-content: center;
    flex-wrap: wrap;
}

/* ── Panel ── */
.dsc-panel { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.dsc-panel-label { text-align: center; }
.dsc-panel-title { font-size: 15px; font-weight: 800; display: block; color: #201a1b; }
.dsc-panel-desc  { font-size: 12px; color: rgba(0,0,0,0.4); }

/* ── iframe ── */
.dsc-iframe { width: 100%; height: 100%; border: none; background: white; }

/* ═══════════════════════════════════════════════
   Phone Frame + Table Tabs
   ═══════════════════════════════════════════════ */

.dsc-phone-wrapper {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    flex-shrink: 0;
}

/* Table selector tabs (bookmark style, left side of phone) */
.dsc-table-tabs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 80px;
    margin-right: -2px;
    z-index: 2;
}
.dsc-table-tab {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    width: 48px; height: 64px;
    background: #f0edef;
    border: 2px solid #dcd9dc;
    border-right: none;
    border-radius: 12px 0 0 12px;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
}
.dsc-table-tab:hover {
    background: #ffd9df;
    border-color: #fb7185;
}
.dsc-table-tab-active {
    background: #e11d48 !important;
    border-color: #e11d48 !important;
    color: white;
    box-shadow: -4px 2px 12px rgba(225,29,72,0.25);
}
.dsc-table-tab-icon {
    font-size: 14px;
    line-height: 1;
}
.dsc-table-tab-num {
    font-size: 16px;
    font-weight: 900;
    line-height: 1;
    margin-top: 2px;
}
.dsc-table-tab-active .dsc-table-tab-num,
.dsc-table-tab-active .dsc-table-tab-icon {
    color: white;
}

/* iPhone Frame */
.dsc-phone {
    width: 355px; height: 720px;
    background: #1c1c1e; border-radius: 52px; padding: 14px;
    display: flex; flex-direction: column;
    box-shadow:
        0 0 0 2px rgba(0,0,0,0.1),
        0 24px 80px rgba(0,0,0,0.15),
        0 8px 24px rgba(0,0,0,0.08);
    flex-shrink: 0;
}
.dsc-phone-notch { display: flex; justify-content: center; padding: 8px 0 6px; flex-shrink: 0; }
.dsc-phone-notch-pill { width: 90px; height: 24px; background: #000; border-radius: 14px; }
.dsc-phone-screen { flex: 1; border-radius: 38px; overflow: hidden; background: white; }
.dsc-phone-bottom { display: flex; justify-content: center; padding: 10px 0 6px; flex-shrink: 0; }
.dsc-phone-home { width: 110px; height: 5px; background: rgba(255,255,255,0.3); border-radius: 100px; }

/* iPad landscape */
.dsc-tablet-land {
    width: 820px; height: 580px;
    background: #1c1c1e; border-radius: 24px; padding: 14px;
    display: flex; flex-direction: row;
    box-shadow:
        0 0 0 2px rgba(0,0,0,0.1),
        0 24px 80px rgba(0,0,0,0.15),
        0 8px 24px rgba(0,0,0,0.08);
    flex-shrink: 0;
}
.dsc-tablet-land-cam {
    width: 10px; height: 10px; background: #2c2c2e; border-radius: 50%;
    align-self: center; margin-right: 8px; flex-shrink: 0;
}
.dsc-tablet-land-screen {
    flex: 1; border-radius: 10px; overflow: hidden; background: white;
}

/* ═══════════════════════════════════════════════
   Tablet Left Sidebar (1/12 width)
   ═══════════════════════════════════════════════ */
.dsc-tablet-sidebar {
    width: 8.333%;  /* 1/12 */
    min-width: 56px;
    background: #f8f5f6;
    border-right: 1px solid #ece8ea;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    gap: 4px;
    flex-shrink: 0;
}
.dsc-sidebar-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: calc(100% - 8px);
    padding: 10px 2px;
    border-radius: 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
    color: #9a8a8d;
}
.dsc-sidebar-tab:hover {
    background: #f0e8ea;
    color: #e11d48;
}
.dsc-sidebar-tab-active {
    background: rgba(225,29,72,0.1) !important;
    color: #e11d48 !important;
}
.dsc-sidebar-icon {
    font-size: 18px;
    line-height: 1;
}
.dsc-sidebar-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    line-height: 1;
}

/* ── Bare (mobile) ── */
.dsc-bare-wrapper {
    display: flex; flex-direction: column; width: 100%; max-width: 320px; margin: 0 auto;
}
.dsc-table-tabs-mobile {
    display: flex; gap: 4px; margin-bottom: 8px; justify-content: center; flex-wrap: wrap;
}
.dsc-table-tab-m {
    padding: 6px 14px; border-radius: 100px; font-size: 11px; font-weight: 700;
    background: #f0edef; border: 1.5px solid #dcd9dc; cursor: pointer; transition: all 0.2s;
}
.dsc-table-tab-m:hover { background: #ffd9df; border-color: #fb7185; }
.dsc-table-tab-m-active {
    background: #e11d48 !important; border-color: #e11d48 !important; color: white;
}
.dsc-bare {
    width: 100%; height: 580px;
    border-radius: 16px; overflow: hidden;
    border: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
}

/* ═══════════════════════════════════════════════
   Tablet (481px ~ 768px)
   ═══════════════════════════════════════════════ */
@media (min-width: 481px) and (max-width: 768px) {
    .dsc-row { flex-direction: column; align-items: center; }

    .dsc-phone {
        width: 320px; height: 660px;
        border-radius: 48px; padding: 12px;
    }
    .dsc-phone-screen { border-radius: 36px; }
    .dsc-phone-notch-pill { width: 84px; height: 22px; }

    .dsc-tablet-land {
        width: min(95vw, 720px); height: 480px;
        border-radius: 20px; padding: 12px;
    }

    .dsc-table-tab { width: 40px; height: 54px; }
    .dsc-table-tab-num { font-size: 14px; }

    .dsc-tablet-sidebar { min-width: 48px; }
    .dsc-sidebar-icon { font-size: 16px; }
    .dsc-sidebar-label { font-size: 8px; }
}

/* ═══════════════════════════════════════════════
   Mobile (320px ~ 480px)
   ═══════════════════════════════════════════════ */
@media (max-width: 480px) {
    .dsc-row { flex-direction: column; align-items: center; }
    .dsc-main { gap: 28px; padding: 0 12px 32px; }
    .dsc-banner { padding: 0 12px; }
    .dsc-banner .dsc-banner-main { font-size: 13px; padding: 10px 14px; }
    .dsc-banner .dsc-banner-sub { font-size: 10px; padding: 8px 14px; }
    .dsc-header-inner { padding: 10px 12px; }
    .dsc-back { display: none; }

    .dsc-bare {
        max-width: 100%; height: 520px;
    }

    /* Hide phone wrapper tabs on mobile — using mobile tabs instead */
    .dsc-table-tabs { display: none; }
}

/* ── Footer CTA ── */
.dsc-footer {
    text-align: center; padding: 40px 20px 60px;
    border-top: 1px solid rgba(0,0,0,0.06);
}
.dsc-footer p { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #514345; }
.dsc-cta {
    display: inline-block;
    background: linear-gradient(135deg, #fb7185, #e11d48);
    color: white; padding: 14px 40px; border-radius: 100px;
    font-size: 15px; font-weight: 800; text-decoration: none;
    box-shadow: 0 8px 32px rgba(251,113,133,0.25); transition: all 0.2s;
}
.dsc-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(251,113,133,0.35); }
`
