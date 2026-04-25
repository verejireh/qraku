/**
 * SettingView
 * マスターPIN保持者が見るSetting画面
 * - スタッフの出勤/退勤管理 (トグル + 確認ダイアログ)
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Users, Clock } from 'lucide-react'
import { StaffSidebar, StaffBottomNav } from '../components/StaffNav'

function Icon({ name, className = '' }) {
    return <span className={`material-symbols-outlined ${className}`} style={{ fontFamily: 'Material Symbols Outlined' }}>{name}</span>
}

export default function SettingView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const [staffMembers, setStaffMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const [confirmModal, setConfirmModal] = useState(null) // { member, targetDuty }
    const [storeInfo, setStoreInfo] = useState(null)
    const [now, setNow] = useState(new Date())

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30000)
        return () => clearInterval(t)
    }, [])

    const fetchStoreInfo = async () => {
        try { setStoreInfo((await axios.get(`/api/stores/${shop_id}`)).data) } catch (e) { console.error(e) }
    }

    const fetchStaff = async () => {
        try {
            const res = await axios.get(`/api/admin/stores/${shop_id}/staff-members`)
            setStaffMembers(Array.isArray(res.data) ? res.data : [])
        } catch { }
        setLoading(false)
    }

    useEffect(() => { 
        fetchStoreInfo()
        fetchStaff() 
    }, [shop_id])

    const handleToggleDuty = async () => {
        if (!confirmModal) return
        const { member, targetDuty } = confirmModal
        try {
            await axios.patch(`/api/admin/stores/${shop_id}/staff-members/${member.id}/duty`, {
                is_on_duty: targetDuty
            })
            fetchStaff()
        } catch (e) {
            alert('処理に失敗しました。')
        }
        setConfirmModal(null)
    }

    if (loading) {
        return (
            <div className="fixed inset-0 flex flex-col lg:flex-row bg-[#fcf8fb]">
                <StaffSidebar activePage="setting" />
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                </div>
                <StaffBottomNav activePage="setting" />
            </div>
        )
    }

    return (
        <div className="fixed inset-0 flex flex-col lg:flex-row bg-[#fcf8fb] text-[#1b1b1d] overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', 'Noto Sans JP', sans-serif" }}>
            <StaffSidebar activePage="setting" />
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {/* ═══ Header ═══ */}
                <header className="shrink-0 bg-white flex items-center justify-between px-5 h-14 border-b border-stone-100 z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(`/${shop_id}/staff`)}
                            className="text-[#b80035] hover:bg-rose-50 p-1.5 rounded-full transition-colors">
                            <Icon name="arrow_back" />
                        </button>
                        <h1 className="text-xl font-extrabold tracking-tight text-[#b80035] cursor-pointer active:opacity-60"
                            onClick={() => window.dispatchEvent(new Event('staff-nav-show'))}>
                            {storeInfo?.name || 'QRaku'} <span className="text-[10px] font-black text-[#b80035]/50 tracking-widest ml-1">SETTING</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-stone-400 hidden sm:block">
                            {now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                            &nbsp;{now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button onClick={fetchStaff} className="p-1.5 hover:bg-stone-50 rounded-full text-stone-400 transition-colors">
                            <Icon name="refresh" />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
                    <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <Users className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-bold text-[#1b1b1d]">スタッフ勤務管理</h2>
            </div>

            {staffMembers.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold">登録されたスタッフがいません</p>
                    <p className="text-xs mt-1">Admin画面でスタッフを追加してください。</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {staffMembers.map(m => (
                        <div key={m.id}
                            className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                                m.is_on_duty
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-white border-slate-100'
                            }`}>
                            {/* Status indicator */}
                            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                                m.is_on_duty ? 'bg-green-500 animate-pulse' : 'bg-slate-300'
                            }`} />

                            {/* Name + clock info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-[#1b1b1d] text-sm">{m.name}</p>
                                {m.is_on_duty && m.clock_in_at && (
                                    <p className="text-[10px] text-green-600 flex items-center gap-1 mt-0.5">
                                        <Clock className="w-3 h-3" />
                                        出勤: {new Date(m.clock_in_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>

                            {/* Status label */}
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                                m.is_on_duty
                                    ? 'bg-green-500 text-white'
                                    : 'bg-slate-200 text-slate-500'
                            }`}>
                                {m.is_on_duty ? '勤務中' : '退勤'}
                            </span>

                            {/* Toggle button */}
                            <button
                                onClick={() => setConfirmModal({ member: m, targetDuty: !m.is_on_duty })}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                    m.is_on_duty
                                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                                }`}>
                                {m.is_on_duty ? '退勤処理' : '出勤処理'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Confirm Modal */}
            {confirmModal && (
                <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setConfirmModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-[#1b1b1d] mb-2">
                            {confirmModal.targetDuty ? '出勤確認' : '退勤確認'}
                        </h3>
                        <p className="text-sm text-slate-600 mb-6">
                            <span className="font-bold">{confirmModal.member.name}</span>さんを
                            <span className={`font-bold ${confirmModal.targetDuty ? 'text-green-600' : 'text-red-500'}`}>
                                {confirmModal.targetDuty ? '出勤' : '退勤'}
                            </span>
                            にしますか？
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmModal(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-200 transition-all">
                                キャンセル
                            </button>
                            <button onClick={handleToggleDuty}
                                className={`flex-1 py-3 font-bold rounded-xl text-sm text-white transition-all ${
                                    confirmModal.targetDuty
                                        ? 'bg-green-600 hover:bg-green-500'
                                        : 'bg-red-500 hover:bg-red-400'
                                }`}>
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
            </div>
            </div>
            <StaffBottomNav activePage="setting" />
        </div>
    )
}
