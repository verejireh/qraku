import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { AdminNavBar } from './AdminView'
import { useLanguage } from '../context/LanguageContext'

function Toggle({ value, onChange, disabled }) {
    return (
        <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
            className={`w-11 h-6 rounded-full relative transition-colors ${value ? 'bg-adminprimary' : 'bg-slate-300'} ${disabled ? 'opacity-40' : ''}`}>
            <div className={`absolute top-1 size-4 bg-white rounded-full transition-all shadow-sm ${value ? 'left-6' : 'left-1'}`} />
        </button>
    )
}

export default function AdminOperationView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const { t } = useLanguage()

    const [storeData, setStoreData] = useState(null)
    const [tables, setTables] = useState([])
    const [loading, setLoading] = useState(true)
    const [newTableName, setNewTableName] = useState('')
    const [newTableSeats, setNewTableSeats] = useState(4)

    useEffect(() => {
        async function load() {
            try {
                const [storeRes, tablesRes] = await Promise.all([
                    axios.get(`/api/stores/${shop_id}`),
                    axios.get(`/api/stores/${shop_id}/tables`).catch(() => ({ data: [] })),
                ])
                const store = storeRes.data?.data || storeRes.data
                setStoreData(store)
                const t = tablesRes.data
                setTables(Array.isArray(t) ? t : (t?.data || t?.tables || []))
            } catch (e) { console.error(e) }
            setLoading(false)
        }
        load()
    }, [shop_id])

    const handleStoreUpdate = async (field, value) => {
        try {
            await axios.patch(`/api/stores/${shop_id}`, { [field]: value })
            setStoreData(prev => ({ ...prev, [field]: value }))
        } catch (e) { alert('保存に失敗しました') }
    }

    const addTable = async () => {
        if (!newTableName.trim() || !storeData?.id) return
        try {
            await axios.post(`/api/stores/${storeData.id}/tables`, {
                table_number: newTableName.trim(),
                seats: newTableSeats,
                store_id: storeData.id,
            })
            setNewTableName('')
            setNewTableSeats(4)
            const res = await axios.get(`/api/stores/${shop_id}/tables`)
            const t = res.data
            setTables(Array.isArray(t) ? t : (t?.data || t?.tables || []))
        } catch (e) { alert('テーブル追加に失敗しました') }
    }

    const deleteTable = async (tableId) => {
        if (!confirm('このテーブルを削除しますか？')) return
        try {
            await axios.delete(`/api/stores/${shop_id}/tables/${tableId}`)
            setTables(tables.filter(t => t.id !== tableId))
        } catch (e) { alert('削除に失敗しました') }
    }

    if (loading) return <div className="min-h-screen bg-[#f8f6f6] tsubaki-pattern-bg flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-adminprimary border-t-transparent rounded-full" /></div>

    return (
        <div className="min-h-screen bg-[#f8f6f6] tsubaki-pattern-bg font-display">
            <AdminNavBar storeData={storeData} shop_id={shop_id} />

            <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-adminprimary">settings_suggest</span>
                    {t('admin.operation.title')}
                </h2>

                {/* ── テーブル管理 ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">table_restaurant</span>
                        {t('admin.operation.table_manage')}
                    </h4>
                    <div className="flex gap-2 mb-4 items-end">
                        <div className="flex-1">
                            <label className="text-[10px] text-slate-500 font-bold block mb-1">テーブル名</label>
                            <input type="text" value={newTableName} onChange={e => setNewTableName(e.target.value)}
                                placeholder={t('admin.operation.table_name') || '例: A1, B2'} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-adminprimary/50" />
                        </div>
                        <div className="w-24">
                            <label className="text-[10px] text-slate-500 font-bold block mb-1">定員数</label>
                            <input type="number" value={newTableSeats} onChange={e => setNewTableSeats(parseInt(e.target.value) || 1)}
                                min={1} max={20} placeholder="4" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl text-center focus:outline-none focus:border-adminprimary/50" />
                        </div>
                        <button onClick={addTable} disabled={!newTableName.trim()}
                            className="px-4 py-2 bg-adminprimary text-white text-xs font-bold rounded-xl hover:bg-adminprimary/90 disabled:opacity-40 transition-all">
                            {t('admin.operation.add')}
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {tables.map(table => (
                            <div key={table.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between group">
                                <div>
                                    <p className="text-sm font-bold">{table.table_number || table.name}</p>
                                    <p className="text-[10px] text-slate-400">{table.seats || '-'}席</p>
                                </div>
                                <button onClick={() => deleteTable(table.id)}
                                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                            </div>
                        ))}
                        {tables.length === 0 && <p className="text-sm text-slate-400 italic col-span-full text-center py-6">{t('admin.operation.no_tables')}</p>}
                    </div>
                </section>

                {/* ── QRコードビルダー ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">qr_code_2</span>
                        QRコードビルダー
                    </h4>
                    <p className="text-xs text-slate-400 mb-4">EatIn（テーブル別）・TakeOut用のQRコードを作成・印刷できます。</p>
                    <button onClick={() => navigate(`/${shop_id}/admin/qr-builder`)}
                        className="px-5 py-3 bg-gradient-to-r from-[#c21e2f] to-[#991825] text-white text-sm font-bold rounded-xl shadow-lg shadow-adminprimary/30 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                        QRコードビルダーを開く
                    </button>
                </section>

                {/* ── 注文確認方式 (Kitchen Mode) ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">kitchen</span>
                        {t('admin.operation.kitchen_mode')}
                    </h4>
                    <p className="text-xs text-slate-400 italic mb-4">변경は即座に保存され、次回の注文から反映されます。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button onClick={() => {
                            handleStoreUpdate('kitchen_mode', 'kds')
                            handleStoreUpdate('pos_mode', 'basic')
                        }}
                            className={`p-5 rounded-2xl border-2 text-left transition-all ${storeData?.kitchen_mode !== 'square' ? 'border-adminprimary/50 bg-adminprimary/5' : 'border-slate-200 hover:border-adminprimary/30'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-adminprimary">tablet</span>
                                <span className="font-black text-sm">QRaku タブレット</span>
                                {storeData?.kitchen_mode !== 'square' && <span className="ml-auto text-[10px] font-black bg-adminprimary text-white px-2 py-0.5 rounded-full">選択中</span>}
                            </div>
                            <p className="text-xs text-slate-500">アプリ内キッチンディスプレイで注文を確認するスタンダードモード。</p>
                        </button>
                        <button onClick={() => {
                            handleStoreUpdate('kitchen_mode', 'square')
                            handleStoreUpdate('pos_mode', 'square')
                        }}
                            className={`p-5 rounded-2xl border-2 text-left transition-all ${storeData?.kitchen_mode === 'square' ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-blue-500">print</span>
                                <span className="font-black text-sm">Square POS / プリンター</span>
                                {storeData?.kitchen_mode === 'square' && <span className="ml-auto text-[10px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full">選択中</span>}
                            </div>
                            <p className="text-xs text-slate-500">注文データを Square POS またはプリンターへ自動転送。</p>
                        </button>
                    </div>
                </section>

                {/* ── 税金設定 ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">receipt</span>
                        {t('admin.operation.tax_setting')}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">消費税率 (%)</label>
                            <input type="number" min={0} max={100} step={0.1}
                                defaultValue={storeData?.tax_rate ?? 10}
                                onBlur={e => handleStoreUpdate('tax_rate', parseFloat(e.target.value))}
                                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-adminprimary/50" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-2">表示方式</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => handleStoreUpdate('tax_included', true)}
                                    className={`py-3 text-xs font-bold rounded-xl border-2 transition-all ${storeData?.tax_included !== false ? 'bg-adminprimary/10 border-adminprimary/50 text-adminprimary' : 'border-slate-200 text-slate-400'}`}>
                                    税込（内税）
                                </button>
                                <button onClick={() => handleStoreUpdate('tax_included', false)}
                                    className={`py-3 text-xs font-bold rounded-xl border-2 transition-all ${storeData?.tax_included === false ? 'bg-adminprimary/10 border-adminprimary/50 text-adminprimary' : 'border-slate-200 text-slate-400'}`}>
                                    税別（外税）
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── お客様ページの表示設定 ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500">star</span>
                        お客様ページの表示設定
                    </h4>
                    <p className="text-xs text-slate-400 mb-4">注文ページのホーム画面に表示する要素を設定します。</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button onClick={() => handleStoreUpdate('show_daily_specials', !storeData?.show_daily_specials)}
                            className={`p-4 rounded-2xl border-2 text-left transition-all ${storeData?.show_daily_specials !== false ? 'border-amber-400/50 bg-amber-50' : 'border-slate-200 opacity-60'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-amber-500">restaurant</span>
                                <span className="font-black text-sm">Daily Specials</span>
                                <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full ${storeData?.show_daily_specials !== false ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                    {storeData?.show_daily_specials !== false ? 'ON' : 'OFF'}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500">ホーム画面に「本日のおすすめ」セクションを表示します。メニュー管理でSPECIAL設定したメニューが表示されます。</p>
                        </button>
                    </div>
                </section>

                {/* ── テイクアウト設定 ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">takeout_dining</span>
                        {t('admin.operation.takeout_setting')}
                    </h4>
                    <p className="text-xs text-slate-400 italic mb-4">
                        テイクアウトは先決済方式です。Square または PayPay の設定が必要です。
                    </p>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-adminprimary/5 rounded-xl">
                            <div>
                                <span className="text-sm font-bold">テイクアウト機能</span>
                                <p className="text-[10px] text-slate-400 mt-0.5">お客様がテイクアウト注文できるようにします</p>
                            </div>
                            <Toggle value={storeData?.takeout_enabled} onChange={v => handleStoreUpdate('takeout_enabled', v)} />
                        </div>

                        {/* 결제설정 연결 상태 안내 */}
                        {storeData?.takeout_enabled && !storeData?.has_online_payment && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                                <span className="material-symbols-outlined text-amber-500 mt-0.5">warning</span>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-amber-700">オンライン決済が未設定です</p>
                                    <p className="text-xs text-amber-600 mt-1">
                                        テイクアウトは先決済のため、Square または PayPay の設定が必要です。
                                        現在の設定ではお客様がテイクアウト注文できません。
                                    </p>
                                    <button
                                        onClick={() => navigate(`/${shop_id}/admin/payment`)}
                                        className="mt-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                        決済設定へ移動
                                    </button>
                                </div>
                            </div>
                        )}

                        {storeData?.takeout_enabled && storeData?.has_online_payment && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                                <p className="text-xs text-emerald-700 font-bold">
                                    オンライン決済が設定済み — テイクアウト注文を受け付けます
                                </p>
                            </div>
                        )}

                        {storeData?.takeout_enabled && (
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">デフォルト待ち時間（分）</label>
                                <input type="number" min={5} max={120} step={5}
                                    defaultValue={storeData?.takeout_default_wait_minutes ?? 15}
                                    onBlur={e => handleStoreUpdate('takeout_default_wait_minutes', parseInt(e.target.value))}
                                    className="w-32 px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-adminprimary/50" />
                                <p className="text-[10px] text-slate-400 mt-1">お客様がピックアップ時間を未入力の場合の初期値です</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 領収書カスタマイズ ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">description</span>
                        {t('admin.operation.receipt_custom')}
                    </h4>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">フッターメッセージ</label>
                            <textarea rows={3}
                                defaultValue={storeData?.receipt_footer_message || ''}
                                onBlur={e => handleStoreUpdate('receipt_footer_message', e.target.value.trim())}
                                placeholder="例: ご来店ありがとうございます。またのお越しをお待ちしております。"
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-adminprimary/50 resize-none" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">ロゴ画像URL</label>
                            <input type="url"
                                defaultValue={storeData?.receipt_logo_url || ''}
                                onBlur={e => handleStoreUpdate('receipt_logo_url', e.target.value.trim())}
                                placeholder="https://example.com/logo.png"
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-adminprimary/50" />
                            {storeData?.receipt_logo_url && (
                                <img src={storeData.receipt_logo_url} alt="Logo preview" className="mt-2 h-12 object-contain rounded" />
                            )}
                        </div>
                    </div>
                </section>

                {/* ── 言語設定 ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h4 className="font-bold mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-adminprimary">translate</span>
                        {t('admin.operation.language_setting')}
                    </h4>
                    <p className="text-xs text-slate-400 mb-4">選択した言語がお客様用メニューの言語選択画面に表示されます。</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.entries({
                            ja: '日本語', en: 'English', ko: '한국어', zh: '简体中文',
                            vi: 'Tiếng Việt', fr: 'Français', es: 'Español', de: 'Deutsch'
                        }).map(([code, name]) => {
                            const langs = storeData?.supported_languages?.split(',') || []
                            const on = langs.includes(code)
                            return (
                                <button key={code} onClick={async () => {
                                    let newLangs
                                    if (on) {
                                        if (langs.length <= 1) { alert('最低1つの言語は選択する必要があります。'); return }
                                        newLangs = langs.filter(l => l !== code)
                                    } else { newLangs = [...langs, code] }
                                    handleStoreUpdate('supported_languages', newLangs.join(','))
                                }}
                                    className={`py-2.5 px-3 text-xs font-bold rounded-xl border-2 transition-all flex items-center justify-between ${on ? 'bg-adminprimary/10 border-adminprimary/50 text-adminprimary' : 'border-slate-200 text-slate-400'}`}>
                                    {name}
                                    {on && <span className="material-symbols-outlined text-xs">check_circle</span>}
                                </button>
                            )
                        })}
                    </div>
                </section>

                {/* ── Staff Page URLs ── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Staff Page URLs</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { label: 'レジページ', path: 'register' },
                            { label: 'キッチンページ', path: 'kitchen' },
                            { label: 'スタッフページ', path: 'staff' },
                        ].map(p => (
                            <div key={p.path} className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs font-bold text-slate-600 mb-1">{p.label}</p>
                                <p className="text-[11px] font-mono text-adminprimary break-all">qraku.com/{shop_id}/{p.path}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
