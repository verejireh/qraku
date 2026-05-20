/**
 * SettingView
 * マスターPIN保持者が見るSetting画面
 * - Tab 1: スタッフ勤務管理
 * - Tab 2: 品切れ管理 (カテゴリ別)
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Users, Clock, ShoppingBag, Timer, Plus } from 'lucide-react'
import { StaffSidebar, StaffBottomNav } from '../components/StaffNav'
import adminApi from '../hooks/useAdminApi'

function Icon({ name, className = '' }) {
    return <span className={`material-symbols-outlined ${className}`} style={{ fontFamily: 'Material Symbols Outlined' }}>{name}</span>
}

// ── 品切れ管理タブ ────────────────────────────────────────────────────────────
function SoldOutTab({ shop_id }) {
    const [menus, setMenus] = useState([])
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(null) // menu_id being toggled

    const fetchMenus = async () => {
        try {
            const res = await axios.get(`/api/menus/${shop_id}`)
            const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
            setMenus(data.filter(m => m.is_active !== false))
        } catch (e) {
            console.error(e)
        }
        setLoading(false)
    }

    useEffect(() => { fetchMenus() }, [shop_id])

    const toggleAvailability = async (menu) => {
        setUpdating(menu.id)
        const newStatus = !menu.is_available
        setMenus(prev => prev.map(m => m.id === menu.id ? { ...m, is_available: newStatus } : m))
        try {
            await adminApi.patch(`/api/menus/${menu.id}/availability?is_available=${newStatus}`)
        } catch (e) {
            // rollback
            setMenus(prev => prev.map(m => m.id === menu.id ? { ...m, is_available: menu.is_available } : m))
            alert('更新に失敗しました。再試行してください。')
        }
        setUpdating(null)
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#b80035]/20 border-t-[#b80035] rounded-full animate-spin" />
        </div>
    )

    // カテゴリ別グループ化
    const grouped = menus.reduce((acc, m) => {
        const cat = m.category || 'その他'
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(m)
        return acc
    }, {})

    const soldOutCount = menus.filter(m => !m.is_available).length

    return (
        <div className="space-y-5">
            {/* 品切れカウント summary */}
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-stone-100 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-stone-500">
                    <ShoppingBag className="w-4 h-4" />
                    <span>全 {menus.length} 品</span>
                </div>
                <span className={`text-xs font-black px-3 py-1 rounded-full ${soldOutCount > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    品切れ {soldOutCount} 品
                </span>
            </div>

            {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden">
                    {/* カテゴリヘッダー */}
                    <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                        <span className="text-xs font-black text-stone-500 uppercase tracking-wider">{category}</span>
                        <span className="text-[10px] text-stone-400">{items.filter(m => !m.is_available).length > 0 ? `品切れ ${items.filter(m => !m.is_available).length}品` : `全品販売中`}</span>
                    </div>

                    {/* メニュー一覧 */}
                    <div className="divide-y divide-stone-50">
                        {items.map(menu => (
                            <div key={menu.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${!menu.is_available ? 'bg-red-50/40' : ''}`}>
                                {/* サムネイル */}
                                {menu.image_url && (
                                    <img src={menu.image_url} alt="" className={`w-10 h-10 rounded-lg object-cover flex-shrink-0 ${!menu.is_available ? 'grayscale opacity-50' : ''}`} />
                                )}

                                {/* 名前 + 価格 */}
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-bold truncate ${!menu.is_available ? 'text-stone-400' : 'text-[#1b1b1d]'}`}>
                                        {menu.name_jp || menu.name_ko || menu.name_en}
                                    </p>
                                    <p className="text-[11px] text-stone-400">¥{(menu.price || 0).toLocaleString()}</p>
                                </div>

                                {/* 재고 표시 + 품절 토글 */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {/* 今日の仕込み量 입력 */}
                                    <div className="flex flex-col items-end gap-0.5">
                                        {menu.stock_today_total != null && (
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                                (menu.stock_today_total - (menu.stock_today_sold || 0)) <= 0
                                                    ? 'bg-red-100 text-red-600'
                                                    : (menu.stock_today_total - (menu.stock_today_sold || 0)) <= 3
                                                        ? 'bg-orange-100 text-orange-600'
                                                        : 'bg-green-100 text-green-600'
                                            }`}>
                                                残 {Math.max(0, menu.stock_today_total - (menu.stock_today_sold || 0))}/{menu.stock_today_total}
                                            </span>
                                        )}
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                min="1"
                                                placeholder="仕込量"
                                                defaultValue={menu.stock_today_total ?? ''}
                                                onBlur={async e => {
                                                    const val = parseInt(e.target.value)
                                                    if (isNaN(val) && e.target.value !== '') return
                                                    const total = isNaN(val) ? null : val
                                                    try {
                                                        const qs = total != null ? `stock_today_total=${total}` : 'stock_today_total=0'
                                                        await adminApi.patch(`/api/menus/${menu.id}/stock?${qs}`)
                                                        setMenus(prev => prev.map(m => m.id === menu.id ? { ...m, stock_today_total: total } : m))
                                                    } catch {}
                                                }}
                                                className="w-16 text-xs text-center border border-stone-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-amber-400 bg-stone-50"
                                            />
                                            {menu.stock_today_sold > 0 && (
                                                <button
                                                    title="販売数リセット"
                                                    onClick={async () => {
                                                        try {
                                                            await adminApi.patch(`/api/menus/${menu.id}/stock?reset_sold=true`)
                                                            setMenus(prev => prev.map(m => m.id === menu.id ? { ...m, stock_today_sold: 0, is_available: true } : m))
                                                        } catch {}
                                                    }}
                                                    className="text-[10px] px-1.5 py-1 bg-blue-50 text-blue-500 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                                                >↺</button>
                                            )}
                                        </div>
                                    </div>
                                    {!menu.is_available && (
                                        <span className="text-[10px] font-black text-red-500 uppercase tracking-wider">SOLD OUT</span>
                                    )}
                                    <button
                                        disabled={updating === menu.id}
                                        onClick={() => toggleAvailability(menu)}
                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                                            menu.is_available ? 'bg-green-400' : 'bg-red-400'
                                        } ${updating === menu.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${menu.is_available ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {menus.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold">メニューがありません</p>
                </div>
            )}
        </div>
    )
}

