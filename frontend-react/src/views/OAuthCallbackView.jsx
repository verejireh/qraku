import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { setAdminToken } from '../hooks/useAdminApi'
import { QrCode, Store, MapPin, Utensils, ArrowLeft, CheckCircle, AlertCircle, Link as LinkIcon, Check, X } from 'lucide-react'

const STORE_CATEGORIES = [
    { value: 'restaurant', label: '🍽️ レストラン・食堂' },
    { value: 'cafe', label: '☕ カフェ・喫茶店' },
    { value: 'bar', label: '🍺 バー・居酒屋' },
    { value: 'other', label: '🏪 その他' },
]

export default function OAuthCallbackView() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [loading, setLoading] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [createdStore, setCreatedStore] = useState(null)

    const token = searchParams.get('token')

    // token から表示名・メールを base64 デコードして取得（検証はバックエンドが行う）
    const getPayload = () => {
        if (!token) return {}
        try {
            const base64 = token.split('.')[1]
            return JSON.parse(atob(base64.replace(/-/g, '+').replace(/_/g, '/')))
        } catch {
            return {}
        }
    }
    const payload = getPayload()

    const [form, setForm] = useState({
        store_name: '',
        category: 'restaurant',
        address: '',
        phone: '',
        owner_name: payload.name || '',
        shop_id: '',
    })
    const [agreedTerms, setAgreedTerms] = useState(false)
    const [slugStatus, setSlugStatus] = useState({ checking: false, available: null, message: '' })
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

    // shop_id 실시간 가용성 체크 (debounce 500ms)
    useEffect(() => {
        if (!form.shop_id || form.shop_id.length < 3) {
            setSlugStatus({ checking: false, available: null, message: '' })
            return
        }
        setSlugStatus({ checking: true, available: null, message: '' })
        const timer = setTimeout(async () => {
            try {
                const res = await axios.get(`/api/auth/check-slug?slug=${encodeURIComponent(form.shop_id)}`)
                setSlugStatus({ checking: false, available: res.data.available, message: res.data.message })
            } catch {
                setSlugStatus({ checking: false, available: false, message: '確認に失敗しました' })
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [form.shop_id])

    useEffect(() => {
        if (!token) {
            setError('無効なリクエストです。最初からやり直してください。')
        }
    }, [token])

    const handleSubmit = async () => {
        if (!form.store_name.trim()) { setError('店舗名を入力してください'); return }
        if (!form.shop_id.trim()) { setError('shop_id を入力してください'); return }
        if (slugStatus.available !== true) { setError('使用可能な shop_id を入力してください'); return }
        if (!agreedTerms) { setError('利用規約と個人情報保護方針への同意が必要です'); return }
        setError('')
        setLoading(true)

        try {
            const res = await axios.post('/api/auth/complete-oauth-signup', {
                oauth_token: token,
                store_name: form.store_name,
                category: form.category,
                address: form.address || '',
                phone: form.phone || '',
                owner_name: form.owner_name || '',
                slug: form.shop_id.trim().toLowerCase(),
            })
            const storeData = res.data.store || res.data
            if (res.data.token) {
                setAdminToken(res.data.token)
            }
            setCreatedStore(storeData)
            setDone(true)
        } catch (e) {
            const detail = e.response?.data?.detail
            setError(typeof detail === 'string' ? detail : '登録に失敗しました。もう一度お試しください。')
        } finally {
            setLoading(false)
        }
    }

    // ── 完了画面 ──────────────────────────────────────────────────────────────
    if (done && createdStore) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
                <div className="w-full max-w-md text-center space-y-8">
                    <div className="w-24 h-24 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto animate-bounce">
                        <CheckCircle className="w-12 h-12 text-emerald-400" />
                    </div>
                    <div className="space-y-3">
                        <h1 className="text-3xl font-black text-white">登録完了！🎉</h1>
                        <p className="text-slate-400 leading-relaxed">
                            <strong className="text-white">{createdStore.name}</strong> の14日間無料体験が始まりました。
                        </p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-left space-y-2">
                        <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">あなたの管理URL</p>
                        <p className="text-rose-400 font-mono text-sm break-all">
                            {window.location.origin}/{createdStore.slug || createdStore.id}/admin
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(`/${createdStore.slug || createdStore.id}/admin`)}
                        className="w-full py-4 rounded-2xl font-black text-white"
                        style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)', boxShadow: '0 12px 40px rgba(244,63,94,0.35)' }}
                    >
                        管理ページへ進む →
                    </button>
                </div>
            </div>
        )
    }

    // ── エラー画面 ────────────────────────────────────────────────────────────
    if (!token) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
                <div className="w-full max-w-md text-center space-y-6">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
                    <h1 className="text-2xl font-black text-white">エラーが発生しました</h1>
                    <p className="text-slate-400">{error || '無効なリクエストです'}</p>
                    <button onClick={() => navigate('/owner/signup')} className="text-rose-400 hover:underline text-sm">
                        登録ページに戻る
                    </button>
                </div>
            </div>
        )
    }

    // ── 店舗情報入力画面 ──────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
            <style>{`
                .input-field {
                    width: 100%;
                    padding: 14px 16px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 14px;
                    color: white;
                    font-size: 15px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .input-field:focus { border-color: rgba(244,63,94,0.5); }
                .input-field::placeholder { color: rgba(255,255,255,0.2); }
                .btn-primary { background: linear-gradient(135deg, #f43f5e, #e11d48); transition: all 0.2s; }
                .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(244,63,94,0.3); }
            `}</style>

            <div className="w-full max-w-md space-y-6">
                <div className="text-center space-y-2">
                    <button onClick={() => navigate('/owner/signup')} className="flex items-center gap-1 text-slate-500 hover:text-white transition-colors text-sm mx-auto mb-4">
                        <ArrowLeft className="w-4 h-4" /> 戻る
                    </button>
                    <div className="flex justify-center">
                        <div className="w-12 h-12 rounded-2xl bg-rose-500 flex items-center justify-center">
                            <QrCode className="w-7 h-7 text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-black text-white">あと少しです！</h1>
                    {payload.name && (
                        <p className="text-slate-400 text-sm">
                            ようこそ、<span className="text-white font-bold">{payload.name}</span> さん
                        </p>
                    )}
                    <p className="text-slate-500 text-sm">店舗情報を入力してください</p>
                </div>

                <div className="rounded-3xl p-8 space-y-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {error && (
                        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold">
                            ⚠️ {error}
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Store className="w-3 h-3" /> 店舗名 *
                        </label>
                        <input
                            className="input-field"
                            placeholder="例: 麺屋 さくら"
                            value={form.store_name}
                            onChange={e => set('store_name', e.target.value)}
                        />
                    </div>

                    {/* ── shop_id (お店専用 URL) ─────────────────────────── */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" /> shop_id (お店専用 URL) *
                        </label>
                        <div className="flex items-center gap-1 px-3 rounded-2xl bg-white/5 border border-white/10 focus-within:border-rose-500/50 transition-colors">
                            <span className="text-slate-500 text-sm font-mono shrink-0">qraku.com/</span>
                            <input
                                className="flex-1 bg-transparent py-3 outline-none text-white text-sm font-mono placeholder:text-white/20"
                                placeholder="menya-sakura"
                                value={form.shop_id}
                                onChange={e => set('shop_id', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                maxLength={30}
                            />
                            <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                                {slugStatus.checking && <div className="w-3 h-3 border-2 border-rose-500/50 border-t-rose-500 rounded-full animate-spin" />}
                                {slugStatus.available === true && <Check className="w-4 h-4 text-emerald-400" />}
                                {slugStatus.available === false && <X className="w-4 h-4 text-red-400" />}
                            </span>
                        </div>
                        <p className={`text-xs mt-1 px-1 leading-relaxed ${
                            slugStatus.available === true ? 'text-emerald-400' :
                            slugStatus.available === false ? 'text-red-400' :
                            'text-slate-500'
                        }`}>
                            {slugStatus.message || '英小文字・数字・ハイフン (-) のみ、3〜30文字。後から変更可能です'}
                        </p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Utensils className="w-3 h-3" /> 店舗カテゴリ *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {STORE_CATEGORIES.map(cat => (
                                <button
                                    key={cat.value}
                                    type="button"
                                    onClick={() => set('category', cat.value)}
                                    className={`p-3 rounded-xl border text-sm font-bold transition-all text-left ${form.category === cat.value
                                        ? 'border-rose-500 bg-rose-500/10 text-rose-300'
                                        : 'border-white/8 bg-white/3 text-slate-400 hover:border-white/20'}`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> 住所
                        </label>
                        <input
                            className="input-field"
                            placeholder="例: 東京都渋谷区○○ 1-2-3"
                            value={form.address}
                            onChange={e => set('address', e.target.value)}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">電話番号</label>
                        <input
                            className="input-field"
                            type="tel"
                            placeholder="例: 03-1234-5678"
                            value={form.phone}
                            onChange={e => set('phone', e.target.value)}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">代表者名</label>
                        <input
                            className="input-field"
                            placeholder="例: 田中 太郎"
                            value={form.owner_name}
                            onChange={e => set('owner_name', e.target.value)}
                        />
                    </div>

                    {/* 利用規約 */}
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={agreedTerms}
                            onChange={e => setAgreedTerms(e.target.checked)}
                            className="mt-0.5 w-4 h-4 accent-rose-500 flex-shrink-0"
                        />
                        <span className="text-xs text-slate-400 leading-relaxed">
                            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-rose-400 hover:text-rose-300">利用規約</a>と
                            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-rose-400 hover:text-rose-300">個人情報保護方針</a>
                            に同意します <span className="text-rose-400">*</span>
                        </span>
                    </label>

                    <button
                        onClick={handleSubmit}
                        disabled={loading || !agreedTerms}
                        className="btn-primary w-full py-4 rounded-2xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {loading ? (
                            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 登録中...</>
                        ) : (
                            <>無料体験を開始する 🚀</>
                        )}
                    </button>
                </div>

                <p className="text-center text-slate-600 text-xs">
                    登録により <span className="underline cursor-pointer hover:text-slate-400">利用規約</span> および{' '}
                    <span className="underline cursor-pointer hover:text-slate-400">個人情報保護方針</span> に同意したものとみなされます
                </p>
            </div>
        </div>
    )
}
