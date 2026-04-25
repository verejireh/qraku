import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSession } from '../../context/SessionContext'
import { useState, useEffect } from 'react'
import axios from 'axios'

export default function MagnoliaBottomNav() {
    const navigate = useNavigate();
    const { shop_id: paramShopId, tableNumber: paramTableNumber } = useParams();
    const { storeId: sessionStoreId, tableNumber: sessionTableNumber } = useSession();
    const shop_id = paramShopId || sessionStoreId;
    const tableNumber = paramTableNumber || sessionTableNumber;
    const location = useLocation();

    const [callStaffSent, setCallStaffSent] = useState(false)
    const [tableId, setTableId] = useState(null)

    // Detect take-out mode
    const isTakeOut = location.pathname.includes('/takeout')

    // Fetch table ID for call-staff
    useEffect(() => {
        if (!shop_id || !tableNumber || isTakeOut) return
        const fetchTableId = async () => {
            try {
                const res = await axios.get(`/api/stores/${shop_id}/tables`)
                const table = res.data.find(t => String(t.table_number) === String(tableNumber))
                if (table) setTableId(table.id)
            } catch (e) { /* ignore */ }
        }
        fetchTableId()
    }, [shop_id, tableNumber, isTakeOut])

    const handleCallStaff = async () => {
        if (!tableId || callStaffSent) return
        try {
            await axios.post(`/api/customer/tables/${tableId}/call-staff`)
            setCallStaffSent(true)
            setTimeout(() => setCallStaffSent(false), 10000)
        } catch (e) {
            console.warn('Call staff failed:', e)
        }
    }

    // React Router用: /table/ パスを含めて正しいルートにマッチ（URLマスキングはStoreLayoutが処理）
    const getPath = (route) => {
        const queryParams = location.search; // Persist ?theme=XX
        if (tableNumber) {
            return `/${shop_id}/table/${tableNumber}/${route}${queryParams}`
        }
        return `/${shop_id}/${route}${queryParams}`
    }

    const navItems = [
        {
            icon: 'home',
            label: 'Home',
            path: getPath('home'),
            active: location.pathname.includes('/home')
        },
        {
            icon: 'restaurant_menu',
            label: 'Menu',
            path: getPath('menu'),
            active: location.pathname.includes('/menu')
        },
        {
            icon: 'receipt_long',
            label: 'Orders',
            path: getPath('orders'),
            active: location.pathname.includes('/orders')
        },
        {
            icon: 'shopping_cart_checkout',
            label: 'お会計',
            path: getPath('checkout'),
            active: location.pathname.includes('/checkout')
        },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#161616]/95 backdrop-blur-2xl border-t border-white/[0.08] px-6 pb-9 pt-4">
            <div className="flex items-center justify-between max-w-lg mx-auto">
                {navItems.map((item) => {
                    const isActive = item.active;
                    return (
                        <button
                            key={item.label}
                            onClick={() => navigate(item.path)}
                            className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-primary/10' : 'hover:bg-white/5'
                                }`}
                        >
                            <span
                                className={`material-symbols-outlined text-[28px] mb-1 transition-all duration-300 ${isActive ? 'text-primary fill-[1] scale-110 drop-shadow-[0_0_8px_var(--color-primary)]' : 'text-slate-400 group-hover:text-white'
                                    }`}
                            >
                                {item.icon}
                            </span>
                            <span
                                className={`text-[10px] font-bold tracking-wide transition-colors ${isActive ? 'text-primary' : 'text-slate-500 group-hover:text-slate-300'
                                    }`}
                            >
                                {item.label}
                            </span>

                            {/* Active Indicator Dot */}
                            {isActive && (
                                <span className="absolute -bottom-3 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]"></span>
                            )}
                        </button>
                    );
                })}

                {/* Call Staff Button (replaces Profile) */}
                {!isTakeOut && tableId ? (
                    <button
                        onClick={handleCallStaff}
                        disabled={callStaffSent}
                        className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-2xl transition-all duration-300 group ${
                            callStaffSent ? 'bg-green-500/20' : 'hover:bg-white/5 active:scale-95'
                        }`}
                    >
                        <span
                            className={`material-symbols-outlined text-[28px] mb-1 transition-all duration-300 ${
                                callStaffSent
                                    ? 'text-green-400 scale-110'
                                    : 'text-red-400 group-hover:text-red-300 group-hover:scale-110'
                            }`}
                            style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                            {callStaffSent ? 'check_circle' : 'notifications'}
                        </span>
                        <span
                            className={`text-[10px] font-bold tracking-wide transition-colors ${
                                callStaffSent ? 'text-green-400' : 'text-slate-500 group-hover:text-red-300'
                            }`}
                        >
                            {callStaffSent ? '呼出済' : '呼出'}
                        </span>

                        {/* Pulse animation when not sent */}
                        {!callStaffSent && (
                            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
                        )}
                    </button>
                ) : !isTakeOut ? (
                    <button
                        disabled
                        className="relative flex flex-col items-center justify-center w-16 h-14 rounded-2xl opacity-40"
                    >
                        <span className="material-symbols-outlined text-[28px] mb-1 text-slate-500" style={{ fontVariationSettings: "'FILL' 1" }}>notifications</span>
                        <span className="text-[10px] font-bold tracking-wide text-slate-500">呼出</span>
                    </button>
                ) : null}
            </div>
        </nav>
    )
}
