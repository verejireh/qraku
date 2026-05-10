import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Star, AlertTriangle, X, ExternalLink, Calendar, Crown, Info, Camera } from 'lucide-react'

const PLANS = [
    { key: 'monthly', label: '月額プラン', period: '/月', standard: 3480, dataOpen: 2480, tag: null },
    { key: 'sixmonth', label: '6ヶ月プラン', period: '/6ヶ月', standard: 17880, dataOpen: 11880, tag: '約15%お得' },
    { key: 'yearly', label: '12ヶ月プラン', period: '/年', standard: 29800, dataOpen: 17800, tag: '最安値・約40%お得' },
]

const FEATURES = [
    '無制限のQR注文処理',
    'リアルタイム キッチンディスプレイ(KDS)',
    '多言語メニュー対応 (日/英/韓/中)',
    '統計ダッシュボード',
    'WebSocket リアルタイム通知',
    'レシート・厨房伝票印刷',
]

const yen = (n) => `¥${n.toLocaleString()}`

/* ── TSUBAKI color tokens ── */
const T = {
    red: '#C41E3A',
    redLight: '#E8354F',
    redSoft: '#FFF0F2',
    redBorder: '#F5C6CE',
    cream: '#FFFAF5',
    card: '#FFFFFF',
    border: '#F0E6DC',
    text: '#2D1A10',
    textSub: '#7A6555',
    textMuted: '#B5A699',
    gold: '#D4A017',
    goldBg: '#FFF8E7',
    goldBorder: '#F0D68A',
    green: '#2E8B57',
    greenBg: '#EEFBF3',
    greenBorder: '#B6E6CC',
}

