import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Star, Zap, AlertTriangle, X, ExternalLink, Calendar, Crown, Info, Camera } from 'lucide-react'

const PLANS = [
    {
        key: 'monthly',
        label: '月額プラン',
        period: '/月',
        standard: 3480,
        dataOpen: 2480,
        tag: null,
    },
    {
        key: 'sixmonth',
        label: '6ヶ月プラン',
        period: '/6ヶ月',
        standard: 17880,
        dataOpen: 11880,
        tag: '約15%お得',
    },
    {
        key: 'yearly',
        label: '12ヶ月プラン',
        period: '/年',
        standard: 29800,
        dataOpen: 17800,
        tag: '最安値・約40%お得',
    },
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
        if (days == null) return 'text-slate-400'
        if (days <= 3) return 'text-red-500'
        if (days <= 7) return 'text-amber-500'
        return 'text-emerald-500'
    }

    const statusLabel = {
        TRIAL: '🆓 無料体験中',
        ACTIVE: '✅ 契約中',
        EXPIRED: '❌ 期限切れ',
    }

    const selectedPlanObj = PLANS.find(p => p.key === selectedPlan)
    const currentPrice = dataOpen ? selectedPlanObj.dataOpen : selectedPlanObj.standard

    return (
        <div className={onClose ? "fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" : "min-h-screen bg-slate-950 flex items-center justify-center p-4"}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-white/10 rounded-3xl shadow-2xl"
            >
                {onClose && (
                    <button onClick={onClose} className="absolute top-5 right-5 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                        <X size={18} className="text-white" />
                    </button>
                )}

                <div className="relative p-8 pb-0">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-pink-500/20 border border-pink-500/30 rounded-2xl flex items-center justify-center">
                            <Crown size={20} className="text-pink-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white">サブスクリプション管理</h2>
                            <p className="text-slate-400 text-sm">{storeData?.name || shop_id}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    <AnimatePresence>
                        {isSuccess && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
                                <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                                <p className="text-emerald-300 font-bold text-sm">決済が完了しました！契約が有効になりました 🎉</p>
                            </motion.div>
                        )}
                        {isCancelled && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                                <AlertTriangle size={20} className="text-amber-400 shrink-0" />
                                <p className="text-amber-300 font-bold text-sm">決済がキャンセルされました。いつでも再度お試しください。</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {loading ? (
                        <div className="h-24 bg-white/5 rounded-2xl animate-pulse" />
                    ) : subStatus && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col sm:flex-row justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">現在のステータス</p>
                                <p className="text-white font-black text-lg">{statusLabel[subStatus.subscription_status] || subStatus.subscription_status}</p>
                                <p className="text-slate-500 text-sm capitalize">{subStatus.subscription_type} プラン</p>
                            </div>
                            {subStatus.subscription_expires_at && (
                                <div className="space-y-1 text-right">
                                    <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">利用期限</p>
                                    <div className="flex items-center gap-2 justify-end">
                                        <Calendar size={14} className="text-slate-400" />
                                        <p className="text-white font-bold text-sm">
                                            {new Date(subStatus.subscription_expires_at).toLocaleDateString('ja-JP')}
                                        </p>
                                    </div>
                                    <p className={`font-black text-xl ${getDaysColor(subStatus.days_remaining)}`}>
                                        残り {subStatus.days_remaining}日
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* データ公開トグル */}
                    <div className="bg-gradient-to-r from-amber-500/10 to-pink-500/10 border border-amber-500/30 rounded-2xl p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        onClick={() => setDataOpen(!dataOpen)}
                                        className={`relative w-12 h-7 rounded-full transition-colors ${dataOpen ? 'bg-emerald-500' : 'bg-slate-600'}`}
                                    >
                                        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${dataOpen ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                    <span className="text-white font-black text-sm">データ公開に同意する</span>
                                    <span className="px-2 py-0.5 bg-amber-400 text-slate-900 text-[10px] font-black rounded-full">月¥1,000割引</span>

                                    {/* 理由タグ */}
                                    <div
                                        className="relative"
                                        onMouseEnter={() => setShowReasonModal(true)}
                                        onMouseLeave={() => setShowReasonModal(false)}
                                    >
                                        <button
                                            onClick={() => setShowReasonModal(!showReasonModal)}
                                            className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-full text-xs text-amber-300 font-bold transition-colors"
                                        >
                                            <Info size={12} />
                                            ¥1,000割引の理由
                                        </button>

                                        <AnimatePresence>
                                            {showReasonModal && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -5 }}
                                                    className="absolute z-20 top-full mt-2 right-0 w-80 bg-slate-800 border border-amber-500/40 rounded-2xl p-4 shadow-2xl"
                                                >
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Camera size={16} className="text-amber-400" />
                                                        <p className="text-amber-300 font-black text-sm">広告効果でお得に！</p>
                                                    </div>
                                                    <p className="text-slate-300 text-xs leading-relaxed">
                                                        お店のメニュー情報や写真を <strong className="text-white">QRaku 公開ディレクトリ</strong> に掲載することに同意いただくと、
                                                        お客様が近くのお店を探す際にあなたのお店が表示されます。
                                                    </p>
                                                    <p className="text-slate-300 text-xs leading-relaxed mt-2">
                                                        これは大きな <strong className="text-amber-300">集客・広告効果</strong> を生み出すため、
                                                        その分、月額から <strong className="text-white">¥1,000 割引</strong> させていただきます。
                                                    </p>
                                                    <p className="text-slate-500 text-[10px] mt-2">※ 売上データや顧客個人情報は一切公開されません</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                <p className="text-slate-400 text-xs mt-2 ml-14">
                                    ONにすると全プランが月¥1,000お得になります
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* プラン選択 */}
                    <div>
                        <p className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-3">プラン選択</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {PLANS.map(plan => {
                                const price = dataOpen ? plan.dataOpen : plan.standard
                                const oldPrice = dataOpen ? plan.standard : null
                                return (
                                    <button
                                        key={plan.key}
                                        onClick={() => setSelectedPlan(plan.key)}
                                        className={`relative p-5 rounded-2xl border text-left transition-all duration-200 ${selectedPlan === plan.key
                                            ? 'border-pink-500 bg-pink-500/10 shadow-lg shadow-pink-500/10'
                                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                                            }`}
                                    >
                                        {plan.tag && (
                                            <span className="absolute -top-2 right-3 text-[10px] font-black bg-amber-400 text-slate-900 px-2 py-0.5 rounded-full whitespace-nowrap">
                                                {plan.tag}
                                            </span>
                                        )}
                                        <p className="text-slate-400 text-xs font-bold mb-1">{plan.label}</p>
                                        {oldPrice && (
                                            <p className="text-slate-500 text-xs line-through">{yen(oldPrice)}</p>
                                        )}
                                        <p className={`font-black text-2xl ${dataOpen ? 'text-emerald-400' : 'text-white'}`}>
                                            {yen(price)}
                                        </p>
                                        <p className="text-slate-500 text-xs">{plan.period}</p>
                                        {selectedPlan === plan.key && (
                                            <div className="mt-2 w-2 h-2 bg-pink-500 rounded-full" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
                        <p className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
                            <Star size={12} className="text-amber-400" /> 全プランに含まれる機能
                        </p>
                        <ul className="space-y-2">
                            {FEATURES.map((f, i) => (
                                <li key={i} className="flex items-center gap-2.5 text-slate-300 text-sm">
                                    <CheckCircle size={14} className="text-pink-400 shrink-0" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={checkingOut}
                        className="w-full py-5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 disabled:opacity-50 text-white font-black text-lg rounded-2xl shadow-xl shadow-pink-500/20 transition-all duration-200 flex items-center justify-center gap-3"
                    >
                        {checkingOut ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                処理中...
                            </>
                        ) : (
                            <>
                                <ExternalLink size={20} />
                                Stripeで{yen(currentPrice)}を決済
                            </>
                        )}
                    </button>

                    <p className="text-center text-slate-600 text-xs">
                        決済はStripeの安全なサーバーで処理されます · いつでも解約可能
                    </p>
                </div>
            </motion.div>
        </div>
    )
}
