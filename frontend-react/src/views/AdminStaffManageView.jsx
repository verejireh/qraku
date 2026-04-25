import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { AdminNavBar } from './AdminView'

export default function AdminStaffManageView() {
    const { shop_id } = useParams()

    const [storeData, setStoreData] = useState(null)
    const [loading, setLoading] = useState(true)

    // Master PIN state
    const [hasPin, setHasPin] = useState(false)
    const [maskedPin, setMaskedPin] = useState(null)
    const [isEditingPin, setIsEditingPin] = useState(false)
    const [currentPinInput, setCurrentPinInput] = useState('')
    const [newPinInput, setNewPinInput] = useState('')
    const [pinSaving, setPinSaving] = useState(false)

    // Staff state
    const [staffMembers, setStaffMembers] = useState([])
    const [newStaffName, setNewStaffName] = useState('')
    const [newStaffPin, setNewStaffPin] = useState('')

    const fetchStaffData = async () => {
        try {
            const [pinRes, staffRes] = await Promise.all([
                axios.get(`/api/admin/stores/${shop_id}/master-pin`).catch(() => null),
                axios.get(`/api/admin/stores/${shop_id}/staff-members`).catch(() => ({ data: [] })),
            ])
            if (pinRes?.data) {
                setHasPin(pinRes.data.has_pin)
                setMaskedPin(pinRes.data.masked_pin)
            }
            setStaffMembers(Array.isArray(staffRes.data) ? staffRes.data : (staffRes.data?.items || []))
        } catch { }
    }

    useEffect(() => {
        async function load() {
            try {
                const res = await axios.get(`/api/stores/${shop_id}`)
                setStoreData(res.data?.data || res.data)
            } catch { }
            await fetchStaffData()
            setLoading(false)
        }
        load()
    }, [shop_id])

    const handlePinSave = async () => {
        if (newPinInput.length < 6) { alert('6桁以上の数字を入力してください。'); return }
        if (hasPin && !currentPinInput) { alert('現在のPINを入力してください。'); return }
        setPinSaving(true)
        try {
            const payload = { master_pin: newPinInput }
            if (hasPin) payload.current_pin = currentPinInput
            await axios.patch(`/api/admin/stores/${shop_id}/master-pin`, payload)
            alert('✅ マスターPINを更新しました。')
            setIsEditingPin(false)
            setCurrentPinInput('')
            setNewPinInput('')
            await fetchStaffData()
        } catch (e) {
            alert(e.response?.data?.detail || 'エラーが発生しました。')
        } finally {
            setPinSaving(false)
        }
    }

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 font-display">
            <AdminNavBar storeData={storeData} shop_id={shop_id} />

            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-500">badge</span>
                    スタッフ管理
                </h2>

                {/* Master PIN */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 mb-6">
                        <label className="text-xs font-bold text-blue-700 block mb-3">🔑 マスターPIN（Register/Kitchen/Staff/Setting全アクセス）</label>

                        {!isEditingPin ? (
                            /* ── 표시 모드 ── */
                            <div className="flex items-center gap-3">
                                {hasPin ? (
                                    <>
                                        <div className="flex-1 px-4 py-2.5 bg-white border border-blue-200 rounded-xl font-mono tracking-[0.3em] text-center text-lg text-slate-600 select-none">
                                            {maskedPin || '********'}
                                        </div>
                                        <button onClick={() => setIsEditingPin(true)}
                                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-sm">edit</span>
                                            修正
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <p className="flex-1 text-sm text-slate-400 italic">マスターPINが設定されていません</p>
                                        <button onClick={() => setIsEditingPin(true)}
                                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-sm">add</span>
                                            設定する
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : (
                            /* ── 수정 모드 ── */
                            <div className="space-y-3">
                                {hasPin && (
                                    <div>
                                        <label className="text-[10px] text-blue-500 block mb-1">現在のPIN</label>
                                        <input type="password" inputMode="numeric" value={currentPinInput}
                                            onChange={e => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                                            placeholder="現在のPINを入力" maxLength={20}
                                            className="w-full px-3 py-2.5 text-sm border border-blue-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono tracking-widest text-center" />
                                    </div>
                                )}
                                <div>
                                    <label className="text-[10px] text-blue-500 block mb-1">新しいPIN（6桁以上の数字）</label>
                                    <input type="text" inputMode="numeric" value={newPinInput}
                                        onChange={e => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                                        placeholder="6桁以上の数字" maxLength={20}
                                        className="w-full px-3 py-2.5 text-sm border border-blue-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono tracking-widest text-center" />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => { setIsEditingPin(false); setCurrentPinInput(''); setNewPinInput('') }}
                                        className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                                        キャンセル
                                    </button>
                                    <button onClick={handlePinSave}
                                        disabled={newPinInput.length < 6 || (hasPin && !currentPinInput) || pinSaving}
                                        className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl disabled:opacity-40 transition-all flex items-center gap-1.5">
                                        {pinSaving ? (
                                            <div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                                        ) : (
                                            <span className="material-symbols-outlined text-sm">check</span>
                                        )}
                                        保存
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Staff List */}
                    <label className="text-xs font-bold text-slate-700 block mb-3">👤 スタッフ一覧</label>
                    <div className="space-y-2 mb-4">
                        {staffMembers.map(m => (
                            <div key={m.id} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                                <div className={`w-2.5 h-2.5 rounded-full ${m.is_on_duty ? 'bg-green-500' : 'bg-slate-300'}`} />
                                <span className="flex-1 text-sm font-bold">{m.name}</span>
                                <span className="text-xs text-slate-400 font-mono">PIN: {m.pin}</span>
                                <button onClick={async () => {
                                    const newPin = prompt(`${m.name}さんの新しいPIN (4桁)`, m.pin)
                                    if (!newPin || newPin === m.pin) return
                                    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) { alert('4桁の数字を入力してください。'); return }
                                    try {
                                        await axios.patch(`/api/admin/stores/${shop_id}/staff-members/${m.id}`, { pin: newPin })
                                        fetchStaffData()
                                    } catch (e) { alert(e.response?.data?.detail || 'エラー') }
                                }}
                                    className="text-[10px] text-blue-500 hover:text-blue-700 font-bold">PIN変更</button>
                                <button onClick={async () => {
                                    if (!confirm(`${m.name}さんを削除しますか？`)) return
                                    try {
                                        await axios.delete(`/api/admin/stores/${shop_id}/staff-members/${m.id}`)
                                        fetchStaffData()
                                    } catch { alert('削除に失敗しました。') }
                                }}
                                    className="text-[10px] text-red-400 hover:text-red-600 font-bold">削除</button>
                            </div>
                        ))}
                        {staffMembers.length === 0 && <p className="text-xs text-slate-400 italic text-center py-6">登録されたスタッフはいません</p>}
                    </div>

                    {/* Add Staff */}
                    <div className="flex gap-2 items-end pt-4 border-t border-slate-100">
                        <div className="flex-1">
                            <label className="text-[10px] text-slate-500 block mb-1">名前</label>
                            <input type="text" value={newStaffName} onChange={e => setNewStaffName(e.target.value)}
                                placeholder="例: 田中" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400" />
                        </div>
                        <div className="w-28">
                            <label className="text-[10px] text-slate-500 block mb-1">PIN (4桁)</label>
                            <input type="text" inputMode="numeric" value={newStaffPin}
                                onChange={e => setNewStaffPin(e.target.value.replace(/\D/g, ''))}
                                placeholder="1234" maxLength={4}
                                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 font-mono text-center" />
                        </div>
                        <button onClick={async () => {
                            if (!newStaffName.trim()) { alert('名前を入力してください。'); return }
                            if (newStaffPin.length !== 4) { alert('4桁のPINを入力してください。'); return }
                            try {
                                await axios.post(`/api/admin/stores/${shop_id}/staff-members`, { name: newStaffName.trim(), pin: newStaffPin })
                                setNewStaffName(''); setNewStaffPin('')
                                fetchStaffData()
                            } catch (e) { alert(e.response?.data?.detail || 'エラー') }
                        }}
                            disabled={!newStaffName.trim() || newStaffPin.length !== 4}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl disabled:opacity-40 transition-all whitespace-nowrap">
                            追加
                        </button>
                    </div>
                </section>
            </div>
        </div>
    )
}
