import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { AdminNavBar } from './AdminView'
import adminApi from '../hooks/useAdminApi'

// ── 날짜 유틸 헬퍼 ───────────────────────────────────────────────────
function today() {
    const d = new Date()
    return d.toLocaleDateString('sv-SE') // "2026-05-01" 포맷
}
function firstOfMonth() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function lastOfMonth() {
    const d = new Date()
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return last.toLocaleDateString('sv-SE')
}
// 분 단위 → "X時間Y分" 포맷 변환
function fmtMinutes(min) {
    if (!min && min !== 0) return '-'
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}時間${m > 0 ? m + '分' : ''}` : `${m}分`
}

export default function AdminStaffManageView() {
    const { shop_id } = useParams()
    const [storeData, setStoreData] = useState(null)
    const [loading, setLoading] = useState(true)

    // マスターPIN state
    const [hasPin, setHasPin] = useState(false)
    const [maskedPin, setMaskedPin] = useState(null)
    const [isEditingPin, setIsEditingPin] = useState(false)
    const [currentPinInput, setCurrentPinInput] = useState('')
    const [newPinInput, setNewPinInput] = useState('')
    const [pinSaving, setPinSaving] = useState(false)

    // スタッフ state
    const [staffMembers, setStaffMembers] = useState([])
    const [newStaffName, setNewStaffName] = useState('')
    const [newStaffPin, setNewStaffPin] = useState('')

    // 勤怠 state
    const [activeTab, setActiveTab] = useState('staff') // 'staff' | 'attendance'
    const [attendancePeriod, setAttendancePeriod] = useState('month') // 'today' | 'month' | 'custom'
    const [customFrom, setCustomFrom] = useState(firstOfMonth())
    const [customTo, setCustomTo] = useState(today())
    const [filterStaffId, setFilterStaffId] = useState('all')
    const [attendanceRecords, setAttendanceRecords] = useState([])
    const [attendanceLoading, setAttendanceLoading] = useState(false)

    // 스태프 및 PIN 데이터 로드
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

    // 근태 기록 조회 (기간 / 스태프 필터 적용)
    const fetchAttendance = async () => {
        setAttendanceLoading(true)
        try {
            let dateFrom, dateTo
            if (attendancePeriod === 'today') {
                dateFrom = dateTo = today()
            } else if (attendancePeriod === 'month') {
                dateFrom = firstOfMonth()
                dateTo = lastOfMonth()
            } else {
                // custom: 사용자가 직접 지정한 기간
                dateFrom = customFrom
                dateTo = customTo
            }
            const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
            if (filterStaffId !== 'all') params.set('staff_id', filterStaffId)
            const res = await adminApi.get(`/api/admin/stores/${shop_id}/staff-attendance?${params}`)
            setAttendanceRecords(Array.isArray(res.data) ? res.data : [])
        } catch (e) {
            console.error(e)
        }
        setAttendanceLoading(false)
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

    // 탭 전환 또는 필터 변경 시 근태 데이터 재조회
    useEffect(() => {
        if (activeTab === 'attendance') fetchAttendance()
    }, [activeTab, attendancePeriod, filterStaffId, shop_id])

    // マスターPIN 저장 처리
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

    // 스태프별 합계 통계 계산 (근태 탭에서 사용)
    const staffSummary = useMemo(() => {
        const map = {}
        attendanceRecords.forEach(r => {
            if (!map[r.staff_id]) map[r.staff_id] = { staff_name: r.staff_name, total_minutes: 0, days: new Set(), sessions: 0 }
            map[r.staff_id].total_minutes += r.duration_minutes || 0
            map[r.staff_id].days.add(r.work_date)
            map[r.staff_id].sessions += 1
        })
        return Object.entries(map).map(([id, v]) => ({ staff_id: id, ...v, days: v.days.size }))
    }, [attendanceRecords])

    // 날짜별 그룹핑 (일별 상세 표시용)
    const recordsByDate = useMemo(() => {
        const map = {}
        attendanceRecords.forEach(r => {
            if (!map[r.work_date]) map[r.work_date] = []
            map[r.work_date].push(r)
        })
        return map
    }, [attendanceRecords])

    if (loading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
    )

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 font-display">
            <AdminNavBar storeData={storeData} shop_id={shop_id} />

            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-500">badge</span>
                    スタッフ管理
                </h2>

                {/* ── 탭 전환 버튼 ── */}
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                    {[
                        { key: 'staff', label: 'スタッフ一覧', icon: 'people' },
                        { key: 'attendance', label: '勤怠記録', icon: 'schedule' },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                activeTab === tab.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}>
                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ═══════════════════════════════════════════════════════
                    スタッフ一覧 탭
                ═══════════════════════════════════════════════════════ */}
                {activeTab === 'staff' && (
                    <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        {/* マスターPIN 관리 섹션 */}
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
                                                <span className="material-symbols-outlined text-sm">edit</span>修正
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <p className="flex-1 text-sm text-slate-400 italic">マスターPINが設定されていません</p>
                                            <button onClick={() => setIsEditingPin(true)}
                                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-sm">add</span>設定する
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
                                            {pinSaving ? <div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> : <span className="material-symbols-outlined text-sm">check</span>}
                                            保存
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* スタッフ一覧 */}
                        <label className="text-xs font-bold text-slate-700 block mb-3">👤 スタッフ一覧</label>
                        <div className="space-y-2 mb-4">
                            {staffMembers.map(m => (
                                <div key={m.id} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                                    {/* 출근 여부 인디케이터 */}
                                    <div className={`w-2.5 h-2.5 rounded-full ${m.is_on_duty ? 'bg-green-500' : 'bg-slate-300'}`} />
                                    <span className="flex-1 text-sm font-bold">{m.name}</span>
                                    <span className="text-xs text-slate-400 font-mono">PIN: {m.pin}</span>
                                    {/* 출근 상태 뱃지 */}
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.is_on_duty ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                                        {m.is_on_duty ? '勤務中' : '退勤'}
                                    </span>
                                    {/* PIN 변경 버튼 */}
                                    <button onClick={async () => {
                                        const newPin = prompt(`${m.name}さんの新しいPIN (4桁)`, m.pin)
                                        if (!newPin || newPin === m.pin) return
                                        if (newPin.length !== 4 || !/^\d+$/.test(newPin)) { alert('4桁の数字を入力してください。'); return }
                                        try {
                                            await axios.patch(`/api/admin/stores/${shop_id}/staff-members/${m.id}`, { pin: newPin })
                                            fetchStaffData()
                                        } catch (e) { alert(e.response?.data?.detail || 'エラー') }
                                    }} className="text-[10px] text-blue-500 hover:text-blue-700 font-bold">PIN変更</button>
                                    {/* 삭제 버튼 */}
                                    <button onClick={async () => {
                                        if (!confirm(`${m.name}さんを削除しますか？`)) return
                                        try {
                                            await axios.delete(`/api/admin/stores/${shop_id}/staff-members/${m.id}`)
                                            fetchStaffData()
                                        } catch { alert('削除に失敗しました。') }
                                    }} className="text-[10px] text-red-400 hover:text-red-600 font-bold">削除</button>
                                </div>
                            ))}
                            {staffMembers.length === 0 && (
                                <p className="text-xs text-slate-400 italic text-center py-6">登録されたスタッフはいません</p>
                            )}
                        </div>

                        {/* スタッフ 추가 폼 */}
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
                )}

                {/* ═══════════════════════════════════════════════════════
                    勤怠記録 탭
                ═══════════════════════════════════════════════════════ */}
                {activeTab === 'attendance' && (
                    <div className="space-y-4">
                        {/* 필터 바 */}
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 flex flex-wrap gap-3 items-end">
                            {/* 기간 선택 */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 block mb-1">期間</label>
                                <div className="flex gap-1">
                                    {[
                                        { key: 'today', label: '今日' },
                                        { key: 'month', label: '今月' },
                                        { key: 'custom', label: '期間指定' },
                                    ].map(p => (
                                        <button key={p.key} onClick={() => setAttendancePeriod(p.key)}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                                attendancePeriod === p.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}>
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 커스텀 기간 입력 (기간指定 선택 시만 표시) */}
                            {attendancePeriod === 'custom' && (
                                <div className="flex items-end gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 block mb-1">開始</label>
                                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                                    </div>
                                    <span className="text-slate-400 text-xs mb-2">〜</span>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 block mb-1">終了</label>
                                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                                    </div>
                                    <button onClick={fetchAttendance}
                                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
                                        検索
                                    </button>
                                </div>
                            )}

                            {/* 스태프 필터 */}
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 block mb-1">スタッフ</label>
                                <select value={filterStaffId} onChange={e => setFilterStaffId(e.target.value)}
                                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
                                    <option value="all">全員</option>
                                    {staffMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* 로딩 중 스피너 */}
                        {attendanceLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="animate-spin w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full" />
                            </div>
                        ) : (
                            <>
                                {/* ── 스태프별 합계 사마리 ── */}
                                {staffSummary.length > 0 && (
                                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-indigo-500 text-lg">summarize</span>
                                            <h3 className="font-black text-slate-900 text-sm">スタッフ別サマリー</h3>
                                        </div>
                                        <div className="divide-y divide-slate-50">
                                            {staffSummary.map(s => (
                                                <div key={s.staff_id} className="flex items-center gap-4 px-5 py-3">
                                                    {/* 스태프 이니셜 아바타 */}
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-indigo-600 font-black text-sm">{s.staff_name[0]}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="font-bold text-slate-900 text-sm">{s.staff_name}</p>
                                                        <p className="text-[11px] text-slate-400">{s.days}日出勤 · {s.sessions}回</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-black text-indigo-600 text-base">{fmtMinutes(s.total_minutes)}</p>
                                                        <p className="text-[10px] text-slate-400">合計勤務時間</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── 날짜별 상세 기록 ── */}
                                {Object.keys(recordsByDate).length === 0 ? (
                                    <div className="text-center py-16 text-slate-400">
                                        <span className="material-symbols-outlined text-4xl block mb-2 opacity-30">schedule</span>
                                        <p className="text-sm font-bold">勤怠記録がありません</p>
                                        <p className="text-xs mt-1">Setting画面で出勤処理をすると記録されます</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {Object.entries(recordsByDate).map(([date, records]) => {
                                            // 해당 날짜 총 근무 시간 합산 (진행 중 기록 제외)
                                            const dayTotal = records.reduce((s, r) => s + (r.duration_minutes || 0), 0)
                                            return (
                                                <div key={date} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                                                    {/* 날짜 헤더 */}
                                                    <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                                        <span className="font-black text-slate-700 text-sm">{date}</span>
                                                        <span className="text-xs text-slate-400">合計 {fmtMinutes(dayTotal)}</span>
                                                    </div>
                                                    {/* 해당 날짜 근태 행 */}
                                                    <div className="divide-y divide-slate-50">
                                                        {records.map(r => (
                                                            <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                                                                {/* 스태프 이니셜 */}
                                                                <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                                                    <span className="text-indigo-500 font-black text-xs">{r.staff_name[0]}</span>
                                                                </div>
                                                                <span className="flex-1 text-sm font-bold text-slate-800">{r.staff_name}</span>
                                                                {/* 출근 시각 */}
                                                                <div className="text-xs text-slate-500 flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[14px] text-green-500">login</span>
                                                                    {r.clock_in || '-'}
                                                                </div>
                                                                <span className="text-slate-300 text-xs">→</span>
                                                                {/* 퇴근 시각 또는 勤務中 표시 */}
                                                                <div className="text-xs text-slate-500 flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[14px] text-red-400">logout</span>
                                                                    {r.is_open
                                                                        ? <span className="text-orange-500 font-bold">勤務中</span>
                                                                        : (r.clock_out || '-')}
                                                                </div>
                                                                {/* 근무 시간 뱃지 */}
                                                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ml-1 ${
                                                                    r.is_open ? 'bg-orange-100 text-orange-600' : 'bg-indigo-50 text-indigo-600'
                                                                }`}>
                                                                    {r.is_open ? '勤務中' : fmtMinutes(r.duration_minutes)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
