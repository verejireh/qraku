/**
 * AdminLoginView — Admin 로그인 페이지
 * - 이메일 + 비밀번호 로그인
 * - Google OAuth
 * - LINE OAuth
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { setAdminToken } from '../hooks/useAdminApi'

export default function AdminLoginView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showPass, setShowPass] = useState(false)

    const handleEmailLogin = async (e) => {
        e.preventDefault()
        if (!email || !password) { setError('メールアドレスとパスワードを入力してください。'); return }
        setError('')
        setLoading(true)
        try {
            const res = await axios.post('/api/auth/admin/login', { email, password })
            setAdminToken(res.data.token)
            navigate(`/${res.data.slug}/admin`, { replace: true })
        } catch (err) {
            setError(err.response?.data?.detail || 'ログインに失敗しました。')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/10">
                        <span className="material-symbols-outlined text-3xl text-white">spa</span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">QRaku Admin</h1>
                    <p className="text-slate-400 text-sm mt-1">管理画面にログイン</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleEmailLogin} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1.5">メールアドレス</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); setError('') }}
                            placeholder="owner@example.com"
                            autoComplete="email"
                            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1.5">パスワード</label>
                        <div className="relative">
                            <input
                                type={showPass ? 'text' : 'password'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError('') }}
                                placeholder="6文字以上"
                                autoComplete="current-password"
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors pr-12"
                            />
                            <button type="button" onClick={() => setShowPass(!showPass)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-sm">{showPass ? 'visibility_off' : 'visibility'}</span>
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                            <p className="text-red-400 text-xs font-bold">{error}</p>
                        </div>
                    )}

                    <button type="submit" disabled={loading}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-all">
                        {loading ? 'ログイン中...' : 'ログイン'}
                    </button>
                </form>

                {/* Social Login */}
                <div className="mt-6 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-slate-500 font-bold">または</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    <a href="/api/auth/google"
                        className="w-full py-3 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-colors">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Googleでログイン
                    </a>

                    <a href="/api/auth/line"
                        className="w-full py-3 bg-[#06C755] hover:bg-[#05b34d] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-colors">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2C6.48 2 2 5.82 2 10.5c0 4.21 3.74 7.74 8.79 8.4.34.07.81.22.92.51.1.26.07.66.03.92l-.15.9c-.05.27-.21 1.05.92.57s6.13-3.61 8.36-6.18C22.55 13.73 22 12.18 22 10.5 22 5.82 17.52 2 12 2z" />
                        </svg>
                        LINEでログイン
                    </a>
                </div>

                {/* Signup Link */}
                <div className="mt-6 text-center">
                    <p className="text-slate-500 text-xs">
                        アカウントをお持ちでない方は{' '}
                        <a href="/owner/signup" className="text-indigo-400 hover:text-indigo-300 font-bold">新規登録</a>
                    </p>
                </div>
            </div>
        </div>
    )
}
