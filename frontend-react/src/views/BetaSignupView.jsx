import { useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
    QrCode, Sparkles, Gift, Users, ShieldCheck, Calendar, MapPin,
    CheckCircle, ArrowRight, AlertCircle, Star, MessageCircle,
} from 'lucide-react'

/**
 * /beta — ベータ店舗募集ランディング
 * 限定50店舗、6ヶ月無料 + 専属サポート
 */

const PREFECTURES = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
    '岐阜県', '静岡県', '愛知県', '三重県',
    '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県',
    '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

export default function BetaSignupView() {
    const [submitted, setSubmitted] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [form, setForm] = useState({
        owner_name: '',
        store_name: '',
        prefecture: '',
        city: '',
        email: '',
        phone: '',
        seats: '',
        current_pos: '',
        why_join: '',
    })
    const [agreed, setAgreed] = useState(false)
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (!form.owner_name.trim()) { setError('お名前を入力してください'); return }
        if (!form.store_name.trim()) { setError('店舗名を入力してください'); return }
        if (!form.email.includes('@')) { setError('有効なメールアドレスを入力してください'); return }
        if (!agreed) { setError('プライバシーポリシーへの同意が必要です'); return }

        setSubmitting(true)
        try {
            const payload = { ...form, seats: form.seats ? parseInt(form.seats, 10) : null }
            await axios.post('/api/beta/apply', payload)
            setSubmitted(true)
        } catch (e) {
            const detail = e.response?.data?.detail
            setError(typeof detail === 'string' ? detail : '送信に失敗しました。しばらくして再度お試しください。')
        } finally {
            setSubmitting(false)
        }
    }

    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center space-y-6">
                    <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">ご応募ありがとうございます！</h1>
                        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                            内容を確認のうえ、<strong className="text-slate-800">3営業日以内</strong>に<br />
                            担当者よりご連絡させていただきます。
                        </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left text-xs text-amber-900 space-y-1.5">
                        <p className="font-bold flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> ご確認のお願い</p>
                        <ul className="list-disc list-inside space-y-0.5 leading-relaxed text-amber-800/90">
                            <li>受付確認メールをお送りしました</li>
                            <li>迷惑メールに振り分けられている可能性があります</li>
                            <li>ご質問は support@qraku.com まで</li>
                        </ul>
                    </div>
                    <Link to="/" className="inline-flex items-center gap-1 text-rose-600 text-sm font-bold hover:underline">
                        トップページへ戻る <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50">

            {/* ── ヘッダー ── */}
            <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center">
                            <QrCode className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-black text-slate-800 tracking-tight">QRaku</span>
                    </Link>
                    <a href="#apply" className="text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-full transition-colors">
                        今すぐ応募する
                    </a>
                </div>
            </header>

            {/* ── HERO ── */}
            <section className="relative px-5 pt-12 pb-16 sm:pt-20 sm:pb-24 max-w-5xl mx-auto">
                <div className="absolute top-10 right-10 w-72 h-72 bg-rose-200/40 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-10 left-10 w-72 h-72 bg-amber-200/40 rounded-full blur-3xl pointer-events-none" />

                <div className="relative text-center space-y-6">
                    <div className="inline-flex items-center gap-2 bg-rose-100 text-rose-700 px-4 py-1.5 rounded-full text-xs font-black">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>限定 50店舗 募集中</span>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black text-slate-900 leading-tight tracking-tight">
                        最先端の QR 注文 POS を、<br className="hidden sm:block" />
                        <span className="text-rose-600">6ヶ月 無料</span> でお試しください
                    </h1>
                    <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                        QRaku ベータ店舗様には、通常 月¥3,480 のサービスを <strong className="text-slate-900">6ヶ月間 無料</strong>でご利用いただけます。<br />
                        ご意見をいただきながら、一緒に日本の飲食店の未来を作りませんか?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                        <a href="#apply" className="inline-flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-black px-8 py-4 rounded-2xl shadow-lg shadow-rose-500/30 transition-all hover:scale-105">
                            無料で応募する <ArrowRight className="w-5 h-5" />
                        </a>
                        <a href="/demo" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-8 py-4 rounded-2xl border border-slate-200 transition-colors">
                            デモを見る
                        </a>
                    </div>
                </div>
            </section>

            {/* ── 5つの特典 ── */}
            <section className="px-5 pb-16 max-w-5xl mx-auto">
                <h2 className="text-center text-2xl sm:text-3xl font-black text-slate-900 mb-3">
                    ベータ店舗様 だけの特典
                </h2>
                <p className="text-center text-sm text-slate-500 mb-10">通常プランにはない、ベータ店舗様限定のメリット</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                        {
                            icon: <Gift className="w-6 h-6" />,
                            title: '6ヶ月 無料',
                            desc: '通常 月¥3,480 のサービスを6ヶ月間、完全無料でご利用いただけます。',
                            color: 'rose',
                        },
                        {
                            icon: <Users className="w-6 h-6" />,
                            title: '専属サポート',
                            desc: '導入から運用まで、専属担当者が直接サポート。LINEで即時対応します。',
                            color: 'amber',
                        },
                        {
                            icon: <Star className="w-6 h-6" />,
                            title: 'お店をPR',
                            desc: 'QRaku 公式サイトと SNS で、お店の魅力を全国に発信します。',
                            color: 'indigo',
                        },
                        {
                            icon: <Sparkles className="w-6 h-6" />,
                            title: '機能リクエスト優先',
                            desc: 'ご要望をいただいた機能は最優先で開発・実装します。',
                            color: 'emerald',
                        },
                        {
                            icon: <ShieldCheck className="w-6 h-6" />,
                            title: '7ヶ月目以降も特別価格',
                            desc: 'ベータ期間終了後も、ご希望のプランを 30%割引 でご継続いただけます。',
                            color: 'violet',
                        },
                        {
                            icon: <Calendar className="w-6 h-6" />,
                            title: '解約自由',
                            desc: '6ヶ月以内の解約は完全無料。違約金や縛りは一切ありません。',
                            color: 'slate',
                        },
                    ].map((b, i) => (
                        <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 hover:shadow-lg hover:border-rose-200 transition-all">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-${b.color}-100 text-${b.color}-600`}>
                                {b.icon}
                            </div>
                            <h3 className="font-black text-slate-900 mb-1.5">{b.title}</h3>
                            <p className="text-sm text-slate-500 leading-relaxed">{b.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── 募集条件 ── */}
            <section className="px-5 py-16 bg-white border-y border-slate-100">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3 text-center">募集条件</h2>
                    <p className="text-center text-sm text-slate-500 mb-10">以下の条件を満たすお店様を募集しています</p>

                    <div className="space-y-3">
                        {[
                            '日本国内で営業されている飲食店であること',
                            '店内にWi-Fi環境があること（モバイル通信でもOK）',
                            'スマートフォンまたはタブレットを業務で使用できること',
                            '導入後、簡単なアンケート（月1回程度）にご協力いただけること',
                            'よろしければ、導入事例として店舗名を紹介させていただける方',
                        ].map((c, i) => (
                            <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl p-4">
                                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-slate-700 leading-relaxed">{c}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── 応募フォーム ── */}
            <section id="apply" className="px-5 py-16 max-w-3xl mx-auto scroll-mt-20">
                <div className="text-center mb-10">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-3">応募フォーム</h2>
                    <p className="text-sm text-slate-500">必要事項をご記入のうえ、送信してください。3営業日以内にご連絡いたします。</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-10 space-y-5">

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700 font-bold">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="お名前 *" required>
                            <input type="text" required value={form.owner_name} onChange={e => set('owner_name', e.target.value)}
                                placeholder="例: 田中 太郎" className="input-style" />
                        </Field>
                        <Field label="店舗名 *" required>
                            <input type="text" required value={form.store_name} onChange={e => set('store_name', e.target.value)}
                                placeholder="例: 麺屋 さくら" className="input-style" />
                        </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="メールアドレス *" required>
                            <input type="email" required value={form.email} onChange={e => set('email', e.target.value)}
                                placeholder="example@email.com" className="input-style" />
                        </Field>
                        <Field label="電話番号">
                            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                                placeholder="03-1234-5678" className="input-style" />
                        </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="都道府県">
                            <select value={form.prefecture} onChange={e => set('prefecture', e.target.value)} className="input-style bg-white">
                                <option value="">選択してください</option>
                                {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </Field>
                        <Field label="市区町村">
                            <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                                placeholder="例: 渋谷区" className="input-style" />
                        </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="席数">
                            <input type="number" min="1" value={form.seats} onChange={e => set('seats', e.target.value)}
                                placeholder="例: 30" className="input-style" />
                        </Field>
                        <Field label="現在使用中のPOS / 注文システム">
                            <input type="text" value={form.current_pos} onChange={e => set('current_pos', e.target.value)}
                                placeholder="例: なし / Square / Airレジ など" className="input-style" />
                        </Field>
                    </div>

                    <Field label="応募理由・ご要望（任意）">
                        <textarea rows={5} value={form.why_join} onChange={e => set('why_join', e.target.value)}
                            placeholder="現在のお困りごとや、QRakuに期待することなど、お気軽にお書きください。"
                            maxLength={2000}
                            className="input-style resize-none" />
                        <p className="text-xs text-slate-400 text-right mt-1">{form.why_join.length}/2000</p>
                    </Field>

                    <label className="flex items-start gap-3 cursor-pointer pt-2">
                        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                            className="mt-1 w-4 h-4 accent-rose-500 shrink-0" />
                        <span className="text-xs text-slate-600 leading-relaxed">
                            <Link to="/privacy" target="_blank" className="underline text-rose-500 hover:text-rose-700">プライバシーポリシー</Link> に同意します。
                            個人情報は応募審査・ご連絡の目的のみで使用します。
                        </span>
                    </label>

                    <button
                        type="submit"
                        disabled={submitting || !agreed}
                        className="w-full py-5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white text-lg font-black rounded-2xl shadow-lg shadow-rose-500/30 transition-all hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 送信中...</>
                        ) : (
                            <>応募する <ArrowRight className="w-5 h-5" /></>
                        )}
                    </button>
                </form>
            </section>

            {/* ── FAQ ── */}
            <section className="px-5 py-16 bg-slate-50">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-10 text-center">よくあるご質問</h2>
                    <div className="space-y-4">
                        {[
                            { q: 'ベータ期間中に解約できますか?', a: 'はい。違約金や縛りは一切ありません。いつでも自由に解約いただけます。' },
                            { q: '導入にはどれくらい時間がかかりますか?', a: '最短1日でご利用開始可能です。担当者がリモートで設定をサポートします。' },
                            { q: '今使っているPOSと併用できますか?', a: 'はい。QRakuはQR注文に特化しているため、既存のPOSと併用可能です。' },
                            { q: '6ヶ月後はどうなりますか?', a: 'ご希望のプランで継続利用、または解約をお選びいただけます。継続の場合は30%割引が適用されます。' },
                            { q: '応募してから連絡までどれくらいかかりますか?', a: '通常3営業日以内にご連絡いたします。応募が集中した場合はお時間をいただくことがあります。' },
                        ].map((f, i) => (
                            <details key={i} className="group bg-white rounded-xl border border-slate-100 overflow-hidden">
                                <summary className="cursor-pointer p-5 font-bold text-slate-800 hover:bg-slate-50 flex items-center justify-between gap-4">
                                    <span>Q. {f.q}</span>
                                    <span className="text-rose-500 group-open:rotate-180 transition-transform shrink-0">▼</span>
                                </summary>
                                <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-50">
                                    A. {f.a}
                                </div>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── フッター ── */}
            <footer className="px-5 py-10 text-center bg-slate-900 text-slate-400 text-xs">
                <p className="font-black text-white text-base mb-2">QRaku</p>
                <p>飲食店向け QR 注文・POS サービス</p>
                <p className="mt-3">
                    <Link to="/" className="hover:text-white transition-colors">トップ</Link>
                    <span className="mx-2 opacity-30">|</span>
                    <Link to="/terms" className="hover:text-white transition-colors">利用規約</Link>
                    <span className="mx-2 opacity-30">|</span>
                    <Link to="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link>
                </p>
                <p className="mt-4 opacity-60">© 2026 QRaku</p>
            </footer>

            <style>{`
                .input-style {
                    width: 100%;
                    padding: 12px 14px;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    font-size: 14px;
                    color: #1e293b;
                    transition: border-color 0.15s, box-shadow 0.15s;
                    outline: none;
                }
                .input-style:focus {
                    border-color: #f43f5e;
                    box-shadow: 0 0 0 3px rgba(244,63,94,0.1);
                }
                .input-style::placeholder { color: #cbd5e1; }
            `}</style>
        </div>
    )
}

function Field({ label, required, children }) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-700 tracking-wide uppercase">{label}</label>
            {children}
        </div>
    )
}
