import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function DemoView() {
    const navigate = useNavigate()
    const [status, setStatus] = useState('デモ店舗に接続中...')
    const [error, setError] = useState(null)

    useEffect(() => {
        setStatus('準備完了！デモページへ移動します...')
        // Showcase page handles its own table setup via /api/demo/start-showcase
        sessionStorage.setItem('demo_mode', 'true')
        setTimeout(() => {
            navigate('/demo/showcase', { replace: true })
        }, 800)
    }, [navigate])

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#fff8f7] text-[#201a1b] text-center p-8 font-serif">
            {/* Logo / Icon */}
            <div className="w-24 h-24 rounded-full bg-[#ffd9df] border border-[#ffb7c5] flex items-center justify-center mb-8 animate-pulse shadow-xl">
                <span className="text-5xl">🌸</span>
            </div>

            <h1 className="text-3xl font-bold mb-2 font-sans tracking-tight">QRaku Order</h1>
            <p className="text-[#514345] text-sm mb-8 font-sans">デモ体験</p>

            {error ? (
                <div className="space-y-4">
                    <p className="text-red-600 bg-red-50 border border-red-200 px-6 py-4 rounded-2xl text-sm font-sans">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-3 bg-primary rounded-full text-white font-bold hover:opacity-90 transition-opacity font-sans"
                    >
                        再試行
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-3 text-[#514345] bg-white px-6 py-4 rounded-full shadow-sm border border-[#ebe0e0]">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="font-sans font-medium">{status}</p>
                </div>
            )}
        </div>
    )
}
