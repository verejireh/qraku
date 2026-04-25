import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingBag, Trash2, Plus, Minus, CreditCard, QrCode } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import axios from 'axios'

const SQUARE_SDK_SANDBOX = 'https://sandbox.web.squarecdn.com/v1/square.js'
const SQUARE_SDK_PROD    = 'https://web.squarecdn.com/v1/square.js'

function loadSquareScript(sandbox = true) {
    return new Promise((resolve, reject) => {
        if (window.Square) { resolve(); return }
        const existing = document.getElementById('square-payments-sdk')
        if (existing) { existing.onload = resolve; existing.onerror = reject; return }
        const script = document.createElement('script')
        script.id = 'square-payments-sdk'
        script.src = sandbox ? SQUARE_SDK_SANDBOX : SQUARE_SDK_PROD
        script.async = true
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
    })
}

export default function MagnoliaCartModal({
    isOpen,
    onClose,
    cart,
    onRemove,
    onUpdateQuantity,
    onClear,
    totalAmount,
    onPlaceOrder,
    loading,
    storePaymentOptions,
    orderType = 'eat_in',
    agreedPickupTime = null,
    squareAppId = null,
    squareLocationId = null,
    paymentMethodType = null,
    shopId = null,
    defaultWaitMinutes = 15,
}) {
    const { t } = useLanguage()
    const computeDefaultPickup = () => {
        const d = new Date(Date.now() + (defaultWaitMinutes || 15) * 60000)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    const [pickupTime, setPickupTime] = useState(agreedPickupTime || computeDefaultPickup())
    const [squareCard, setSquareCard] = useState(null)
    const [squareReady, setSquareReady] = useState(false)
    const [squareError, setSquareError] = useState(null)
    const [paypayLoading, setPaypayLoading] = useState(false)
    const cardRef = useRef(null)

    const isTakeOut = orderType === 'take_out'
    const canUseSquare = isTakeOut && squareAppId && squareLocationId
    const canUsePayPay = isTakeOut && paymentMethodType === 'paypay_direct'

    useEffect(() => {
        if (agreedPickupTime) setPickupTime(agreedPickupTime)
    }, [agreedPickupTime])

    // Initialize Square Web Payments SDK when modal opens in take_out mode
    useEffect(() => {
        if (!isOpen || !canUseSquare) return

        let card = null
        const init = async () => {
            try {
                const isSandbox = !window.location.hostname.includes('production')
                await loadSquareScript(isSandbox)

                if (!window.Square) throw new Error('Square SDK not loaded')

                const payments = window.Square.payments(squareAppId, squareLocationId)
                card = await payments.card({
                    style: {
                        '.input-container': { borderRadius: '8px' },
                        '.input-container.is-focus': { borderColor: '#d4af37' },
                        input: { color: '#fff', fontSize: '14px' },
                    }
                })
                await card.attach('#square-card-container')
                setSquareCard(card)
                setSquareReady(true)
                setSquareError(null)
            } catch (e) {
                console.error('Square SDK init error:', e)
                setSquareError('カード入力の初期化に失敗しました。ページをリロードしてください。')
            }
        }

        init()

        return () => {
            if (card) {
                card.destroy().catch(() => {})
                setSquareCard(null)
                setSquareReady(false)
            }
        }
    }, [isOpen, canUseSquare, squareAppId, squareLocationId])

    const handleTakeOutPay = async () => {
        if (!squareCard) {
            alert('カード入力フォームが準備中です。しばらくお待ちください。')
            return
        }
        try {
            const result = await squareCard.tokenize()
            if (result.status === 'OK') {
                onPlaceOrder('square', result.token, pickupTime || null)
            } else {
                const msg = result.errors?.[0]?.message || 'カード検証に失敗しました'
                alert(`決済エラー: ${msg}`)
            }
        } catch (e) {
            alert('決済処理中にエラーが発生しました: ' + e.message)
        }
    }

    const handlePayPayPay = async () => {
        if (!shopId) {
            alert('店舗情報が取得できません。ページをリロードしてください。')
            return
        }
        setPaypayLoading(true)
        try {
            // 주문 데이터를 localStorage에 임시 저장 (PayPay 리다이렉트 후 복원용)
            const tempKey = `paypay_order_${Date.now()}`
            const tempOrder = {
                cart,
                totalAmount,
                pickupTime: pickupTime || null,
                orderType,
                shopId,
            }
            localStorage.setItem(tempKey, JSON.stringify(tempOrder))

            // PayPay 결제 생성 API 호출
            const res = await axios.post('/api/paypay/create-payment', {
                shop_id: parseInt(shopId),
                amount: totalAmount,
                order_description: `QRaku テイクアウト注文 ¥${totalAmount.toLocaleString()}`,
                temp_order_key: tempKey,
            })

            // merchant_payment_id도 저장 (콜백 시 사용)
            localStorage.setItem(`${tempKey}_mid`, res.data.merchant_payment_id)

            // PayPay 결제 페이지로 리다이렉트
            window.location.href = res.data.payment_url
        } catch (e) {
            console.error('PayPay payment creation failed:', e)
            alert('PayPay 決済の作成に失敗しました: ' + (e.response?.data?.detail || e.message))
        } finally {
            setPaypayLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-charcoal/60 backdrop-blur-md"
                />

                {/* Modal Content */}
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="relative w-full max-w-lg bg-card-dark border-t border-white/10 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl p-8 flex flex-col max-h-[90vh] overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#c21e2f]/10 rounded-xl flex items-center justify-center">
                                <ShoppingBag className="text-[#c21e2f] w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="font-serif text-xl text-white italic">Your Selection</h2>
                                {isTakeOut && (
                                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">🥡 テイクアウト</span>
                                )}
                            </div>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                            <X className="text-slate-400 w-5 h-5" />
                        </button>
                    </div>

                    {/* Cart Items List */}
                    <div className="flex-1 overflow-y-auto hide-scrollbar space-y-5 mb-6">
                        {cart.length === 0 ? (
                            <div className="py-16 text-center space-y-4">
                                <div className="text-slate-600 italic">Your cart is as empty as a morning breeze.</div>
                                <button onClick={onClose} className="text-[#c21e2f] text-sm font-bold uppercase tracking-widest border-b border-[#c21e2f]/30 pb-1">Start Adding</button>
                            </div>
                        ) : (
                            cart.map((item, idx) => (
                                <motion.div
                                    key={`${item.id}-${idx}`}
                                    layout
                                    className="flex gap-4 items-center group"
                                >
                                    <div className="w-20 h-20 bg-charcoal rounded-xl overflow-hidden shrink-0">
                                        <img
                                            src={item.image_url
                                                ? (item.image_url.startsWith('http') ? item.image_url : (item.image_url.startsWith('/uploads') ? item.image_url : (item.image_url.startsWith('/') ? `/api${item.image_url}` : `/api/${item.image_url}`)))
                                                : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=150'}
                                            alt={item.name}
                                            className="w-full h-full object-cover opacity-80"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-white text-sm font-medium mb-1 line-clamp-1">{item.name}</h4>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4 bg-white/5 rounded-full px-4 py-1.5">
                                                <button onClick={() => onUpdateQuantity(item.id, -1)} className="text-slate-400 hover:text-white transition-colors">
                                                    <Minus className="w-5 h-5" />
                                                </button>
                                                <span className="text-[#c21e2f] font-bold text-sm min-w-[1.25rem] text-center">{item.quantity}</span>
                                                <button onClick={() => onUpdateQuantity(item.id, 1)} className="text-slate-400 hover:text-white transition-colors">
                                                    <Plus className="w-5 h-5" />
                                                </button>
                                            </div>
                                            <span className="text-white/60 font-bold text-xs tracking-wider">
                                                ¥{(item.price * item.quantity).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onRemove(item.id)}
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all sm:opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </motion.div>
                            ))
                        )}
                    </div>

                    {/* Footer / Checkout */}
                    {cart.length > 0 && (
                        <div className="mt-auto space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <span className="text-slate-400 text-sm font-medium">Total</span>
                                <span className="text-2xl font-bold text-white tracking-tight">¥{totalAmount.toLocaleString()}</span>
                            </div>

                            {/* Take-out extras: pickup time + payment form */}
                            {isTakeOut && (
                                <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                                    {/* Pickup time */}
                                    <div>
                                        <label className="text-xs text-slate-400 font-bold uppercase tracking-widest block mb-1.5">
                                            🕐 ピックアップ時間
                                        </label>
                                        {agreedPickupTime ? (
                                            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-400/30 rounded-xl px-4 py-2.5">
                                                <span className="text-emerald-400 text-xs font-bold">✅ 合意済み</span>
                                                <span className="text-white font-black text-lg ml-auto">{agreedPickupTime}</span>
                                            </div>
                                        ) : (
                                            <input
                                                type="time"
                                                value={pickupTime}
                                                onChange={e => setPickupTime(e.target.value)}
                                                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                                            />
                                        )}
                                    </div>

                                    {/* Square card container */}
                                    {canUseSquare && (
                                        <div>
                                            <label className="text-xs text-slate-400 font-bold uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                                                <CreditCard className="w-3.5 h-3.5" />
                                                カード情報
                                            </label>
                                            <div id="square-card-container" className="min-h-[60px] bg-white/5 rounded-xl p-3" ref={cardRef} />
                                            {squareError && <p className="text-red-400 text-xs mt-1">{squareError}</p>}
                                            {!squareReady && !squareError && (
                                                <p className="text-slate-500 text-xs mt-1 animate-pulse">カードフォーム読込中...</p>
                                            )}
                                        </div>
                                    )}

                                    {/* PayPay info */}
                                    {canUsePayPay && (
                                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-400/20 rounded-xl px-4 py-2.5">
                                            <QrCode className="w-4 h-4 text-red-400" />
                                            <span className="text-xs text-red-300">PayPay アプリで決済します</span>
                                        </div>
                                    )}

                                    {!canUseSquare && !canUsePayPay && (
                                        <p className="text-xs text-amber-400 italic">
                                            オンライン決済が未設定のため、カウンターでお支払いください。
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Action button */}
                            {isTakeOut ? (
                                canUsePayPay ? (
                                    <button
                                        onClick={handlePayPayPay}
                                        disabled={loading || paypayLoading}
                                        className="w-full py-5 bg-[#c21e2f] hover:bg-[#9f1239] text-white rounded-[1.5rem] font-bold tracking-tight shadow-xl shadow-[#c21e2f]/30 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <QrCode className="w-5 h-5" />
                                        <span className="text-lg">{paypayLoading ? 'PayPay 処理中...' : 'PayPay で決済する'}</span>
                                    </button>
                                ) : canUseSquare ? (
                                    <button
                                        onClick={handleTakeOutPay}
                                        disabled={loading || !squareReady}
                                        className="w-full py-5 bg-[#c21e2f] hover:bg-[#9f1239] text-white rounded-[1.5rem] font-bold tracking-tight shadow-xl shadow-[#c21e2f]/30 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <CreditCard className="w-5 h-5" />
                                        <span className="text-lg">{loading ? '決済処理中...' : 'カードで決済する'}</span>
                                    </button>
                                ) : (
                                    <div className="w-full py-5 bg-slate-700/50 text-slate-400 rounded-[1.5rem] text-center text-sm">
                                        オンライン決済が未設定のため、テイクアウトはご利用いただけません。
                                    </div>
                                )
                            ) : (
                                <button
                                    onClick={() => onPlaceOrder('cash_at_counter')}
                                    disabled={loading}
                                    className="w-full py-5 bg-[#c21e2f] hover:bg-[#9f1239] text-white rounded-[1.5rem] font-bold tracking-tight shadow-xl shadow-[#c21e2f]/30 transition-all duration-300 flex items-center justify-center gap-2 flex-col leading-none disabled:opacity-50"
                                >
                                    <span className="text-lg">{loading ? t('sending_order') : t('place_order')}</span>
                                </button>
                            )}

                            <button
                                onClick={onClear}
                                className="w-full text-[11px] text-slate-500 uppercase tracking-widest font-bold hover:text-slate-300 transition-colors"
                            >
                                {t('clear_cart')}
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
