/**
 * StaffPortalLayout
 * - StaffLoginGate でラップ（認証必須）
 * - マスターPIN認証: 4タブ表示 (Register / Staff / Kitchen / Setting)
 * - スタッフ個人認証: Staff ページのみ
 * - Outlet で子ルートをレンダリング
 */
import { Outlet, useParams, useLocation, useNavigate } from 'react-router-dom'
import StaffLoginGate, { useStaffAuth } from '../components/StaffLoginGate'

function PortalTabs() {
    const { shop_id } = useParams()
    const location = useLocation()
    const navigate = useNavigate()
    const { isMaster, isStaff, auth, logout } = useStaffAuth()

    const path = location.pathname

    const allTabs = [
        { key: 'register', label: 'Register', path: `/${shop_id}/register`, icon: 'register', masterOnly: true },
        { key: 'staff',    label: 'Staff',    path: `/${shop_id}/staff`,    icon: 'staff',    masterOnly: false },
        { key: 'kitchen',  label: 'Kitchen',  path: `/${shop_id}/kitchen`,  icon: 'kitchen',  masterOnly: true },
        { key: 'setting',  label: 'Setting',  path: `/${shop_id}/setting`,  icon: 'setting',  masterOnly: true },
    ]

    // マスターPIN → 全タブ表示 / スタッフ個人 → ナビバー非表示
    if (isStaff && !isMaster) return null

    const tabs = allTabs

    const isActive = (tabPath) => path.startsWith(tabPath)

    return (
        <nav className="fixed bottom-0 left-0 w-full z-[60] flex lg:hidden justify-around items-center px-2 pb-6 pt-2 bg-white/90 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)] border-t border-slate-200">
            {tabs.map(tab => (
                <button key={tab.key}
                    onClick={() => navigate(tab.path)}
                    className={`flex flex-col items-center justify-center px-3 py-2 rounded-xl transition-all duration-200 active:scale-90 min-w-[60px] ${
                        isActive(tab.path)
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    <TabIcon type={tab.icon} active={isActive(tab.path)} />
                    <span className="text-[10px] font-bold mt-0.5 uppercase tracking-wider">{tab.label}</span>
                </button>
            ))}
            <button
                onClick={logout}
                className="flex flex-col items-center justify-center px-3 py-2 rounded-xl transition-all text-slate-300 hover:text-red-400 active:scale-90 min-w-[50px]"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9" />
                </svg>
                <span className="text-[9px] font-bold mt-0.5">Logout</span>
            </button>
        </nav>
    )
}

function TabIcon({ type, active }) {
    const cls = "w-5 h-5"
    const sw = 2

    if (type === 'register') return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={sw} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
    )
    if (type === 'staff') return (
        <svg className={cls} fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : sw} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
    )
    if (type === 'kitchen') return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={sw} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
        </svg>
    )
    // setting
    return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={sw} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    )
}

function RoleGuard() {
    const location = useLocation()
    const { isMaster, isStaff } = useStaffAuth()

    // Register, Kitchen, Setting → マスターPIN only
    const masterOnlyPaths = ['/register', '/kitchen', '/setting']
    const needsMaster = masterOnlyPaths.some(p => location.pathname.endsWith(p))

    if (needsMaster && isStaff && !isMaster) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-sm w-full text-center shadow-lg">
                    <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <h2 className="text-lg font-bold text-slate-800 mb-2">アクセス権限がありません</h2>
                    <p className="text-sm text-slate-500">このページにはマスターPINが必要です。</p>
                </div>
            </div>
        )
    }

    return <Outlet />
}

export default function StaffPortalLayout() {
    return (
        <StaffLoginGate requiredRole="any">
            <div className="min-h-screen">
                <RoleGuard />
                {/* PortalTabs removed: bottom nav is now handled by StaffBottomNav inside each page */}
            </div>
        </StaffLoginGate>
    )
}
