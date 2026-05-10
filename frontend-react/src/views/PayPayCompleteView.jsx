import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function PayPayCompleteView() {
    const { shop_id } = useParams()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [status, setStatus] = useState('checking') // checking, success, failed
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        const mid = searchParams.get('mid')
        const tok = searchParams.get('tok')

        if (!mid) {
            setStatus('failed')
            setErrorMsg('決済情報が見つかりません。')
            return
        }

        const processPayment = async () => {
            try {
                // PayPay 결제 상태 확인
                const statusRes = await axios.get(`/api/paypay/payment-status/${mid}`)

                if (statusRes.data.payment_status !== 'COMPLETED') {
                    setStatus('failed')
                    setErrorMsg(`決済が完了していません (${statusRes.data.payment_status})`)
                    return
                }

                // localStorage에서 임시 저장된 주문 데이터 복원
                const tempData = tok ? JSON.parse(localStorage.getItem(tok) || 'null') : null
                if (!tempData) {
                    setStatus('failed')
                    setErrorMsg('注文データが見つかりません。再度ご注文ください。')
                    return
                }

                // 주문 생성 (source_id = merchant_payment_id)
                // guest_uuid: LIFF 로그인된 line:userId 우선, 없으면 글로벌 fallback
                const lineUuid = localStorage.getItem(`guest_uuid_${shop_id}`)
                const orderPayload = {
                    shop_id: String(shop_id),
                    table_number: '0',
                    session_token: 'takeout',
                    guest_uuid: lineUuid || localStorage.getItem('guest_uuid'),
                    order_type: 'take_out',
                    payment_method: 'paypay_direct',
                    source_id: mid,
                    pickup_time: tempData.pickupTime || null,
                    use_stamp_reward: !!tempData.useStampReward,
                    use_coupon_id: tempData.useCouponId || null,
                    items: (tempData.cart || []).map(item => ({
                        menu_item_id: String(item.menuId),
                        quantity: item.quantity,
                        option_details: JSON.stringify(item.options || {})
                    }))
                }

                if (!orderPayload.items.length) {
                    setStatus('failed')
                    setErrorMsg('カート情報が見つかりません。再度ご注文ください。')
                    return
                }

                const orderRes = await axios.post('/api/orders/', orderPayload)

                // 임시 데이터 정리
                if (tok) {
                    localStorage.removeItem(tok)
                    localStorage.removeItem(`${tok}_mid`)
                }

                setStatus('success')

                // 영수증 페이지로 이동
                setTimeout(() => {
                    navigate(`/${shop_id}/receipt/${orderRes.data.order_id}`)
                }, 1500)

            } catch (e) {
                console.error('PayPay completion error:', e)
                setStatus('failed')
                setErrorMsg(e.response?.data?.detail || '注文処理中にエラーが発生しました。')
            }
        }

        processPayment()
    }, [shop_id, searchParams, navigate])

    return (
        <div className="min-h-screen bg-charcoal flex items-center justify-center p-4">
            <div className="max-w-sm w-full text-center space-y-6">
                {status === 'checking' && (
                    <>
                        <div className="w-16 h-16 mx-auto border-4 border-red-400 border-t-transparent rounded-full animate-spin" />
                        <h2 className="text-xl font-bold text-white">PayPay 決済確認中...</h2>
                        <p className="text-sm text-slate-400">しばらくお待ちください</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-16 h-16 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center">
                            <span className="text-3xl">✅</span>
                        </div>
                        <h2 className="text-xl font-bold text-white">決済完了！</h2>
                        <p className="text-sm text-slate-400">注文が確定しました。レシートページへ移動します...</p>
                    </>
                )}

                {status === 'failed' && (
                    <>
                        <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
                            <span className="text-3xl">❌</span>
                        </div>
                        <h2 className="text-xl font-bold text-white">決済に失敗しました</h2>
                        <p className="text-sm text-red-400">{errorMsg}</p>
                        <button
                            onClick={() => navigate(`/${shop_id}/takeout`)}
                            className="mt-4 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                        >
                            テイクアウトページに戻る
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
