/**
 * StaffNav — Shared navigation for Register, Staff, Kitchen pages
 *
 * Exports:
 *   <StaffSidebar /> — Left sidebar, visible at lg+ (≥1024px)
 *   <StaffBottomNav /> — Floating bottom nav, visible below lg (<1024px), with hide/show toggle
 */
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStaffAuth } from './StaffLoginGate'

function Icon({ name, className = '' }) {
    return <span className={`material-symbols-outlined ${className}`} style={{ fontFamily: 'Material Symbols Outlined' }}>{name}</span>
}

const ALL_NAV_ITEMS = [
    { key: 'register', icon: 'point_of_sale', label: 'Register', path: 'register', masterOnly: true },
    { key: 'staff', icon: 'groups', label: 'Staff', path: 'staff', masterOnly: false },
    { key: 'kitchen', icon: 'kitchen', label: 'Kitchen', path: 'kitchen', masterOnly: true },
    { key: 'setting', icon: 'settings', label: 'Setting', path: 'setting', masterOnly: true },
]

function useFilteredNavItems() {
    const { isMaster } = useStaffAuth()
    return isMaster ? ALL_NAV_ITEMS : ALL_NAV_ITEMS.filter(item => !item.masterOnly)
}

export function StaffSidebar({ activePage = 'register' }) {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const { logout: staffLogout, isMaster, isStaff } = useStaffAuth()
    const navItems = useFilteredNavItems()

    // スタッフ個人ログイン → サイドバー非表示
    if (isStaff && !isMaster) return null

    return (
        <nav className="hidden lg:flex flex-col items-center w-[68px] shrink-0 bg-white border-r border-stone-100 py-4 gap-1 z-10">
            {navItems.map(item => (
                <button
                    key={item.key}
                    onClick={() => navigate(`/${shop_id}/${item.path}`)}
                    className={`flex flex-col items-center justify-center w-14 py-2.5 rounded-xl transition-all ${
                        activePage === item.key
                            ? 'bg-[#ffdada]/50 text-[#b80035]'
                            : 'text-[#5c3f40]/50 hover:text-[#b80035] hover:bg-[#ffdada]/30'
                    }`}
                >
                    <Icon name={item.icon} className="!text-xl" />
                    <span className="text-[8px] font-bold uppercase tracking-wider">{item.label}</span>
                </button>
            ))}
            <div className="flex-1" />
            <button
                onClick={() => { staffLogout(); navigate(`/${shop_id}/admin`) }}
                className="flex flex-col items-center justify-center w-14 py-2.5 rounded-xl transition-all text-[#5c3f40]/50 hover:text-[#b80035] hover:bg-[#ffdada]/30"
            >
                <Icon name="logout" className="!text-xl" />
                <span className="text-[8px] font-bold uppercase tracking-wider">Logout</span>
            </button>
        </nav>
    )
}

export function StaffBottomNav({ activePage = 'register' }) {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const { logout: staffLogout, isMaster, isStaff } = useStaffAuth()
    const navItems = useFilteredNavItems()
    const [hidden, setHidden] = useState(false)

    // Listen for custom event from store name click to show nav
    useEffect(() => {
        const handleShow = () => setHidden(false)
        window.addEventListener('staff-nav-show', handleShow)
        return () => window.removeEventListener('staff-nav-show', handleShow)
    }, [])

    // スタッフ個人ログイン → ボトムナビ非表示
    if (isStaff && !isMaster) return null

    // Hidden state: no visible element, click store name (top-left) to restore
    if (hidden) return null

    return (
        <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[70] lg:hidden flex items-center gap-1 px-2 py-1.5 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-stone-200">
            {navItems.map(item => (
                <button
                    key={item.key}
                    onClick={() => navigate(`/${shop_id}/${item.path}`)}
                    className={`flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl transition-all active:scale-90 min-w-0 ${
                        activePage === item.key
                            ? 'bg-[#ffdada]/50 text-[#b80035]'
                            : 'text-[#5c3f40]/50 hover:text-[#b80035]'
                    }`}
                >
                    <Icon name={item.icon} className="!text-xl" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
                </button>
            ))}
            <button
                onClick={() => { staffLogout(); navigate(`/${shop_id}/admin`) }}
                className="flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl transition-all active:scale-90 text-[#5c3f40]/50 hover:text-[#b80035] min-w-0"
            >
                <Icon name="logout" className="!text-xl" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Logout</span>
            </button>
            {/* Hide button */}
            <button
                onClick={() => setHidden(true)}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-all active:scale-90 text-stone-300 hover:text-[#b80035] hover:bg-stone-100 ml-0.5"
                title="メニューを隠す"
            >
                <Icon name="expand_more" className="!text-lg" />
            </button>
        </nav>
    )
}
