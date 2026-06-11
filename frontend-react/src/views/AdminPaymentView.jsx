import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { AdminNavBar } from './AdminView'

export default function AdminPaymentView() {
    const { shop_id } = useParams()

    const [storeData, setStoreData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [paymentSettings, setPaymentSettings] = useState(null)
    const [activeMethod, setActiveMethod] = useState('PAY_AT_COUNTER')

    // PayPay credential form
    const [paypayForm, setPaypayForm] = useState({ api_key: '', api_secret: '', merchant_id: '' })
    const [paypayFormDirty, setPaypayFormDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const [terminalState, setTerminalState] = useState({ status: 'NOT_PAIRED' })
    const [terminalBusy, setTerminalBusy] = useState(false)

    useEffect(() => {
        async function load() {
            try {
                const [storeRes, payRes] = await Promise.all([
                    axios.get(`/api/stores/${shop_id}`),
                    axios.get(`/api/admin/store/${shop_id}/payment-settings`).catch(() => null),
                ])
                const store = storeRes.data?.data || storeRes.data
                setStoreData(store)
                if (payRes?.data) {
                    setPaymentSettings(payRes.data)
                    setActiveMethod(payRes.data.payment_method_type || 'PAY_AT_COUNTER')
                    setTerminalState({
                        status: payRes.data.square_terminal_status || 'NOT_PAIRED',
                        deviceId: payRes.data.square_terminal_device_id || null,
                        deviceName: payRes.data.square_terminal_device_name || null,
                        pairBy: payRes.data.square_terminal_pair_by || null,
                    })
                    setPaypayForm(prev => ({
                        ...prev,
                        merchant_id: payRes.data.paypay_merchant_id || '',
                    }))
                }
            } catch (e) { console.error(e) }
            setLoading(false)
        }
        load()
    }, [shop_id])

    useEffect(() => {
        if (terminalState.status !== 'UNPAIRED') return
        const timer = setInterval(async () => {
            try {
                const res = await axios.get(`/api/square/terminal/device-code/${shop_id}`)
                setTerminalState({
                    status: res.data.status,
                    code: res.data.code || null,
                    pairBy: res.data.pair_by || null,
                    deviceId: res.data.device_id || null,
                    deviceName: res.data.device_name || null,
                })
            } catch (e) {
                console.error('Square Terminal pairing status failed', e)
            }
        }, 3000)
        return () => clearInterval(timer)
    }, [shop_id, terminalState.status])

    const startSquareOAuth = async () => {
        try {
            const res = await axios.get('/api/square/authorize', { params: { shop_id } })
            window.location.href = res.data.authorization_url
        } catch (e) {
            alert('Square連携を開始できません: ' + (e.response?.data?.detail || e.message))
        }
    }

    const startTerminalPairing = async () => {
        setTerminalBusy(true)
        try {
            const res = await axios.post(`/api/square/terminal/device-code/${shop_id}`)
            setTerminalState({
                status: res.data.status,
                code: res.data.code,
                pairBy: res.data.pair_by,
                deviceName: res.data.device_name,
            })
        } catch (e) {
            alert('ペアリングコードを発行できません: ' + (e.response?.data?.detail || e.message))
        } finally {
            setTerminalBusy(false)
        }
    }

    const forgetTerminal = async () => {
        if (!window.confirm('Square Terminalのペアリング情報を解除しますか？')) return
        setTerminalBusy(true)
        try {
            await axios.delete(`/api/square/terminal/device/${shop_id}`)
            setTerminalState({ status: 'NOT_PAIRED' })
        } catch (e) {
            alert('端末情報を解除できません: ' + (e.response?.data?.detail || e.message))
        } finally {
            setTerminalBusy(false)
        }
    }

    const selectPaymentMethod = async (methodType) => {
        try {
            await axios.patch(`/api/admin/store/${shop_id}/payment-settings`, {
                payment_method_type: methodType,
            })
            setActiveMethod(methodType)
            setPaymentSettings(prev => ({ ...prev, payment_method_type: methodType }))
        } catch (e) { alert('保存に失敗しました') }
    }

    const savePayPayCredentials = async () => {
        setSaving(true)
        try {
            await axios.patch(`/api/admin/store/${shop_id}/payment-settings`, {
                paypay_api_key: paypayForm.api_key || undefined,
                paypay_api_secret: paypayForm.api_secret || undefined,
                paypay_merchant_id: paypayForm.merchant_id || undefined,
            })
            setPaypayFormDirty(false)
            setPaymentSettings(prev => ({
                ...prev,
                has_paypay_credentials: !!(paypayForm.api_key && paypayForm.api_secret),
                paypay_merchant_id: paypayForm.merchant_id,
            }))
            alert('PayPay 認証情報を保存しました。')
        } catch (e) {
            alert('保存に失敗しました: ' + (e.response?.data?.detail || e.message))
        } finally { setSaving(false) }
    }

    if (loading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
    )

    const tracks = [
        {
            key: 'PAY_AT_COUNTER',
            label: '現場決済',
            desc: '現金・他社端末など、オフラインでの現場決済。QRakuの決済APIをバイパスします。',
            icon: 'payments',
            color: 'emerald',
        },
        {
            key: 'SQUARE_INTEGRATED',
            label: 'Square 決済',
            desc: 'Square POS連携で、クレジットカード・電子マネー（PayPay等）のオンライン決済を処理します。',
            icon: 'credit_card',
            color: 'blue',
        },
        // [2026-06-12] PayPay ダイレクトは保留。テイクアウト先決済は Square に一本化。
        //   (백엔드/콜백/설정블록 코드는 재개 대비로 보존 — 선택지만 제거)
    ]

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 font-display">
            <AdminNavBar storeData={storeData} shop_id={shop_id} />

            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">payments</span>
                        決済設定
                    </h2>
                    <div className="flex gap-2">
                        <a href="/docs/payment_setup_guide.html" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border-2 border-indigo-200 text-indigo-600 font-bold text-sm hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm">
                            <span className="material-symbols-outlined text-[18px]">menu_book</span>
                            導入ガイド
                        </a>
                        <button onClick={() => {
                                const w = window.open('/docs/payment_setup_guide.html', '_blank')
                                if (w) { w.addEventListener('load', () => setTimeout(() => w.print(), 600)) }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-sm hover:from-red-600 hover:to-red-700 transition-all shadow-sm cursor-pointer border-0">
                            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                            PDFダウンロード
                        </button>
                    </div>
                </div>

                {/* ── 3-Track Payment Method ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">account_balance</span>
                        決済方式の選択
                    </h4>
                    <p className="text-xs text-slate-400 mb-5">お客様からの支払いをどのように受け付けるか選択してください。</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {tracks.map(track => {
                            const isActive = activeMethod === track.key
                            const colorMap = {
                                emerald: { border: 'border-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'bg-emerald-500' },
                                blue: { border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-600', badge: 'bg-blue-500' },
                                red: { border: 'border-red-300', bg: 'bg-red-50', text: 'text-red-500', badge: 'bg-red-400' },
                            }
                            const c = colorMap[track.color]
                            return (
                                <button key={track.key} onClick={() => selectPaymentMethod(track.key)}
                                    className={`p-5 rounded-2xl border-2 text-left transition-all relative ${
                                        isActive ? `${c.border} ${c.bg}` : 'border-slate-200 hover:border-slate-300'
                                    }`}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className={`material-symbols-outlined ${isActive ? c.text : 'text-slate-400'}`}>{track.icon}</span>
                                        <span className="font-black text-sm">{track.label}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-relaxed mb-3">{track.desc}</p>
                                    {isActive && <span className={`text-[10px] font-black text-white px-2.5 py-1 rounded-full ${c.badge}`}>選択中</span>}
                                </button>
                            )
                        })}
                    </div>
                </section>

                {/* ── Square OAuth 連携 ── */}
                {activeMethod === 'SQUARE_INTEGRATED' && (
                    <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        <h4 className="font-bold mb-1 flex items-center gap-2">
                            <span className="material-symbols-outlined text-blue-500">link</span>
                            Square アカウント連携
                        </h4>
                        <p className="text-xs text-slate-400 mb-4">
                            {storeData?.square_connected
                                ? `連携済み（加盟店ID: ${storeData?.square_merchant_id || '—'}）`
                                : '未連携です。Square決済を使用するにはアカウントを連携してください。'}
                        </p>
                        {!storeData?.square_connected && (
                            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
                                <div className="flex items-start gap-2">
                                    <span className="material-symbols-outlined text-blue-500 text-[20px]">smartphone</span>
                                    <div>
                                        <p className="font-black text-sm text-slate-800">Square 端末がなくてもOK</p>
                                        <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                                            テイクアウトの事前決済（オンライン決済）だけなら、物理端末は不要です。Squareの無料アカウントだけで始められます。
                                        </p>
                                    </div>
                                </div>

                                <ol className="space-y-2">
                                    <li className="flex items-start gap-2.5">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-[11px] font-black flex items-center justify-center">1</span>
                                        <span className="text-xs text-slate-600 leading-relaxed">
                                            Square 無料アカウントを作成
                                            <a href="https://squareup.com/jp/ja" target="_blank" rel="noopener noreferrer"
                                                className="text-blue-600 font-bold hover:underline inline-flex items-center gap-0.5 ml-1">
                                                Squareに登録<span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                            </a>
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2.5">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-[11px] font-black flex items-center justify-center">2</span>
                                        <span className="text-xs text-slate-600 leading-relaxed">
                                            アカウントを有効化（<span className="font-bold text-slate-700">唯一の関門</span>）— 銀行口座の登録と本人確認。完了すると実際の入金が可能になります。
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2.5">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-[11px] font-black flex items-center justify-center">3</span>
                                        <span className="text-xs text-slate-600 leading-relaxed">
                                            下の「Squareアカウントを連携する」ボタンで接続
                                        </span>
                                    </li>
                                </ol>

                                <div className="flex items-center gap-1.5 text-[11px] text-blue-700 bg-white/70 rounded-lg px-3 py-2 border border-blue-100">
                                    <span className="material-symbols-outlined text-[16px]">credit_card</span>
                                    Square 1つで クレジットカードも PayPay も受け取れます。
                                </div>

                                <a href="/docs/payment_setup_guide.html" target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline">
                                    <span className="material-symbols-outlined text-[16px]">menu_book</span>
                                    決済導入ガイドを見る
                                </a>
                            </div>
                        )}
                        {storeData?.square_connected && (
                            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-black text-sm text-slate-800">Square Terminal ペアリング</p>
                                        <p className="text-[11px] text-slate-500 mt-1">
                                            イートイン会計をQRakuから端末へ送信する場合に設定します。
                                        </p>
                                    </div>
                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                                        terminalState.status === 'PAIRED'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {terminalState.status === 'PAIRED' ? '接続済み' : '未接続'}
                                    </span>
                                </div>

                                {terminalState.status === 'PAIRED' ? (
                                    <div className="space-y-2">
                                        <div className="rounded-xl bg-white border border-emerald-200 p-3 text-xs text-slate-600">
                                            <p className="font-bold text-emerald-700">
                                                {terminalState.deviceName || 'Square Terminal'}
                                            </p>
                                            <p className="mt-1 font-mono text-[10px] break-all">
                                                Device ID: {terminalState.deviceId}
                                            </p>
                                        </div>
                                        <button onClick={forgetTerminal} disabled={terminalBusy}
                                            className="w-full py-2.5 rounded-xl border border-red-200 bg-white text-red-600 text-xs font-bold disabled:opacity-50">
                                            Terminalの接続情報を解除
                                        </button>
                                    </div>
                                ) : terminalState.status === 'UNPAIRED' && terminalState.code ? (
                                    <div className="space-y-3">
                                        <div className="rounded-xl bg-white border-2 border-blue-200 p-4 text-center">
                                            <p className="text-xs text-slate-500 mb-1">端末に入力するコード</p>
                                            <p className="text-4xl font-black tracking-[0.25em] text-blue-700">
                                                {terminalState.code}
                                            </p>
                                            <p className="text-[10px] text-amber-600 mt-2">
                                                コードは約5分で期限切れになります
                                            </p>
                                        </div>
                                        <ol className="text-xs text-slate-600 space-y-1 list-decimal pl-5">
                                            <li>Square Terminalを起動してWi-Fiに接続</li>
                                            <li>「設定」からログアウトし、ログイン画面を表示</li>
                                            <li>上のコードを入力して「接続」を選択</li>
                                            <li>この画面が「接続済み」になるまで待つ</li>
                                        </ol>
                                    </div>
                                ) : (
                                    <button onClick={startTerminalPairing} disabled={terminalBusy}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                                        {terminalBusy ? 'コード発行中...' : 'Terminalペアリングコードを発行'}
                                    </button>
                                )}

                                <a href="/docs/payment_setup_guide.html#terminal-pairing"
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline">
                                    詳しいペアリング手順を見る
                                </a>
                            </div>
                        )}
                        {storeData?.square_connected ? (
                            <button onClick={async () => {
                                if (window.confirm('Square連携を解除しますか？')) {
                                    try {
                                        await axios.delete(`/api/square/disconnect/${shop_id}`)
                                        setStoreData({ ...storeData, square_connected: false, square_merchant_id: null })
                                        alert('連携を解除しました。')
                                    } catch { alert('解除中にエラーが発生しました。') }
                                }
                            }}
                                className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-sm">link_off</span>
                                Square連携を解除
                            </button>
                        ) : (
                            <button onClick={startSquareOAuth}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/20">
                                <span className="material-symbols-outlined text-sm">open_in_new</span>
                                Squareアカウントを連携する (OAuth)
                            </button>
                        )}
                    </section>
                )}

                {/* ── PayPay Direct 認証情報 ── */}
                {activeMethod === 'PAYPAY_DIRECT' && (
                    <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        <h4 className="font-bold mb-1 flex items-center gap-2">
                            <span className="material-symbols-outlined text-red-500">qr_code_2</span>
                            PayPay API 認証情報
                        </h4>
                        <p className="text-xs text-slate-400 mb-4">
                            PayPay for Developersで取得したAPI認証情報を入力してください。
                        </p>

                        {paymentSettings?.has_paypay_credentials && (
                            <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                                <span className="text-emerald-600 text-xs font-bold">✅ 認証情報設定済み</span>
                                {paymentSettings?.paypay_merchant_id && (
                                    <span className="text-slate-500 text-xs ml-auto">加盟店ID: {paymentSettings.paypay_merchant_id}</span>
                                )}
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">API Key</label>
                                <input
                                    type="password"
                                    placeholder={paymentSettings?.has_paypay_credentials ? '••••••••（設定済み・変更する場合のみ入力）' : 'API Key を入力'}
                                    value={paypayForm.api_key}
                                    onChange={e => { setPaypayForm(prev => ({ ...prev, api_key: e.target.value })); setPaypayFormDirty(true) }}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">API Secret</label>
                                <input
                                    type="password"
                                    placeholder={paymentSettings?.has_paypay_credentials ? '••••••••（設定済み・変更する場合のみ入力）' : 'API Secret を入力'}
                                    value={paypayForm.api_secret}
                                    onChange={e => { setPaypayForm(prev => ({ ...prev, api_secret: e.target.value })); setPaypayFormDirty(true) }}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">加盟店 ID (Merchant ID)</label>
                                <input
                                    type="text"
                                    placeholder="加盟店IDを入力"
                                    value={paypayForm.merchant_id}
                                    onChange={e => { setPaypayForm(prev => ({ ...prev, merchant_id: e.target.value })); setPaypayFormDirty(true) }}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300"
                                />
                            </div>

                            <button
                                onClick={savePayPayCredentials}
                                disabled={!paypayFormDirty || saving}
                                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="material-symbols-outlined text-sm">save</span>
                                {saving ? '保存中...' : '認証情報を保存'}
                            </button>
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}
