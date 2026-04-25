import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import axios from 'axios'

export default function ScanLandingView() {
    const { shop_id, tableNumber } = useParams()
    const { setSession } = useSession()
    const navigate = useNavigate()
    const location = useLocation()
    const [storeName, setStoreName] = useState('Restaurant')
    const [statusText, setStatusText] = useState('Initializing...')

    useEffect(() => {
        const init = async () => {
            const queryParams = new URLSearchParams(location.search)
            const qrToken = queryParams.get('token')

            if (shop_id && tableNumber) {
                try {
                    setStatusText('Connecting to store...')
                    const res = await axios.get(`/api/stores/${shop_id}`)
                    setStoreName(res.data.name_ko || res.data.name_jp || res.data.name)

                    if (qrToken) {
                        setStatusText('Securing session...')
                        // Register Device Session
                        const sessionRes = await axios.post('/api/sessions/register', {
                            shop_id: parseInt(shop_id),
                            table_number: tableNumber,
                            qr_token: qrToken
                        })

                        setSession(shop_id, tableNumber, sessionRes.data.device_token)
                        // Also store qrToken in session for order calls
                        sessionStorage.setItem('qrToken', qrToken)
                    }

                    setStatusText('Ready!')
                    setTimeout(() => {
                        navigate(`/${shop_id}/menu${location.search}`, { replace: true })
                    }, 1200)
                } catch (e) {
                    console.error("Failed to initialize session", e)
                    setStatusText('Guest Mode (API Error). Proceeding...')
                    setTimeout(() => {
                        navigate(`/${shop_id}/menu${location.search}`, { replace: true })
                    }, 1200)
                }
            } else {
                setStatusText('Guest Mode. Proceeding...')
                setTimeout(() => {
                    navigate(`/${shop_id || '1234567'}/menu${location.search}`, { replace: true })
                }, 1200)
            }
        }
        init()
    }, [shop_id, tableNumber, location.search, setSession, navigate])

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#1a1a1a] text-white text-center p-8 font-serif">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-8 border border-primary/20 animate-pulse">
                <span className="material-symbols-outlined text-4xl text-primary">restaurant</span>
            </div>

            <h1 className="text-3xl font-bold mb-2">Welcome to</h1>
            <h2 className="text-4xl italic text-primary mb-6">{storeName}</h2>

            <div className="px-6 py-2 bg-white/5 border border-white/10 rounded-full mb-12">
                <span className="text-slate-400 uppercase tracking-widest text-xs font-bold">Table No.</span>
                <span className="text-xl font-bold ml-2">{tableNumber}</span>
            </div>

            <div className="flex items-center gap-3 text-slate-500">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p>{statusText}</p>
            </div>
        </div>
    )
}
