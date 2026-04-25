import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import { useLanguage } from '../../../context/LanguageContext'
import { useSession } from '../../../context/SessionContext'

export default function AjisaiBottomNav() {
    const navigate = useNavigate()
    const { shop_id: paramShopId, tableNumber: paramTableNumber } = useParams()
    const { storeId: sessionStoreId, tableNumber: sessionTableNumber } = useSession()
    const shop_id = paramShopId || sessionStoreId
    const tableNumber = paramTableNumber || sessionTableNumber
    const location = useLocation()

    const getPath = (route) => {
        const queryParams = location.search
        if (tableNumber) return `/${shop_id}/table/${tableNumber}/${route}${queryParams}`
        return `/${shop_id}/${route}${queryParams}`
    }
    const { t } = useLanguage()

    const [callStaffSent, setCallStaffSent] = useState(false)
    const [tableId, setTableId] = useState(null)
    const isTakeOut = location.pathname.includes('/takeout')

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

    const navItems = [
        { icon: 'home', label: t('home') || 'Home', path: getPath('home'), active: location.pathname.includes('/home') },
        { icon: 'restaurant_menu', label: t('menu') || 'Menu', path: getPath('menu'), active: location.pathname.includes('/menu') },
        { icon: 'receipt_long', label: t('orders') || 'Orders', path: getPath('orders'), active: location.pathname.includes('/orders') },
        { icon: 'payments', label: t('checkout') || 'お会計', path: getPath('checkout'), active: location.pathname.includes('/checkout') },
    ]

    return (
        <nav
            className="fixed bottom-0 left-0 w-full h-20 flex items-center justify-around border-t border-[#5cd0f0]/20 z-40 px-2 pb-safe"
            style={{ background: 'rgba(246,248,248,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
        >
            {navItems.map((item) => {
                const isActive = item.active
                return (
                    <button
                        key={item.label}
                        onClick={() => navigate(item.path)}
                        className={`flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? 'text-[#5cd0f0] scale-110' : 'text-slate-400 hover:text-[#5cd0f0]'}`}
                    >
                        <span className="material-symbols-outlined text-2xl" style={isActive && item.icon === 'restaurant_menu' ? { fontVariationSettings: "'FILL' 1" } : {}}>
                            {item.icon}
                        </span>
                        <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
                    </button>
                )
            })}
                {/* Call Staff */}
                {!isTakeOut && (
                    <button
                        onClick={handleCallStaff}
                        disabled={callStaffSent || !tableId}
                        className={`flex flex-col items-center gap-1 transition-colors ${
                            callStaffSent ? 'text-green-400' : 'text-red-400 hover:text-red-300 active:scale-95'
                        } ${!tableId && !callStaffSent ? 'opacity-40' : ''}`}
                    >
                        <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {callStaffSent ? 'check_circle' : 'notifications'}
                        </span>
                        <span className="text-[10px] font-bold">{callStaffSent ? '呼出済' : '呼出'}</span>
                    </button>
                )}
        </nav>
    )
}
