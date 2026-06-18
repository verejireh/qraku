import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingBag, Trash2, Plus, Minus, CreditCard, QrCode, Gift, CheckCircle2 } from 'lucide-react'
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
    stampStatus = null,
    useStampReward = false,
    setUseStampReward = () => {},
    guestCoupons = [],
    useCouponId = null,
    setUseCouponId = () => {},
    // 통화 (매장 국가에서 파생 — 기본 JPY 로 하위호환). 금액은 모두 '최소단위 정수'.
    currency = 'JPY',
    currencySymbol = '¥',
    currencyDecimals = 0,
    countryCode = 'JP',
}) {
    const { t } = useLanguage()
    // 소수 자릿수는 0..3 정수로 clamp (잘못된 prop 방어)
    const _decimals = Number.isInteger(currencyDecimals) ? Math.min(3, Math.max(0, currencyDecimals)) : 0
    const _safeMinor = (minor) => (Number.isFinite(Number(minor)) ? Number(minor) : 0)
    // 최소단위 정수 → 표시 문자열 (예: 1000 → ¥1,000 / £10.00)
    const fmt = (minor) => `${currencySymbol}${(_safeMinor(minor) / Math.pow(10, _decimals)).toLocaleString(undefined, { minimumFractionDigits: _decimals, maximumFractionDigits: _decimals })}`
    // 최소단위 정수 → Square paymentRequest 용 major 단위 소수 문자열 (예: 1000 → "1000"(JPY) / "10.00"(GBP))
    const toMajorString = (minor) => (_safeMinor(minor) / Math.pow(10, _decimals)).toFixed(_decimals)
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

    // Apple Pay / Google Pay
    const [applePay, setApplePay] = useState(null)
    const [googlePay, setGooglePay] = useState(null)
    const [walletPaying, setWalletPaying] = useState(false)
    const paymentRequestRef = useRef(null)
    const googlePayBtnRef = useRef(null)

    // 결제 시 실제로 청구될 금액 (스탬프/쿠폰 할인 반영)
    const finalAmount = Math.max(0,
        totalAmount
        - (useStampReward && stampStatus ? (stampStatus.stamp_reward_discount || 0) : 0)
        - (useCouponId ? (guestCoupons.find(c => c.id === useCouponId)?.discount_amount || 0) : 0)
    )

    const isTakeOut = orderType === 'take_out'
    const isRoomService = orderType === 'room_service'   // 호텔 룸서비스: 카드 선결제, 픽업시간 없음
    const isPrepay = isTakeOut || isRoomService
    const canUseSquare = isPrepay && squareAppId && squareLocationId
    const canUsePayPay = isTakeOut && paymentMethodType === 'PAYPAY_DIRECT'

    useEffect(() => {
        if (agreedPickupTime) setPickupTime(agreedPickupTime)
    }, [agreedPickupTime])

    // Initialize Square Web Payments SDK when modal opens in take_out mode
    useEffect(() => {
        if (!isOpen || !canUseSquare) return

        let card = null
        let ap = null
        let gp = null

        const init = async () => {
            try {
                const isSandbox = !window.location.hostname.includes('production')
                await loadSquareScript(isSandbox)

                if (!window.Square) throw new Error('Square SDK not loaded')

                const payments = window.Square.payments(squareAppId, squareLocationId)

                // ── 1. Card 입력 ───────────────────────────────────────
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

                // ── 2. PaymentRequest 생성 (Apple/Google Pay 공용) ──────
                const initialAmount = Math.max(0,
                    totalAmount
                    - (useStampReward && stampStatus ? (stampStatus.stamp_reward_discount || 0) : 0)
                    - (useCouponId ? (guestCoupons.find(c => c.id === useCouponId)?.discount_amount || 0) : 0)
                )
                if (initialAmount > 0) {
                    const pr = payments.paymentRequest({
                        countryCode: countryCode,
                        currencyCode: currency,
                        total: { amount: toMajorString(initialAmount), label: 'QRaku テイクアウト' },
                    })
                    paymentRequestRef.current = pr

                    // ── 3. Apple Pay (브라우저 지원 시에만) ──────────────
                    try {
                        ap = await payments.applePay(pr)
                        setApplePay(ap)
                    } catch (err) {
                        console.log('[Square] Apple Pay 미지원:', err?.message || err)
                    }

                    // ── 4. Google Pay (가능한 경우 버튼 자동 렌더) ───────
                    try {
                        gp = await payments.googlePay(pr)
                        // attach 는 #sq-google-pay-button 컨테이너가 DOM에 있어야 함
                        await new Promise(r => setTimeout(r, 50))
                        await gp.attach('#sq-google-pay-button', {
                            buttonColor: 'black',
                            buttonType: 'pay',
                            buttonSizeMode: 'fill',
                        })
                        setGooglePay(gp)
                    } catch (err) {
                        console.log('[Square] Google Pay 미지원:', err?.message || err)
                    }
                }
            } catch (e) {
                console.error('Square SDK init error:', e)
                setSquareError('カード入力の初期化に失敗しました。ページをリロードしてください。')
            }
        }

        init()

        return () => {
            if (card) { card.destroy().catch(() => {}); setSquareCard(null); setSquareReady(false) }
            if (ap)   { setApplePay(null) }
            if (gp)   { try { gp.destroy?.() } catch {}; setGooglePay(null) }
            paymentRequestRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, canUseSquare, squareAppId, squareLocationId])

    // 할인이 변경될 때마다 PaymentRequest 금액 갱신 (Apple/Google Pay 팝업에 표시될 금액)
    useEffect(() => {
        if (!paymentRequestRef.current) return
        try {
            paymentRequestRef.current.update({
                total: { amount: toMajorString(finalAmount), label: 'QRaku テイクアウト' },
            })
        } catch (e) {
            console.warn('paymentRequest update 실패:', e?.message)
        }
        // toMajorString 은 통화 prop 기반 순수 포매터(렌더 안정) — finalAmount 만 트리거
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finalAmount])

    // Google Pay 버튼 클릭 핸들러 (attach 후 별도 등록)
    useEffect(() => {
        if (!googlePay || !googlePayBtnRef.current) return
        const handler = async (e) => {
            e.preventDefault()
            await handleWalletPay(googlePay)
        }
        const el = googlePayBtnRef.current
        el.addEventListener('click', handler)
        return () => el.removeEventListener('click', handler)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [googlePay, finalAmount])

    // Apple/Google Pay 공통 결제 핸들러
    const handleWalletPay = async (walletInstance) => {
        if (!walletInstance) return
        if (finalAmount <= 0) {
            alert('決済金額が0円のため、ウォレット決済できません。')
            return
        }
        setWalletPaying(true)
        try {
            const result = await walletInstance.tokenize()
            if (result.status === 'OK') {
                onPlaceOrder('square', result.token, isRoomService ? null : (pickupTime || null))
            } else {
                const msg = result.errors?.[0]?.message || '決済に失敗しました'
                alert(`ウォレット決済エラー: ${msg}`)
            }
        } catch (e) {
            // 사용자가 취소한 경우는 조용히 무시
            if (e?.message?.toLowerCase?.().includes('cancel')) return
            alert('ウォレット決済中にエラーが発生しました: ' + e.message)
        } finally {
            setWalletPaying(false)
        }
    }

    const handleTakeOutPay = async () => {
        if (!squareCard) {
            alert('カード入力フォームが準備中です。しばらくお待ちください。')
            return
        }
        try {
            const result = await squareCard.tokenize()
            if (result.status === 'OK') {
                onPlaceOrder('square', result.token, isRoomService ? null : (pickupTime || null))
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
                useStampReward: !!useStampReward,
                useCouponId: useCouponId || null,
            }
            localStorage.setItem(tempKey, JSON.stringify(tempOrder))

            // 스탬프 보상 자격을 위해 LIFF guest_uuid (line:userId) 우선
            const guestUuidForStamp = localStorage.getItem(`guest_uuid_${shopId}`) || localStorage.getItem('guest_uuid')

            // PayPay 결제 생성 API 호출 — 금액은 서버에서 재계산 (클라이언트 amount 미전송)
            const res = await axios.post('/api/paypay/create-payment', {
                shop_id: parseInt(shopId),
                items: cart.map(item => ({
                    menu_id: item.menuId,
                    quantity: item.quantity,
                    option_details: JSON.stringify(item.options || {}),
                })),
                order_description: `QRaku テイクアウト注文`,
                temp_order_key: tempKey,
                use_stamp_reward: !!useStampReward,
                use_coupon_id: useCouponId || null,
                guest_uuid: guestUuidForStamp,
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
                                                {fmt(item.price * item.quantity)}
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
                            {/* Stamp CRM Banner */}
                            {stampStatus?.stamp_active && (
                                <div className="bg-[#06C755]/10 border border-[#06C755]/30 rounded-2xl p-4 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <Gift className="w-5 h-5 text-[#06C755]" />
                                            <span className="font-bold text-[#06C755] text-sm">LINE スタンプカード</span>
                                        </div>
                                        <div className="text-xs font-bold text-slate-300">
                                            {stampStatus.stamp_count} / {stampStatus.stamp_target} 個
                                        </div>
                                    </div>
                                    
                                    {/* Progress visually */}
                                    <div className="flex gap-1 flex-wrap">
                                        {Array.from({ length: stampStatus.stamp_target }).map((_, i) => (
                                            <div key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px]
                                                ${i < stampStatus.stamp_count 
                                                    ? 'bg-[#06C755] text-white' 
                                                    : 'bg-black/20 text-slate-500 border border-white/10'}`}>
                                                {i < stampStatus.stamp_count ? '★' : i + 1}
                                            </div>
                                        ))}
                                    </div>

                                    {stampStatus.can_use_reward ? (
                                        <button 
                                            onClick={() => setUseStampReward(!useStampReward)}
                                            className={`w-full py-2.5 px-4 rounded-xl flex items-center justify-between transition-colors border
                                                ${useStampReward 
                                                    ? 'bg-[#06C755] border-[#06C755] text-white shadow-lg shadow-[#06C755]/20' 
                                                    : 'bg-white/5 border-[#06C755]/50 text-slate-300 hover:bg-[#06C755]/10'}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                {useStampReward ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border border-current" />}
                                                <span className="text-sm font-bold tracking-wide">
                                                    特典を使う (-{fmt(stampStatus.stamp_reward_discount)})
                                                </span>
                                            </div>
                                            {useStampReward && <span className="text-xs font-black">適用中!</span>}
                                        </button>
                                    ) : (
                                        <p className="text-xs text-slate-400">
                                            {stampStatus.stamp_reward_msg || `あと${stampStatus.stamp_target - stampStatus.stamp_count}個で特典ゲット！`}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Photo Review Contest Coupons Banner */}
                            {guestCoupons && guestCoupons.length > 0 && (
                                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 space-y-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Gift className="w-5 h-5 text-indigo-400" />
                                        <span className="font-bold text-indigo-400 text-sm">特典クーポン</span>
                                    </div>
                                    <div className="space-y-2">
                                        {guestCoupons.map(coupon => (
                                            <button 
                                                key={coupon.id}
                                                onClick={() => setUseCouponId(useCouponId === coupon.id ? null : coupon.id)}
                                                className={`w-full py-2.5 px-4 rounded-xl flex items-center justify-between transition-colors border
                                                    ${useCouponId === coupon.id 
                                                        ? 'bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                                                        : 'bg-white/5 border-indigo-500/50 text-slate-300 hover:bg-indigo-500/10'}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {useCouponId === coupon.id ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border border-current" />}
                                                    <span className="text-sm font-bold tracking-wide">
                                                        {fmt(coupon.discount_amount)} 割引クーポン
                                                    </span>
                                                </div>
                                                {useCouponId === coupon.id && <span className="text-xs font-black">適用中!</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between px-2">
                                <span className="text-slate-400 text-sm font-medium">Subtotal</span>
                                <span className="text-lg font-medium text-white tracking-tight">{fmt(totalAmount)}</span>
                            </div>
                            
                            {useStampReward && (
                                <div className="flex items-center justify-between px-2 text-[#06C755]">
                                    <span className="text-sm font-bold flex items-center gap-1">
                                        <Gift className="w-4 h-4" /> スタンプ割引
                                    </span>
                                    <span className="text-lg font-bold tracking-tight">-{fmt(stampStatus.stamp_reward_discount)}</span>
                                </div>
                            )}

                            {useCouponId && (
                                <div className="flex items-center justify-between px-2 text-indigo-400">
                                    <span className="text-sm font-bold flex items-center gap-1">
                                        <Gift className="w-4 h-4" /> クーポン割引
                                    </span>
                                    <span className="text-lg font-bold tracking-tight">
                                        -{fmt(guestCoupons.find(c => c.id === useCouponId)?.discount_amount || 0)}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center justify-between px-2 pt-2 border-t border-white/10">
                                <span className="text-white text-base font-bold">Total</span>
                                <span className="text-3xl font-black text-white tracking-tight">
                                    {fmt(Math.max(0, totalAmount - (useStampReward ? stampStatus.stamp_reward_discount : 0) - (useCouponId ? (guestCoupons.find(c => c.id === useCouponId)?.discount_amount || 0) : 0)))}
                                </span>
                            </div>

                            {/* 선결제 extras: 픽업시간(테이크아웃만) + 결제폼. 룸서비스는 픽업시간 숨김 */}
                            {isPrepay && (
                                <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                                    {/* Pickup time — 테이크아웃만 (룸서비스는 객실 배달이라 불필요) */}
                                    {isTakeOut && (
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
                                    )}

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
                                    <div className="space-y-2">
                                        {/* Apple Pay (Safari/iOS 에서만 표시) */}
                                        {applePay && (
                                            <button
                                                onClick={() => handleWalletPay(applePay)}
                                                disabled={loading || walletPaying || finalAmount <= 0}
                                                className="w-full py-4 bg-black hover:bg-slate-800 text-white rounded-[1.5rem] font-bold tracking-tight shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                <span className="text-xl"></span>
                                                <span className="text-base">Pay</span>
                                            </button>
                                        )}

                                        {/* Google Pay (지원되는 환경에서만 Square 가 자동 렌더) */}
                                        {googlePay && (
                                            <div ref={googlePayBtnRef} id="sq-google-pay-button" className="w-full min-h-[52px] rounded-[1.5rem] overflow-hidden" />
                                        )}

                                        {/* Apple/Google Pay 미지원 환경을 위한 placeholder Google Pay 컨테이너 */}
                                        {!googlePay && <div id="sq-google-pay-button" style={{ display: 'none' }} />}

                                        {/* 또는 카드 직접 입력 */}
                                        {(applePay || googlePay) && (
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 my-1">
                                                <div className="flex-1 h-px bg-white/10" />
                                                <span>または カード情報を入力</span>
                                                <div className="flex-1 h-px bg-white/10" />
                                            </div>
                                        )}

                                        <button
                                            onClick={handleTakeOutPay}
                                            disabled={loading || !squareReady || walletPaying}
                                            className="w-full py-5 bg-[#c21e2f] hover:bg-[#9f1239] text-white rounded-[1.5rem] font-bold tracking-tight shadow-xl shadow-[#c21e2f]/30 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <CreditCard className="w-5 h-5" />
                                            <span className="text-lg">{loading ? '決済処理中...' : 'カードで決済する'}</span>
                                        </button>
                                    </div>
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