export default function SubscriptionView({ onClose, storeData }) {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    const [subStatus, setSubStatus] = useState(null)
    const [loading, setLoading] = useState(true)
    const [selectedPlan, setSelectedPlan] = useState('monthly')
    const [dataOpen, setDataOpen] = useState(false)
    const [showReasonModal, setShowReasonModal] = useState(false)
    const [checkingOut, setCheckingOut] = useState(false)
    const [showAlreadySubModal, setShowAlreadySubModal] = useState(false)

    const isSuccess = searchParams.get('success') === '1'
    const isCancelled = searchParams.get('cancelled') === '1'

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await axios.get(`/api/billing/subscription-status/${shop_id}`)
                setSubStatus(res.data)
            } catch (e) {
                console.error('Subscription status fetch failed', e)
            } finally {
                setLoading(false)
            }
        }
        fetchStatus()
    }, [shop_id])

    const handleCheckout = async () => {
        setCheckingOut(true)
        try {
            const res = await axios.post(
                `/api/billing/checkout-session?store_id=${shop_id}&plan=${selectedPlan}&data_open=${dataOpen}`
            )
            if (res.data.checkout_url) {
                window.location.href = res.data.checkout_url
            }
        } catch (e) {
            const msg = e.response?.data?.detail || '決済セッションの作成に失敗しました。'
            alert('エラー: ' + msg)
        } finally {
            setCheckingOut(false)
        }
    }

    const getDaysColor = (days) => {
        if (days == null) return T.textMuted
        if (days <= 3) return '#DC2626'
        if (days <= 7) return '#D97706'
        return T.green
    }

    const statusLabel = {
        TRIAL: '🆓 無料体験中',
        ACTIVE: '✅ 契約中',
        EXPIRED: '❌ 期限切れ',
    }

    const selectedPlanObj = PLANS.find(p => p.key === selectedPlan)
    const currentPrice = dataOpen ? selectedPlanObj.dataOpen : selectedPlanObj.standard

    const isActiveSubscription = subStatus
        && subStatus.subscription_status === 'ACTIVE'
        && subStatus.days_remaining != null
        && subStatus.days_remaining >= 7

    return (
        <div
            className={onClose ? "fixed inset-0 z-[300] flex items-center justify-center p-4" : "min-h-screen flex items-center justify-center p-4"}
            style={{ background: onClose ? 'rgba(0,0,0,0.4)' : T.cream, backdropFilter: onClose ? 'blur(8px)' : undefined }}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                style={{ background: T.card, border: `1px solid ${T.border}` }}
                className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl"
            >
                {onClose && (
                    <button onClick={onClose} className="absolute top-5 right-5 z-10 p-2 rounded-full transition-colors"
                        style={{ background: T.redSoft, color: T.red }}>
                        <X size={18} />
                    </button>
                )}

                {/* Header */}
                <div className="relative p-8 pb-0">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                            style={{ background: T.redSoft, border: `1px solid ${T.redBorder}` }}>
                            <Crown size={20} style={{ color: T.red }} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black" style={{ color: T.text }}>サブスクリプション管理</h2>
                            <p className="text-sm" style={{ color: T.textSub }}>{storeData?.name || shop_id}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    {/* Success / Cancel banners */}
                    <AnimatePresence>
                        {isSuccess && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 rounded-2xl p-4"
                                style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
                                <CheckCircle size={20} style={{ color: T.green }} className="shrink-0" />
                                <p className="font-bold text-sm" style={{ color: T.green }}>決済が完了しました！契約が有効になりました 🎉</p>
                            </motion.div>
                        )}
                        {isCancelled && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 rounded-2xl p-4"
                                style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                                <AlertTriangle size={20} style={{ color: '#D97706' }} className="shrink-0" />
                                <p className="font-bold text-sm" style={{ color: '#92400E' }}>決済がキャンセルされました。いつでも再度お試しください。</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Status card */}
                    {loading ? (
                        <div className="h-24 rounded-2xl animate-pulse" style={{ background: T.cream }} />
                    ) : subStatus && (
                        <div className="rounded-2xl p-5 flex flex-col sm:flex-row justify-between gap-4"
                            style={{ background: T.cream, border: `1px solid ${T.border}` }}>
                            <div className="space-y-1">
                                <p className="text-xs uppercase tracking-widest font-bold" style={{ color: T.textMuted }}>現在のステータス</p>
                                <p className="font-black text-lg" style={{ color: T.text }}>{statusLabel[subStatus.subscription_status] || subStatus.subscription_status}</p>
                                <p className="text-sm capitalize" style={{ color: T.textSub }}>{subStatus.subscription_type} プラン</p>
                            </div>
                            {subStatus.subscription_expires_at && (
                                <div className="space-y-1 text-right">
                                    <p className="text-xs uppercase tracking-widest font-bold" style={{ color: T.textMuted }}>利用期限</p>
                                    <div className="flex items-center gap-2 justify-end">
                                        <Calendar size={14} style={{ color: T.textMuted }} />
                                        <p className="font-bold text-sm" style={{ color: T.text }}>
                                            {new Date(subStatus.subscription_expires_at).toLocaleDateString('ja-JP')}
                                        </p>
                                    </div>
                                    <p className="font-black text-xl" style={{ color: getDaysColor(subStatus.days_remaining) }}>
                                        残り {subStatus.days_remaining}日
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Data open toggle */}
                    <div className="rounded-2xl p-5" style={{ background: `linear-gradient(135deg, ${T.goldBg}, ${T.redSoft})`, border: `1px solid ${T.goldBorder}` }}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button onClick={() => setDataOpen(!dataOpen)}
                                        className="relative w-12 h-7 rounded-full transition-colors"
                                        style={{ background: dataOpen ? T.green : '#CBD5E1' }}>
                                        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${dataOpen ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                    <span className="font-black text-sm" style={{ color: T.text }}>データ公開に同意する</span>
                                    <span className="px-2 py-0.5 text-[10px] font-black rounded-full" style={{ background: T.gold, color: '#fff' }}>月¥1,000割引</span>

                                    <div className="relative"
                                        onMouseEnter={() => setShowReasonModal(true)}
                                        onMouseLeave={() => setShowReasonModal(false)}>
                                        <button onClick={() => setShowReasonModal(!showReasonModal)}
                                            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-colors"
                                            style={{ background: 'rgba(212,160,23,0.15)', color: '#92400E' }}>
                                            <Info size={12} />
                                            ¥1,000割引の理由
                                        </button>
                                        <AnimatePresence>
                                            {showReasonModal && (
                                                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                                    className="absolute z-20 top-full mt-2 right-0 w-80 rounded-2xl p-4 shadow-2xl"
                                                    style={{ background: T.card, border: `1px solid ${T.goldBorder}` }}>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Camera size={16} style={{ color: T.gold }} />
                                                        <p className="font-black text-sm" style={{ color: '#92400E' }}>同意するとこんなメリットが！</p>
                                                    </div>
                                                    {/* 特典 1: 個人ホームページ自動生成 */}
                                                    <div className="flex items-start gap-2 mb-2">
                                                        <span className="text-base shrink-0">🏠</span>
                                                        <div>
                                                            <p className="text-xs font-black" style={{ color: T.text }}>お店専用ホームページが自動生成</p>
                                                            <p className="text-xs leading-relaxed mt-0.5" style={{ color: T.textSub }}>
                                                                登録済みのメニュー写真・住所・営業時間をもとに、プロ仕様のホームページが無料で作られます。別途ホームページを用意する必要はありません。
                                                            </p>
                                                            <a
                                                                href={`/${shop_id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-black px-2 py-0.5 rounded-full"
                                                                style={{ background: T.goldBg, color: T.gold, border: `1px solid ${T.goldBorder}` }}
                                                            >
                                                                🔗 qraku.com/{shop_id}
                                                            </a>
                                                        </div>
                                                    </div>
                                                    {/* 特典 2: 公開ディレクトリ掲載 */}
                                                    <div className="flex items-start gap-2 mb-2">
                                                        <span className="text-base shrink-0">📍</span>
                                                        <div>
                                                            <p className="text-xs font-black" style={{ color: T.text }}>QRaku 公開ディレクトリに掲載</p>
                                                            <p className="text-xs leading-relaxed mt-0.5" style={{ color: T.textSub }}>
                                                                近くのお店を探しているお客様の検索結果に表示され、新規集客につながります。
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {/* 特典 3: 割引 */}
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-base shrink-0">💰</span>
                                                        <div>
                                                            <p className="text-xs font-black" style={{ color: T.text }}>月額 <span style={{ color: T.red }}>¥1,000 割引</span></p>
                                                            <p className="text-xs leading-relaxed mt-0.5" style={{ color: T.textSub }}>
                                                                集客・広告効果の還元として、全プランから毎月¥1,000引きになります。
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] mt-3 pt-2 border-t" style={{ color: T.textMuted, borderColor: T.goldBorder }}>※ 売上データや顧客個人情報は一切公開されません</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                <p className="text-xs mt-2 ml-14 leading-relaxed" style={{ color: T.textSub }}>
                                    ONにすると <strong style={{ color: T.text }}>お店専用ホームページが自動作成</strong> され、全プランが <strong style={{ color: T.red }}>月¥1,000割引</strong> になります
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Plan cards */}
                    <div>
                        <p className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: T.textMuted }}>プラン選択</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {PLANS.map(plan => {
                                const price = dataOpen ? plan.dataOpen : plan.standard
                                const oldPrice = dataOpen ? plan.standard : null
                                const isSelected = selectedPlan === plan.key
                                return (
                                    <button key={plan.key} onClick={() => setSelectedPlan(plan.key)}
                                        className="relative p-5 rounded-2xl text-left transition-all duration-200"
                                        style={{
                                            border: `2px solid ${isSelected ? T.red : T.border}`,
                                            background: isSelected ? T.redSoft : T.card,
                                            boxShadow: isSelected ? `0 4px 20px ${T.red}20` : 'none',
                                        }}>
                                        {plan.tag && (
                                            <span className="absolute -top-2 right-3 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                                                style={{ background: T.gold, color: '#fff' }}>
                                                {plan.tag}
                                            </span>
                                        )}
                                        <p className="text-xs font-bold mb-1" style={{ color: T.textSub }}>{plan.label}</p>
                                        {oldPrice && (
                                            <p className="text-xs line-through" style={{ color: T.textMuted }}>{yen(oldPrice)}</p>
                                        )}
                                        <p className="font-black text-2xl" style={{ color: dataOpen ? T.green : T.text }}>
                                            {yen(price)}
                                        </p>
                                        <p className="text-xs" style={{ color: T.textMuted }}>{plan.period}</p>
                                        {isSelected && (
                                            <div className="mt-2 w-2 h-2 rounded-full" style={{ background: T.red }} />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Features */}
                    <div className="rounded-2xl p-5" style={{ background: T.cream, border: `1px solid ${T.border}` }}>
                        <p className="text-xs uppercase tracking-widest font-bold mb-3 flex items-center gap-2" style={{ color: T.textMuted }}>
                            <Star size={12} style={{ color: T.gold }} /> 全プランに含まれる機能
                        </p>
                        <ul className="space-y-2">
                            {FEATURES.map((f, i) => (
                                <li key={i} className="flex items-center gap-2.5 text-sm" style={{ color: T.textSub }}>
                                    <CheckCircle size={14} style={{ color: T.red }} className="shrink-0" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Checkout button */}
                    <button
                        onClick={() => {
                            if (isActiveSubscription) { setShowAlreadySubModal(true); return }
                            handleCheckout()
                        }}
                        disabled={checkingOut || isActiveSubscription}
                        className="w-full py-5 text-white font-black text-lg rounded-2xl transition-all duration-200 flex items-center justify-center gap-3"
                        style={{
                            background: isActiveSubscription
                                ? '#CBD5E1'
                                : `linear-gradient(135deg, ${T.red}, ${T.redLight})`,
                            boxShadow: isActiveSubscription ? 'none' : `0 8px 24px ${T.red}30`,
                            cursor: isActiveSubscription ? 'not-allowed' : 'pointer',
                            opacity: checkingOut ? 0.6 : 1,
                        }}
                    >
                        {checkingOut ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                処理中...
                            </>
                        ) : isActiveSubscription ? (
                            <>
                                <CheckCircle size={20} />
                                現在ご契約中です（残り{subStatus?.days_remaining}日）
                            </>
                        ) : (
                            <>
                                <ExternalLink size={20} />
                                Stripeで{yen(currentPrice)}を決済
                            </>
                        )}
                    </button>

                    {isActiveSubscription && (
                        <p className="text-center text-xs font-bold" style={{ color: '#D97706' }}>
                            ⚠ 現在の契約期間が終了に近づいたら、更新が可能になります
                        </p>
                    )}

                    <p className="text-center text-xs" style={{ color: T.textMuted }}>
                        決済はStripeの安全なサーバーで処理されます · いつでも解約可能
                    </p>

                    {/* Already subscribed modal */}
                    <AnimatePresence>
                        {showAlreadySubModal && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[400] flex items-center justify-center p-4"
                                style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
                                onClick={() => setShowAlreadySubModal(false)}>
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                    className="rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
                                    style={{ background: T.card, border: `1px solid ${T.border}` }}
                                    onClick={e => e.stopPropagation()}>
                                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                                        style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
                                        <CheckCircle size={32} style={{ color: T.green }} />
                                    </div>
                                    <h3 className="font-black text-xl mb-2" style={{ color: T.text }}>既にご契約中です</h3>
                                    <p className="text-sm leading-relaxed mb-2" style={{ color: T.textSub }}>
                                        現在の契約は <strong style={{ color: T.text }}>{subStatus?.subscription_type}</strong> プランで、
                                    </p>
                                    <p className="font-black text-2xl mb-1" style={{ color: T.green }}>
                                        残り {subStatus?.days_remaining}日
                                    </p>
                                    <p className="text-xs mb-6" style={{ color: T.textMuted }}>
                                        {subStatus?.subscription_expires_at && new Date(subStatus.subscription_expires_at).toLocaleDateString('ja-JP')} まで有効
                                    </p>
                                    <p className="text-xs mb-6 leading-relaxed" style={{ color: T.textSub }}>
                                        契約期間の残りが <strong style={{ color: T.gold }}>7日未満</strong> になると、更新・プラン変更が可能になります。
                                    </p>
                                    <button onClick={() => setShowAlreadySubModal(false)}
                                        className="w-full py-3 font-bold rounded-xl transition-colors text-white"
                                        style={{ background: T.red }}>
                                        閉じる
                                    </button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    )
}
