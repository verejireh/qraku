import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'

export default function AdminOrdersView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    // const categoryPath = location.pathname.split('/')[1] || 'restaurant' // Removed category dependency

    const { themes } = useTheme()
    const { setLanguage, t } = useLanguage()

    const [storeData, setStoreData] = useState(null)
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)

    // Fetch store for theme data and orders list
    useEffect(() => {
        setLanguage('ja') // Dashboard default
        const fetchData = async () => {
            try {
                const storeRes = await axios.get(`/api/stores/${shop_id}`)
                setStoreData(storeRes.data)

                const sId = storeRes.data.id
                const ordersRes = await axios.get('/api/orders/', { params: { store_id: sId } })
                console.log("받은 주문 데이터:", ordersRes.data)

                const rawOrders = Array.isArray(ordersRes.data)
                    ? ordersRes.data
                    : (ordersRes.data?.orders || ordersRes.data?.items || ordersRes.data?.data || [])

                // Sort by newest first
                const sortedOrders = rawOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                setOrders(sortedOrders)
            } catch (error) {
                console.error("Failed to fetch store details or orders", error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()

        // Polling
        const intervalId = setInterval(fetchData, 30000)
        return () => clearInterval(intervalId)
    }, [shop_id, setLanguage])

    if (loading) return <div className="p-8 text-center animate-pulse text-adminprimary">Loading Orders...</div>

    const tColor = storeData ? themes[storeData.theme]?.color : '#c21e2f'

    const formatTime = (isoString) => {
        if (!isoString) return '-'
        const date = new Date(isoString)
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const getStatusStyle = (status) => {
        switch (status) {
            case 'COMPLETED': return 'bg-emerald-100 text-emerald-700'
            case 'CANCELLED': return 'bg-rose-100 text-rose-700'
            case 'PENDING':
            default: return 'bg-amber-100 text-amber-700'
        }
    }

    const getStatusIcon = (status) => {
        switch (status) {
            case 'COMPLETED': return 'check_circle'
            case 'CANCELLED': return 'cancel'
            case 'PENDING':
            default: return 'pending'
        }
    }

    return (
        <div className="flex h-screen overflow-hidden bg-[#f8f6f6] text-slate-900 font-display">
            <style>{`.tsubaki-pattern { background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='3' fill='%23c21e2f' fill-opacity='0.05'/%3E%3Ccircle cx='10' cy='10' r='2' fill='%23c21e2f' fill-opacity='0.04'/%3E%3Ccircle cx='50' cy='50' r='2' fill='%23c21e2f' fill-opacity='0.04'/%3E%3C/svg%3E"); }`}</style>

            <main className="flex-1 flex flex-col overflow-y-auto tsubaki-pattern scroll-smooth">
                {/* Unified Header */}
                <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-adminprimary/20 px-4 md:px-10 py-3 flex items-center justify-between transition-colors">
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
                            <a className="text-sm font-semibold text-slate-500 hover:text-adminprimary transition-colors cursor-pointer" onClick={() => navigate(`/${shop_id}/admin/menu`)}>Menu Management</a>
                            <a className="text-sm font-bold text-adminprimary border-b-2 border-adminprimary pb-1 cursor-pointer">Orders</a>
                            <a className="text-sm font-semibold text-slate-500 hover:text-adminprimary transition-colors cursor-pointer" onClick={() => navigate(`/${shop_id}/admin/analytics`)}>Analytics</a>
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                    </div>
                </header>

                <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
                                <span className="material-symbols-outlined text-4xl text-adminprimary">receipt_long</span>
                                Store Orders
                            </h2>
                            <p className="text-slate-500 mt-2">Manage and review all incoming orders.</p>
                        </div>
                        <div className="flex gap-4">
                            <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                                Filter
                            </button>
                            <button className="flex items-center gap-2 bg-adminprimary text-white border border-transparent px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:opacity-90 transition-opacity">
                                <span className="material-symbols-outlined text-[18px]">download</span>
                                Export
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-adminprimary/10 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        <th className="p-4 pl-6 font-bold">Order ID</th>
                                        <th className="p-4 font-bold">Table</th>
                                        <th className="p-4 font-bold">Time</th>
                                        <th className="p-4 font-bold">Total</th>
                                        <th className="p-4 font-bold">Status</th>
                                        <th className="p-4 font-bold text-right pr-6">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.length > 0 ? orders.map((order, idx) => (
                                        <tr key={order.id} className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/20'}`}>
                                            <td className="p-4 pl-6 font-medium text-sm">#{order.id.toString().padStart(6, '0')}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-sm font-bold">
                                                    <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                                                        T-{order.table_id}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-slate-500 font-medium">
                                                {formatTime(order.created_at)}
                                            </td>
                                            <td className="p-4 font-bold text-slate-900">
                                                ¥{order.total_amount?.toLocaleString() || '0'}
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${getStatusStyle(order.status)}`}>
                                                    <span className="material-symbols-outlined text-[12px]">{getStatusIcon(order.status)}</span>
                                                    {order.status || 'PENDING'}
                                                </span>
                                            </td>
                                            <td className="p-4 pr-6 text-right">
                                                <button className="text-slate-400 hover:text-adminprimary transition-colors w-8 h-8 rounded-full hover:bg-adminprimary/10 flex items-center justify-center ml-auto">
                                                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                </button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="6" className="p-8 text-center text-slate-500">
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className="material-symbols-outlined text-4xl text-slate-300">receipt_long</span>
                                                    <p>No orders found for this store yet.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
