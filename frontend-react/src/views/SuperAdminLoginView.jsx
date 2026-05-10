import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Shield, Lock } from 'lucide-react'

export default function SuperAdminLoginView() {
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!password) return
        setLoading(true)
        setError('')
        try {
            const res = await axios.post('/api/super-admin/login', { password })
            const token = res.data?.token
            if (!token) throw new Error('No token returned')
            localStorage.setItem('super_admin_token', token)
            navigate('/super-admin', { replace: true })
        } catch (err) {
            const detail = err.response?.data?.detail || err.message
            setError(typeof detail === 'string' ? detail : 'ログインに失敗しました')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4">
                        <Shield className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Super Admin</h1>
                    <p className="text-slate-400 text-sm mt-1">プラットフォーム管理者専用</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">パスワード</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                                className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !password}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
                    >
                        {loading ? 'ログイン中...' : 'ログイン'}
                    </button>
                </form>

                <p className="text-center text-xs text-slate-500 mt-6">
                    不正アクセスは記録され、法的措置の対象となります
                </p>
            </div>
        </div>
    )
}
