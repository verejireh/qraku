/**
 * TakeoutTimeQueryView
 * 외부 손님이 테이크아웃 주문 전 조리 시간을 문의하고,
 * 스태프와 협의 후 결제까지 진행하는 플로우
 *
 * 사용처: 테이크아웃 QR 스캔 or /:shop_id/takeout 접속 시
 * props: cart, totalAmount, storeId, squareAppId, squareLocationId, onConfirmedOrder, onCancel
 */
import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingBag, Clock, CheckCircle, X, MessageCircle } from 'lucide-react'

const POLL_INTERVAL = 3000 // 3초마다 상태 폴링

export default function TakeoutTimeQueryView({
    cart = [],
    totalAmount = 0,
    storeId,
    squareAppId,
    squareLocationId,
    onConfirmedOrder,  // (agreedTime) => void  — 합의 완료 후 결제로 넘김
    onCancel,
}) {
    const guestUuid = localStorage.getItem('guest_uuid') || 'anon'
    const [step, setStep] = useState('choose')
    // 'choose' → 'waiting' → 'responded' → 'agreed' | 'declined'

    const [queryType, setQueryType] = useState(null)  // 'ask_available' | 'ask_specific'
    const [specificTime, setSpecificTime] = useState('')
    const [queryId, setQueryId] = useState(null)
    const [queryStatus, setQueryStatus] = useState(null)
    const [staffResponse, setStaffResponse] = useState(null)
    const [agreedTime, setAgreedTime] = useState(null)
    const [counterTime, setCounterTime] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const pollRef = useRef(null)

    // ── 폴링 시작/정지 ─────────────────────────────────────────────────────
    useEffect(() => {
        if (step === 'waiting' || step === 'responded') {
            pollRef.current = setInterval(async () => {
                try {
                    const res = await axios.get('/api/takeout/time-query/status', {
                        params: { guest_uuid: guestUuid, shop_id: String(storeId) }
                    })
                    const d = res.data
                    if (d.status === 'responded') {
                        setStaffResponse(d.staff_response)
                        setAgreedTime(d.agreed_time)
                        setStep('responded')
                    } else if (d.status === 'agreed') {
                        setAgreedTime(d.agreed_time)
                        setStep('agreed')
                        clearInterval(pollRef.current)
                    } else if (d.status === 'declined') {
                        setStep('declined')
                        clearInterval(pollRef.current)
                    }
                } catch (e) { /* ignore */ }
            }, POLL_INTERVAL)
        }
        return () => clearInterval(pollRef.current)
    }, [step, storeId, guestUuid])

    const handleSendQuery = async () => {
        if (queryType === 'ask_specific' && !specificTime) {
            alert('希望時間を入力してください')
            return
        }
        setSubmitting(true)
        try {
            const res = await axios.post('/api/takeout/time-query', {
                shop_id: String(storeId),
                guest_uuid: guestUuid,
                items_snapshot: JSON.stringify(cart.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    price: i.price,
                    menuId: i.menuId,
                }))),
                total_amount: totalAmount,
                query_type: queryType,
                requested_time: queryType === 'ask_specific' ? specificTime : null,
            })
            setQueryId(res.data.id)
            setStep('waiting')
        } catch (e) {
            alert('送信に失敗しました: ' + (e.response?.data?.detail || e.message))
        }
        setSubmitting(false)
    }

    const handleAccept = async () => {
        if (!queryId) return
        await axios.post(`/api/takeout/time-query/${queryId}/confirm`, { accept: true })
        setStep('agreed')
        clearInterval(pollRef.current)
    }

    const handleCounter = async () => {
        if (!counterTime) return
        await axios.post(`/api/takeout/time-query/${queryId}/confirm`, {
            accept: false,
            counter_time: counterTime,
        })
        setQueryType('ask_specific')
        setSpecificTime(counterTime)
        setStep('waiting')
        setStaffResponse(null)
    }

    const handleDecline = async () => {
        if (queryId) {
            await axios.post(`/api/takeout/time-query/${queryId}/confirm`, { accept: false })
        }
        onCancel?.()
    }

    // ── UI ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onCancel} />
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative w-full max-w-lg bg-[#1a1a2e] border-t border-white/10 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl p-7 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                            <span className="text-xl">🥡</span>
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg">テイクアウト 調理時間を確認</h2>
                            <p className="text-slate-400 text-xs">お店に調理可能時間を問い合わせます</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                        <X className="text-slate-400 w-4 h-4" />
                    </button>
                </div>

                {/* Cart summary */}
                <div className="bg-white/5 rounded-xl p-4 space-y-1.5">
                    {cart.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                            <span className="text-white/80">{item.name} × {item.quantity}</span>
                            <span className="text-white/50">¥{(item.price * item.quantity).toLocaleString()}</span>
                        </div>
                    ))}
                    <div className="flex justify-between font-bold text-white pt-2 border-t border-white/10 mt-2">
                        <span>合計</span>
                        <span>¥{totalAmount.toLocaleString()}</span>
                    </div>
                </div>

                {/* Step: choose */}
                <AnimatePresence mode="wait">
                {step === 'choose' && (
                    <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                        <p className="text-white/70 text-sm text-center">どのように問い合わせますか？</p>
                        <button
                            onClick={() => setQueryType(qt => qt === 'ask_available' ? null : 'ask_available')}
                            className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${queryType === 'ask_available' ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}
                        >
                            <div className="flex items-center gap-3">
                                <Clock className="text-amber-400 w-5 h-5 shrink-0" />
                                <div>
                                    <p className="text-white font-bold text-sm">いつ頃できますか？</p>
                                    <p className="text-slate-400 text-xs mt-0.5">お店が準備できる時間を教えてもらいます</p>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => setQueryType(qt => qt === 'ask_specific' ? null : 'ask_specific')}
                            className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${queryType === 'ask_specific' ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}
                        >
                            <div className="flex items-center gap-3">
                                <MessageCircle className="text-amber-400 w-5 h-5 shrink-0" />
                                <div>
                                    <p className="text-white font-bold text-sm">○○時に可能ですか？</p>
                                    <p className="text-slate-400 text-xs mt-0.5">指定した時間に受け取れるか確認します</p>
                                </div>
                            </div>
                        </button>

                        {queryType === 'ask_specific' && (
                            <div className="pt-1">
                                <label className="text-xs text-slate-400 uppercase tracking-widest font-bold block mb-1.5">希望時間</label>
                                <input
                                    type="time"
                                    value={specificTime}
                                    onChange={e => setSpecificTime(e.target.value)}
                                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                                />
                            </div>
                        )}

                        <button
                            onClick={handleSendQuery}
                            disabled={!queryType || submitting || (queryType === 'ask_specific' && !specificTime)}
                            className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white rounded-2xl font-bold text-base transition-all mt-2"
                        >
                            {submitting ? '送信中...' : 'お店に問い合わせる'}
                        </button>
                    </motion.div>
                )}

                {/* Step: waiting */}
                {step === 'waiting' && (
                    <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-6 space-y-4">
                        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
                            <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
                        </div>
                        <p className="text-white font-bold text-lg">お店の返答を待っています...</p>
                        {queryType === 'ask_specific' && specificTime && (
                            <p className="text-amber-400 text-sm">「{specificTime}」に可能か確認中</p>
                        )}
                        <p className="text-slate-500 text-xs">通常1〜2分でご返答します</p>
                        <button onClick={onCancel} className="text-slate-500 text-sm underline mt-4">キャンセルする</button>
                    </motion.div>
                )}

                {/* Step: responded — スタッフから返答あり */}
                {step === 'responded' && (
                    <motion.div key="responded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                        <div className="bg-white/5 rounded-2xl p-5 border border-amber-400/30">
                            <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-2">📩 お店からの返答</p>
                            <p className="text-white text-base font-semibold leading-relaxed">{staffResponse}</p>
                            {agreedTime && (
                                <p className="text-amber-300 font-black text-2xl mt-3 text-center">{agreedTime}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={handleAccept}
                                className="py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-4 h-4" /> OK！この時間で
                            </button>
                            <button
                                onClick={() => setStep('counter')}
                                className="py-4 bg-white/10 hover:bg-white/15 text-white rounded-2xl font-bold text-sm transition-all"
                            >
                                別の時間を希望
                            </button>
                        </div>
                        <button onClick={handleDecline} className="w-full text-slate-500 text-xs underline">注文をキャンセルする</button>
                    </motion.div>
                )}

                {/* Step: counter — 손님이 대안 시간 제시 */}
                {step === 'counter' && (
                    <motion.div key="counter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                        <p className="text-white/70 text-sm text-center">ご希望の時間を入力してください</p>
                        <input
                            type="time"
                            value={counterTime}
                            onChange={e => setCounterTime(e.target.value)}
                            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                        />
                        <button
                            onClick={handleCounter}
                            disabled={!counterTime}
                            className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white rounded-2xl font-bold transition-all"
                        >
                            この時間を提案する
                        </button>
                        <button onClick={() => setStep('responded')} className="w-full text-slate-500 text-xs underline">戻る</button>
                    </motion.div>
                )}

                {/* Step: agreed — 합의 완료 → 결제로 */}
                {step === 'agreed' && (
                    <motion.div key="agreed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center space-y-5 py-4">
                        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle className="text-emerald-400 w-8 h-8" />
                        </div>
                        <p className="text-white font-bold text-lg">時間が確定しました！</p>
                        {agreedTime && (
                            <p className="text-emerald-300 font-black text-3xl">{agreedTime}</p>
                        )}
                        <p className="text-slate-400 text-sm">決済に進んでください</p>
                        <button
                            onClick={() => onConfirmedOrder?.(agreedTime)}
                            className="w-full py-4 bg-[#c21e2f] hover:bg-[#9f1239] text-white rounded-2xl font-bold text-base transition-all"
                        >
                            決済に進む →
                        </button>
                    </motion.div>
                )}

                {/* Step: declined */}
                {step === 'declined' && (
                    <motion.div key="declined" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center space-y-4 py-4">
                        <p className="text-4xl">😔</p>
                        <p className="text-white font-bold">現在テイクアウトはお受けできません</p>
                        {staffResponse && <p className="text-slate-400 text-sm">{staffResponse}</p>}
                        <button onClick={onCancel} className="w-full py-3 bg-white/10 text-white rounded-2xl font-bold">閉じる</button>
                    </motion.div>
                )}
                </AnimatePresence>
            </motion.div>
        </div>
    )
}