// ── スタッフ勤務管理タブ ──────────────────────────────────────────────────────
function StaffDutyTab({ shop_id }) {
    const [staffMembers, setStaffMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const [confirmModal, setConfirmModal] = useState(null)

    const fetchStaff = async () => {
        try {
            const res = await axios.get(`/api/admin/stores/${shop_id}/staff-members`)
            setStaffMembers(Array.isArray(res.data) ? res.data : [])
        } catch { }
        setLoading(false)
    }

    useEffect(() => { fetchStaff() }, [shop_id])

    const handleToggleDuty = async () => {
        if (!confirmModal) return
        const { member, targetDuty } = confirmModal
        try {
            await axios.patch(`/api/admin/stores/${shop_id}/staff-members/${member.id}/duty`, {
                is_on_duty: targetDuty
            })
            fetchStaff()
        } catch {
            alert('処理に失敗しました。')
        }
        setConfirmModal(null)
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        </div>
    )

    return (
        <>
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
                                m.is_on_duty ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100'
                            }`}>
                            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${m.is_on_duty ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-[#1b1b1d] text-sm">{m.name}</p>
                                {m.is_on_duty && m.clock_in_at && (
                                    <p className="text-[10px] text-green-600 flex items-center gap-1 mt-0.5">
                                        <Clock className="w-3 h-3" />
                                        出勤: {new Date(m.clock_in_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${m.is_on_duty ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                {m.is_on_duty ? '勤務中' : '退勤'}
                            </span>
                            <button
                                onClick={() => setConfirmModal({ member: m, targetDuty: !m.is_on_duty })}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                    m.is_on_duty ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                                }`}>
                                {m.is_on_duty ? '退勤処理' : '出勤処理'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

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
                                    confirmModal.targetDuty ? 'bg-green-600 hover:bg-green-500' : 'bg-red-500 hover:bg-red-400'
                                }`}>
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

// ── 食べ放題セッション 管理タブ ──────────────────────────────────────────────
function fmtRemaining(seconds) {
    if (seconds <= 0) return '00:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function TabehoudaiTab({ shop_id }) {
    const [tables, setTables] = useState([])
    const [courses, setCourses] = useState([])
    const [activeSessions, setActiveSessions] = useState([])
    const [loading, setLoading] = useState(true)
    const [now, setNow] = useState(Date.now())
    const [startModal, setStartModal] = useState(null)  // { table } | null
    const [selectedCourseId, setSelectedCourseId] = useState(null)
    const [numPeople, setNumPeople] = useState(2)
    const [busy, setBusy] = useState(false)

    const fetchAll = async () => {
        try {
            const [tablesRes, coursesRes, sessionsRes] = await Promise.all([
                axios.get(`/api/stores/${shop_id}/tables`).catch(() => ({ data: [] })),
                adminApi.get(`/api/tabehoudai/courses/${shop_id}`).catch(() => ({ data: [] })),
                adminApi.get(`/api/tabehoudai/sessions/active/${shop_id}`).catch(() => ({ data: [] })),
            ])
            setTables(Array.isArray(tablesRes.data) ? tablesRes.data : [])
            setCourses(Array.isArray(coursesRes.data) ? coursesRes.data : [])
            setActiveSessions(Array.isArray(sessionsRes.data) ? sessionsRes.data : [])
        } catch (e) {
            console.error(e)
        }
        setLoading(false)
    }

    useEffect(() => { fetchAll() }, [shop_id])
    useEffect(() => {
        const refresh = setInterval(fetchAll, 30000)
        const tick = setInterval(() => setNow(Date.now()), 1000)
        return () => { clearInterval(refresh); clearInterval(tick) }
    }, [shop_id])

    const sessionByTable = activeSessions.reduce((acc, s) => {
        acc[s.table_id] = s
        return acc
    }, {})

    const openStart = (table) => {
        if (courses.length === 0) {
            alert('食べ放題コースが未登録です。Adminメニューページで「メニューグループ」から作成してください。')
            return
        }
        setSelectedCourseId(courses[0].id)
        setNumPeople(2)
        setStartModal({ table })
    }

    const startSession = async () => {
        if (!startModal || !selectedCourseId) return
        setBusy(true)
        try {
            await adminApi.post(`/api/tabehoudai/sessions/${shop_id}`, {
                table_id: startModal.table.id,
                group_id: selectedCourseId,
                num_people: numPeople,
            })
            await fetchAll()
            setStartModal(null)
        } catch (e) {
            alert(e.response?.data?.detail || '開始に失敗しました')
        }
        setBusy(false)
    }

    const endSession = async (s) => {
        if (!confirm(`テーブル ${s.table_id} のコースを終了しますか?`)) return
        try {
            await adminApi.post(`/api/tabehoudai/sessions/${shop_id}/${s.id}/end`)
            await fetchAll()
        } catch {
            alert('終了に失敗しました')
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#b80035]/20 border-t-[#b80035] rounded-full animate-spin" />
        </div>
    )

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-stone-100 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-stone-500">
                    <Timer className="w-4 h-4" />
                    <span>テーブル {tables.length} 卓 · 進行中 {activeSessions.length}</span>
                </div>
                <span className="text-[10px] text-stone-400">コース {courses.length} 種</span>
            </div>

            {tables.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                    <Timer className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-bold">テーブルがありません</p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tables.map(t => {
                    const s = sessionByTable[t.id]
                    if (s) {
                        const expires = new Date(s.expires_at).getTime()
                        const remaining = Math.max(0, Math.floor((expires - now) / 1000))
                        const isLastOrder = remaining > 0 && remaining <= s.last_order_minutes * 60
                        return (
                            <div key={t.id} className={`p-4 rounded-xl border-2 ${isLastOrder ? 'bg-amber-50 border-amber-300' : 'bg-rose-50 border-rose-200'}`}>
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <div className="text-xs font-black text-stone-500 uppercase tracking-wider">Table {t.table_number}</div>
                                        <div className="text-sm font-bold mt-0.5">{s.group_name}</div>
                                        <div className="text-[11px] text-stone-500 mt-0.5">{s.num_people}名 · ¥{(s.price_per_person * s.num_people).toLocaleString()}</div>
                                    </div>
                                    <div className={`text-right ${isLastOrder ? 'text-amber-600' : 'text-rose-600'}`}>
                                        <div className="text-[10px] font-black uppercase tracking-wider">残り</div>
                                        <div className="text-2xl font-black tabular-nums leading-none">{fmtRemaining(remaining)}</div>
                                    </div>
                                </div>
                                {isLastOrder && (
                                    <div className="text-[10px] font-black text-amber-600 mb-2 uppercase">⚠ ラストオーダー</div>
                                )}
                                <button onClick={() => endSession(s)}
                                    className="w-full py-2 bg-white border border-rose-300 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors">
                                    終了・精算
                                </button>
                            </div>
                        )
                    }
                    return (
                        <button key={t.id} onClick={() => openStart(t)}
                            className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-[#b80035] hover:bg-rose-50/30 transition-all text-left">
                            <div className="text-xs font-black text-stone-400 uppercase tracking-wider">Table {t.table_number}</div>
                            <div className="flex items-center gap-1 mt-2 text-stone-500">
                                <Plus className="w-4 h-4" />
                                <span className="text-xs font-bold">コース開始</span>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* 開始モーダル */}
            {startModal && (
                <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => !busy && setStartModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-1">テーブル {startModal.table.table_number}</h3>
                        <p className="text-xs text-stone-500 mb-4">食べ放題・飲み放題コースを開始</p>

                        <label className="text-xs font-bold text-stone-500 block mb-1.5">コース</label>
                        <div className="space-y-1.5 mb-4">
                            {courses.map(c => (
                                <button key={c.id} onClick={() => setSelectedCourseId(c.id)}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors text-left ${
                                        selectedCourseId === c.id ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:border-slate-300'
                                    }`}>
                                    <div>
                                        <div className="text-sm font-bold">{c.name}</div>
                                        <div className="text-[11px] text-stone-500">{c.duration_minutes}分 · {c.menu_ids.length}品</div>
                                    </div>
                                    <div className="text-sm font-black text-rose-600">¥{c.price_per_person.toLocaleString()}/人</div>
                                </button>
                            ))}
                        </div>

                        <label className="text-xs font-bold text-stone-500 block mb-1.5">人数</label>
                        <div className="flex items-center gap-3 mb-5">
                            <button onClick={() => setNumPeople(Math.max(1, numPeople - 1))}
                                className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">-</button>
                            <div className="flex-1 text-center text-2xl font-black tabular-nums">{numPeople}</div>
                            <button onClick={() => setNumPeople(numPeople + 1)}
                                className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">+</button>
                        </div>

                        {selectedCourseId && (
                            <div className="bg-rose-50 rounded-lg p-3 mb-4 text-center">
                                <div className="text-[10px] font-black text-rose-500 uppercase tracking-wider">合計</div>
                                <div className="text-2xl font-black text-rose-600">
                                    ¥{((courses.find(c => c.id === selectedCourseId)?.price_per_person || 0) * numPeople).toLocaleString()}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button onClick={() => setStartModal(null)} disabled={busy}
                                className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-200">
                                キャンセル
                            </button>
                            <button onClick={startSession} disabled={busy || !selectedCourseId}
                                className="flex-1 py-2.5 bg-rose-500 text-white font-bold rounded-lg text-sm hover:bg-rose-600 disabled:opacity-50">
                                {busy ? '...' : '開始'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── 毎日運営タブ ──────────────────────────────────────────────────────────────
function DailyOpsTab({ shop_id }) {
    const [store, setStore] = useState(null)
    const [loading, setLoading] = useState(true)
    const [openBusy, setOpenBusy] = useState(false)
    const [rescueBusy, setRescueBusy] = useState(false)
    const [showCloseConfirm, setShowCloseConfirm] = useState(false)

    const fetchStore = async () => {
        try {
            const res = await axios.get(`/api/stores/${shop_id}`)
            setStore(res.data?.data || res.data)
        } catch (e) {
            console.error(e)
        }
        setLoading(false)
    }

    useEffect(() => { fetchStore() }, [shop_id])

    const toggleOpen = async (newVal) => {
        setOpenBusy(true)
        try {
            await adminApi.patch(`/api/stores/${store.id}/business-status`, { is_open: newVal })
            setStore(prev => ({ ...prev, is_open: newVal }))
        } catch (e) {
            alert('変更に失敗しました: ' + (e.response?.data?.detail || e.message))
        }
        setOpenBusy(false)
        setShowCloseConfirm(false)
    }

    const toggleRescue = async () => {
        const newVal = !store.food_rescue_manual_active
        setRescueBusy(true)
        setStore(prev => ({ ...prev, food_rescue_manual_active: newVal }))
        try {
            await adminApi.patch(`/api/stores/${store.id}/food-rescue-status`, {
                food_rescue_manual_active: newVal
            })
        } catch (e) {
            setStore(prev => ({ ...prev, food_rescue_manual_active: !newVal }))
            alert('変更に失敗しました: ' + (e.response?.data?.detail || e.message))
        }
        setRescueBusy(false)
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#b80035]/20 border-t-[#b80035] rounded-full animate-spin" />
        </div>
    )
    if (!store) return null

    const isAutoMode = store.food_rescue_mode === 'auto'
    const rescueDisabled = !store.food_rescue_active || isAutoMode

    return (
        <>
            <div className="space-y-4">
                {/* ── 営業 ON/OFF ─────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-2">
                        <Icon name="storefront" className="text-[18px] text-stone-500" />
                        <span className="text-xs font-black text-stone-500 uppercase tracking-wider">営業ステータス</span>
                    </div>
                    <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="font-bold text-[#1b1b1d]">
                                    {store.is_open ? '現在 営業中' : '現在 閉店中'}
                                </p>
                                <p className="text-xs text-stone-400 mt-0.5">
                                    {store.is_open
                                        ? 'お客様がカートに追加・注文できます'
                                        : '注文受付が停止中です'}
                                </p>
                            </div>
                            <span className={`text-[11px] font-black px-3 py-1.5 rounded-full ${
                                store.is_open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                            }`}>
                                {store.is_open ? 'OPEN' : 'CLOSED'}
                            </span>
                        </div>
                        {store.is_open ? (
                            <button
                                onClick={() => setShowCloseConfirm(true)}
                                disabled={openBusy}
                                className="w-full py-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-base transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Icon name="store" className="!text-xl" />
                                {openBusy ? '処理中...' : '営業を終了する'}
                            </button>
                        ) : (
                            <button
                                onClick={() => toggleOpen(true)}
                                disabled={openBusy}
                                className="w-full py-4 rounded-xl bg-green-500 hover:bg-green-600 text-white font-black text-base transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Icon name="play_arrow" className="!text-xl" />
                                {openBusy ? '処理中...' : '営業を開始する'}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── マグカル割引 (フードレスキュー) ─────────── */}
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-2">
                        <span className="text-[18px]">🔥</span>
                        <span className="text-xs font-black text-stone-500 uppercase tracking-wider">マグカル割引 (フードレスキュー)</span>
                    </div>
                    <div className="p-5">
                        {!store.food_rescue_active ? (
                            <div className="text-center space-y-3">
                                <p className="text-sm text-stone-500">フードレスキューが無効です</p>
                                <p className="text-xs text-stone-400">先に管理画面で有効にしてください</p>
                                <a href={`/${shop_id}/admin`}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-lg text-xs transition-colors">
                                    <Icon name="settings" className="!text-base" />Admin設定へ
                                </a>
                            </div>
                        ) : isAutoMode ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-stone-400">自動モード有効中</p>
                                        <p className="text-xs text-stone-400 mt-0.5">
                                            閉店 {store.food_rescue_auto_minutes}分前に自動でONになります
                                        </p>
                                    </div>
                                    <span className="text-[11px] font-black px-3 py-1.5 rounded-full bg-stone-100 text-stone-400">AUTO</span>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                                    自動モードは手動操作できません。<br />
                                    変更するには{' '}
                                    <a href={`/${shop_id}/admin`} className="font-bold underline">Admin設定</a>
                                    {' '}でモードを切り替えてください。
                                </div>
                                <button
                                    disabled
                                    className="w-full py-4 rounded-xl bg-stone-100 text-stone-400 font-black text-base cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Icon name="lock" className="!text-xl" />
                                    手動操作 無効 (自動モード)
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-[#1b1b1d]">
                                            {store.food_rescue_manual_active ? '割引 実施中' : '割引 停止中'}
                                        </p>
                                        <p className="text-xs text-stone-400 mt-0.5">
                                            {store.food_rescue_manual_active
                                                ? '発見ページに「マグカル割引」が表示されています'
                                                : 'タップしてタイムセールを開始'}
                                        </p>
                                    </div>
                                    <span className={`text-[11px] font-black px-3 py-1.5 rounded-full ${
                                        store.food_rescue_manual_active
                                            ? 'bg-orange-100 text-orange-700'
                                            : 'bg-stone-100 text-stone-400'
                                    }`}>
                                        {store.food_rescue_manual_active ? 'ON' : 'OFF'}
                                    </span>
                                </div>
                                <button
                                    onClick={toggleRescue}
                                    disabled={rescueBusy}
                                    className={`w-full py-4 rounded-xl font-black text-base transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2 ${
                                        store.food_rescue_manual_active
                                            ? 'bg-stone-400 hover:bg-stone-500 text-white'
                                            : 'bg-orange-500 hover:bg-orange-600 text-white'
                                    }`}
                                >
                                    <span className="text-xl">🔥</span>
                                    {rescueBusy ? '処理中...'
                                        : store.food_rescue_manual_active ? '割引を停止する' : '割引を開始する'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── 営業終了 確認モーダル ── */}
            {showCloseConfirm && (
                <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowCloseConfirm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                                <Icon name="warning" className="!text-3xl text-amber-500" />
                            </div>
                            <div>
                                <h3 className="font-black text-lg text-stone-800">営業を終了しますか？</h3>
                                <p className="text-xs text-stone-500 mt-0.5">本当によろしいですか？</p>
                            </div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed mb-5">
                            <ul className="list-disc list-inside space-y-1">
                                <li>テイクアウトの注文受付が停止します</li>
                                <li>お客様の「カートに追加」ボタンが無効になります</li>
                                <li>後で「営業開始」を押せば再開できます</li>
                            </ul>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowCloseConfirm(false)}
                                className="flex-1 py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm transition-colors">
                                キャンセル
                            </button>
                            <button onClick={() => toggleOpen(false)} disabled={openBusy}
                                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors shadow-md disabled:opacity-50">
                                {openBusy ? '処理中...' : '営業終了'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

// ── メインコンポーネント ───────────────────────────────────────────────────────
const TABS = [
    { key: 'daily', label: '毎日運営', icon: 'storefront' },
    { key: 'staff', label: '勤務管理', icon: 'badge' },
    { key: 'soldout', label: '品切れ管理', icon: 'remove_shopping_cart' },
    { key: 'tabehoudai', label: '食べ放題', icon: 'restaurant' },
]

export default function SettingView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState('daily')
    const [storeInfo, setStoreInfo] = useState(null)
    const [now, setNow] = useState(new Date())

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30000)
        return () => clearInterval(t)
    }, [])

    useEffect(() => {
        axios.get(`/api/stores/${shop_id}`)
            .then(res => setStoreInfo(res.data?.data || res.data))
            .catch(() => {})
    }, [shop_id])

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
                    </div>
                </header>

                {/* ═══ Tab Bar ═══ */}
                <div className="shrink-0 bg-white border-b border-stone-100 px-4 flex gap-1">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
                                activeTab === tab.key
                                    ? 'border-[#b80035] text-[#b80035]'
                                    : 'border-transparent text-stone-400 hover:text-stone-600'
                            }`}
                        >
                            <Icon name={tab.icon} className="text-[18px]" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ═══ Content ═══ */}
                <div className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
                    <div className="max-w-2xl mx-auto">
                        {activeTab === 'daily' && <DailyOpsTab shop_id={shop_id} />}
                        {activeTab === 'staff' && <StaffDutyTab shop_id={shop_id} />}
                        {activeTab === 'soldout' && <SoldOutTab shop_id={shop_id} />}
                        {activeTab === 'tabehoudai' && <TabehoudaiTab shop_id={shop_id} />}
                    </div>
                </div>

            </div>
            <StaffBottomNav activePage="setting" />
        </div>
    )
}
