import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { setAdminToken } from '../hooks/useAdminApi'
import { QrCode, Store, User, MapPin, Utensils, ChevronRight, ArrowLeft, CheckCircle, Eye, EyeOff } from 'lucide-react'

const STORE_CATEGORIES = [
    { value: 'restaurant', label: '🍽️ レストラン・食堂' },
    { value: 'cafe', label: '☕ カフェ・喫茶店' },
    { value: 'bar', label: '🍺 バー・居酒屋' },
    { value: 'other', label: '🏪 その他' },
]

export default function OwnerSignUpView() {
    const navigate = useNavigate()
    const [step, setStep] = useState(1) // 1: アカウント, 2: 店舗情報
    const [loading, setLoading] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [createdStore, setCreatedStore] = useState(null)

    const [agreedTerms, setAgreedTerms] = useState(false)

    const [form, setForm] = useState({
        // ステップ1
        owner_name: '',
        email: '',
        password: '',
        // ステップ2
        store_name: '',
        store_name_en: '',
        category: 'restaurant',
        address: '',
        phone: '',
    })

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

    const validateStep1 = () => {
        if (!form.owner_name.trim()) return 'お名前を入力してください'
        if (!form.email.includes('@')) return '有効なメールアドレスを入力してください'
        if (form.password.length < 8) return 'パスワードは8文字以上で入力してください'
        if (!/[A-Z]/.test(form.password)) return 'パスワードに大文字を1文字以上含めてください'
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(form.password)) return 'パスワードに特殊文字を1文字以上含めてください（例: !@#$%）'
        return ''
    }

    const validateStep2 = () => {
        if (!form.store_name.trim()) return '店舗名を入力してください'
        if (!form.category) return '店舗カテゴリを選択してください'
        if (!agreedTerms) return '利用規約と個人情報保護方針への同意が必要です'
        return ''
    }

    const handleNext = () => {
        const err = validateStep1()
        if (err) { setError(err); return }
        setError('')
        setStep(2)
    }

    const handleSubmit = async () => {
        const err = validateStep2()
        if (err) { setError(err); return }
        setError('')
        setLoading(true)

        try {
            // 1. オーナー用スラッグを生成（メールのローカルパート + ランダム）
            const slugBase = form.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
            const slug = `${slugBase}${Math.floor(1000 + Math.random() * 9000)}`

            // 2. Store 作成 (パスワードハッシュ付き)
            const signupPayload = {
                owner_name: form.owner_name,
                email: form.email,
                password: form.password,
                store_name: form.store_name,
                category: form.category,
                slug,
                address: form.address || '',
                phone: form.phone || '',
            }
            const storeRes = await axios.post('/api/stores/signup', signupPayload)
            const store = storeRes.data.store
            // JWT 토큰 저장 → 바로 admin 페이지 접근 가능
            if (storeRes.data.token) {
                setAdminToken(storeRes.data.token)
            }
            setCreatedStore(store)
            setDone(true)
        } catch (e) {
            const detail = e.response?.data?.detail
            if (typeof detail === 'string') {
                setError(detail)
            } else if (Array.isArray(detail)) {
                setError(detail.map(d => d.msg).join(', '))
            } else {
                setError('登録に失敗しました。しばらくしてから再度お試しください。')
            }
        } finally {
            setLoading(false)
        }
    }

    // ── 完了画面 ──────────────────────────────────────────────────────────────
    if (done && createdStore) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
                <div className="w-full max-w-md text-center space-y-8">
                    <div className="w-24 h-24 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto animate-bounce">
                        <CheckCircle className="w-12 h-12 text-emerald-500" />
                    </div>
                    <div className="space-y-3">
                        <h1 className="text-3xl font-black text-slate-900">登録完了！🎉</h1>
                        <p className="text-slate-500 leading-relaxed">
                            <strong className="text-slate-900">{createdStore.name}</strong> の60日間無料体験が始まりました。<br />
                            管理者ページでメニューとテーブルを設定しましょう.
                        </p>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 text-left space-y-2 shadow-sm">
                        <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">あなたの管理URL</p>
                        <p className="text-rose-500 font-mono text-sm break-all">
                            {window.location.origin}/{createdStore.slug || createdStore.id}/admin
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => navigate(`/${createdStore.slug || createdStore.id}/admin`)}
                            className="w-full py-4 rounded-2xl font-black text-white shadow-lg shadow-rose-200"
                            style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                        >
                            管理ページへ進む →
                        </button>
                        <button onClick={() => navigate('/')} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                            トップに戻る
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ── 폼 화면 ────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .btn-primary { background: linear-gradient(135deg, #f43f5e, #e11d48); transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(244,63,94,0.3); }
        .input-field {
          width: 100%;
          padding: 14px 16px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          color: #0f172a;
          font-size: 15px;
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus { border-color: #f43f5e; box-shadow: 0 0 0 4px rgba(244,63,94,0.1); }
        .input-field::placeholder { color: #94a3b8; }
      `}</style>

            <div className="w-full max-w-md space-y-6">
                {/* ヘッダー */}
                <div className="text-center space-y-2">
                    <button onClick={() => navigate('/')} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors text-sm mx-auto mb-4">
                        <ArrowLeft className="w-4 h-4" /> トップへ戻る
                    </button>
                    <div className="flex justify-center">
                        <div className="w-12 h-12 rounded-2xl bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-200">
                            <QrCode className="w-7 h-7 text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900">QRakuに登録する</h1>
                    <p className="text-slate-500 text-sm">60日間、全機能を無料でお試しください</p>
                </div>

                {/* ステッププログレス */}
                <div className="flex items-center gap-2">
                    {[1, 2].map(s => (
                        <div key={s} className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${step >= s ? 'bg-rose-500' : 'bg-slate-200'}`} />
                    ))}
                </div>
                <p className="text-xs text-slate-400 text-center font-bold">
                    ステップ {step} / 2 — {step === 1 ? 'アカウント情報' : '店舗情報'}
                </p>

                {/* カード */}
                <div className="bg-white rounded-3xl p-8 space-y-5 border border-slate-100 shadow-xl shadow-slate-200/50">

                    {error && (
                        <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-500 text-sm font-bold">
                            ⚠️ {error}
                        </div>
                    )}

                    {step === 1 ? (
                        // ── ステップ1: 계정 ──
                        <div className="space-y-4">
                            {/* ソーシャルログイン */}
                            <div className="space-y-2">
                                <a
                                    href="/api/auth/google"
                                    className="flex items-center justify-center gap-3 w-full py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-700 font-bold text-sm"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                    </svg>
                                    Googleで登録
                                </a>
                                <a
                                    href="/api/auth/line"
                                    className="flex items-center justify-center gap-3 w-full py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-700 font-bold text-sm"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#06C755">
                                        <path d="M12 2C6.477 2 2 6.03 2 11.01c0 4.49 3.663 8.25 8.614 8.919.334.072.79.22.905.506.104.261.068.669.033.933l-.147.882c-.045.26-.206 1.016.89.554 1.096-.462 5.913-3.483 8.07-5.963C21.622 14.985 22 13.054 22 11.01 22 6.03 17.523 2 12 2z"/>
                                    </svg>
                                    LINEで登録
                                </a>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-slate-100" />
                                <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">または</span>
                                <div className="flex-1 h-px bg-slate-100" />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                    <User className="w-3 h-3" /> オーナー名（ニックネーム可）
                                </label>
                                <input
                                    className="input-field"
                                    placeholder="例: 田中 太郎"
                                    value={form.owner_name}
                                    onChange={e => set('owner_name', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">メールアドレス</label>
                                <input
                                    className="input-field"
                                    type="email"
                                    placeholder="example@email.com"
                                    value={form.email}
                                    onChange={e => set('email', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">パスワード（8文字以上、大文字・特殊文字を含む）</label>
                                <div className="relative">
                                    <input
                                        className="input-field pr-12"
                                        type={showPass ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={form.password}
                                        onChange={e => set('password', e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass(p => !p)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {form.password && (
                                    <div className="flex flex-wrap gap-2 mt-2 text-[10px] font-bold">
                                        <span className={form.password.length >= 8 ? 'text-emerald-500' : 'text-slate-400'}>
                                            {form.password.length >= 8 ? '✓' : '○'} 8文字以上
                                        </span>
                                        <span className={/[A-Z]/.test(form.password) ? 'text-emerald-500' : 'text-slate-400'}>
                                            {/[A-Z]/.test(form.password) ? '✓' : '○'} 大文字
                                        </span>
                                        <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(form.password) ? 'text-emerald-500' : 'text-slate-400'}>
                                            {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(form.password) ? '✓' : '○'} 特殊文字
                                        </span>
                                    </div>
                                )}
                            </div>
                            <button onClick={handleNext} className="btn-primary w-full py-4 rounded-2xl font-black text-white flex items-center justify-center gap-2 shadow-lg shadow-rose-200">
                                次へ — 店舗情報を入力 <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        // ── ステップ2: 매장 정보 ──
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                    <Store className="w-3 h-3" /> 店舗名 *
                                </label>
                                <input
                                    className="input-field"
                                    placeholder="例: 麺屋 さくら"
                                    value={form.store_name}
                                    onChange={e => set('store_name', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                    <Utensils className="w-3 h-3" /> 店舗カテゴリ *
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {STORE_CATEGORIES.map(cat => (
                                        <button
                                            key={cat.value}
                                            type="button"
                                            onClick={() => set('category', cat.value)}
                                            className={`p-3 rounded-xl border text-sm font-bold transition-all text-left ${form.category === cat.value
                                                ? 'border-rose-500 bg-rose-50 text-rose-600 shadow-sm'
                                                : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}`}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> 住所（任意）
                                </label>
                                <input
                                    className="input-field"
                                    placeholder="例: 東京都渋谷区○○ 1-2-3"
                                    value={form.address}
                                    onChange={e => set('address', e.target.value)}
                                />
                            </div>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={agreedTerms}
                                    onChange={e => setAgreedTerms(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 accent-rose-500 flex-shrink-0"
                                />
                                <span className="text-xs text-slate-500 leading-relaxed">
                                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-rose-500 hover:text-rose-600 font-bold transition-colors">利用規約</a>と
                                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-rose-500 hover:text-rose-600 font-bold transition-colors">個人情報保護方針</a>
                                    に同意します <span className="text-rose-500">*</span>
                                </span>
                            </label>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setStep(1); setError('') }}
                                    className="flex-1 py-4 rounded-2xl border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                                >
                                    <ArrowLeft className="w-4 h-4" /> 戻る
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || !agreedTerms}
                                    className="btn-primary flex-[2] py-4 rounded-2xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-rose-200"
                                >
                                    {loading ? (
                                        <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 登録中...</>
                                    ) : (
                                        <>無料体験を開始する 🚀</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
