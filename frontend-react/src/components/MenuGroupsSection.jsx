/**
 * MenuGroupsSection
 * MenuManagementView에 삽입되는 메뉴 그룹 관리 섹션.
 * - TIME_WINDOW (런치/디너 시간대 자동)
 * - COURSE (食べ放題/飲み放題)
 * - MANUAL (수동 토글)
 */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import adminApi from '../hooks/useAdminApi'
import { currencyHelpers } from '../config/currency'

// 숫자 입력 파싱 — 빈 값/비숫자만 fallback 으로, 유효한 0 은 그대로 둔다
// (`parseInt(v) || fallback` 은 0 을 fallback 으로 잘못 바꿈).
const parseIntOr = (v, fallback) => {
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? fallback : n
}

const WEEKDAYS = [
    { key: 'mon', label: '月' },
    { key: 'tue', label: '火' },
    { key: 'wed', label: '水' },
    { key: 'thu', label: '木' },
    { key: 'fri', label: '金' },
    { key: 'sat', label: '土' },
    { key: 'sun', label: '日' },
]

const GROUP_TYPES = [
    {
        key: 'TIME_WINDOW',
        label: 'ランチ・ディナー',
        sublabel: '時間帯で自動切替',
        icon: 'schedule',
        color: 'amber',
        desc: '指定した時間帯・曜日に自動でメニューを表示します。時間外は非表示になります。',
        example: '例）ランチメニューは 11:00〜15:00 のみ表示、ディナーは 17:00〜 表示',
        steps: ['グループ名を入力（例：ランチセット）', '開始・終了時刻を設定', '適用する曜日を選択（未選択=毎日）', 'グループに含めるメニューをチェック'],
    },
    {
        key: 'COURSE',
        label: '食べ放題・飲み放題',
        sublabel: 'コース制 時間制限あり',
        icon: 'restaurant',
        color: 'rose',
        desc: 'スタッフがテーブルごとにコースを開始します。制限時間内は対象メニューが注文し放題（¥0）になり、レジで人数×コース料金を精算します。',
        example: '例）90分食べ放題 ¥2,980/人・飲み放題 ¥1,500/人',
        steps: ['グループ名を入力（例：90分食べ放題）', '1人あたり料金・時間・ラストオーダーを設定', '食べ放題 / 飲み放題 / 両方 を選択', 'グループに含めるメニューをチェック', 'スタッフページ「食べ放題」タブからテーブルごとに開始'],
    },
    {
        key: 'MANUAL',
        label: '手動切替',
        sublabel: 'ON/OFFで随時切替',
        icon: 'toggle_on',
        color: 'sky',
        desc: '管理者がON/OFFを手動で切り替えて、メニューの表示・非表示を即時コントロールします。時間に関係なく、必要なときだけ表示したいメニューに最適です。',
        example: '例）季節限定メニュー・イベントメニュー・本日のおすすめ',
        steps: ['グループ名を入力（例：季節限定メニュー）', 'グループに含めるメニューをチェック', 'このページで有効/無効を切り替えるだけでOK'],
    },
]

function emptyForm() {
    return {
        name: '',
        group_type: 'TIME_WINDOW',
        active_from: '11:00',
        active_to: '15:00',
        weekdays: '',
        price_per_person: 0,
        duration_minutes: 90,
        last_order_minutes: 10,
        course_type: 'food',
        is_active: true,
        sort_order: 0,
    }
}

// Portal wrapper — renders children into document.body to escape overflow/backdrop-blur stacking contexts
function Portal({ children }) {
    return createPortal(children, document.body)
}

export default function MenuGroupsSection({ shop_id, allMenus = [], store = null }) {
    const cur = currencyHelpers(store)
    const [expanded, setExpanded] = useState(false)
    const [groups, setGroups] = useState([])
    const [loading, setLoading] = useState(false)
    const [editingGroup, setEditingGroup] = useState(null) // null | { ...form, id?, menu_ids }
    const [saving, setSaving] = useState(false)
    const [showHelp, setShowHelp] = useState(false)

    const fetchGroups = async () => {
        setLoading(true)
        try {
            const res = await adminApi.get(`/api/menu-groups/${shop_id}`)
            setGroups(Array.isArray(res.data) ? res.data : [])
        } catch (e) {
            console.error('Failed to fetch menu groups', e)
        }
        setLoading(false)
    }

    useEffect(() => {
        if (expanded && shop_id) fetchGroups()
    }, [expanded, shop_id])

    const openCreate = () => {
        setEditingGroup({ ...emptyForm(), menu_ids: [] })
    }

    const openEdit = (g) => {
        setEditingGroup({
            id: g.id,
            name: g.name,
            group_type: g.group_type,
            active_from: g.active_from || '11:00',
            active_to: g.active_to || '15:00',
            weekdays: g.weekdays || '',
            price_per_person: cur.toMajorString(g.price_per_person || 0),
            duration_minutes: g.duration_minutes || 90,
            last_order_minutes: g.last_order_minutes || 10,
            course_type: g.course_type || 'food',
            is_active: g.is_active !== false,
            sort_order: g.sort_order || 0,
            menu_ids: g.menu_ids || [],
        })
    }

    const closeModal = () => setEditingGroup(null)

    const saveGroup = async () => {
        if (!editingGroup.name.trim()) {
            alert('グループ名を入力してください。')
            return
        }
        // COURSE 관계 검증 — 서버 422 가 영어 원문으로 노출되기 전에 친화적 안내
        if (editingGroup.group_type === 'COURSE') {
            if (editingGroup.duration_minutes < 1) {
                alert('制限時間は1分以上で入力してください。')
                return
            }
            if (editingGroup.last_order_minutes >= editingGroup.duration_minutes) {
                alert('ラストオーダーは制限時間より短く設定してください。')
                return
            }
        }
        setSaving(true)
        try {
            const payload = {
                name: editingGroup.name.trim(),
                group_type: editingGroup.group_type,
                active_from: editingGroup.group_type === 'TIME_WINDOW' ? editingGroup.active_from : null,
                active_to: editingGroup.group_type === 'TIME_WINDOW' ? editingGroup.active_to : null,
                weekdays: editingGroup.group_type === 'TIME_WINDOW' ? (editingGroup.weekdays || null) : null,
                price_per_person: editingGroup.group_type === 'COURSE' ? cur.toMinorUnits(editingGroup.price_per_person) : 0,
                duration_minutes: editingGroup.group_type === 'COURSE' ? editingGroup.duration_minutes : 90,
                last_order_minutes: editingGroup.group_type === 'COURSE' ? editingGroup.last_order_minutes : 10,
                course_type: editingGroup.group_type === 'COURSE' ? editingGroup.course_type : null,
                is_active: editingGroup.is_active,
                sort_order: editingGroup.sort_order,
            }

            let groupId = editingGroup.id
            if (groupId) {
                await adminApi.patch(`/api/menu-groups/${shop_id}/${groupId}`, payload)
            } else {
                const res = await adminApi.post(`/api/menu-groups/${shop_id}`, payload)
                groupId = res.data.id
            }

            // 메뉴 멤버 일괄 저장
            await adminApi.put(`/api/menu-groups/${shop_id}/${groupId}/menus`, {
                menu_ids: editingGroup.menu_ids,
            })

            await fetchGroups()
            closeModal()
        } catch (e) {
            console.error(e)
            alert(e.response?.data?.detail || '保存に失敗しました。')
        }
        setSaving(false)
    }

    const deleteGroup = async (g) => {
        if (!confirm(`「${g.name}」を削除しますか?`)) return
        try {
            await adminApi.delete(`/api/menu-groups/${shop_id}/${g.id}`)
            await fetchGroups()
        } catch (e) {
            alert('削除に失敗しました。')
        }
    }

    const toggleMenuId = (mid) => {
        setEditingGroup(prev => {
            const has = prev.menu_ids.includes(mid)
            return {
                ...prev,
                menu_ids: has ? prev.menu_ids.filter(x => x !== mid) : [...prev.menu_ids, mid],
            }
        })
    }

    const toggleWeekday = (day) => {
        setEditingGroup(prev => {
            const days = prev.weekdays ? prev.weekdays.split(',').filter(Boolean) : []
            const has = days.includes(day)
            const next = has ? days.filter(d => d !== day) : [...days, day]
            return { ...prev, weekdays: next.join(',') }
        })
    }

    const typeMeta = (t) => GROUP_TYPES.find(x => x.key === t) || GROUP_TYPES[0]
    const colorClass = (color) => ({
        amber: 'bg-amber-100 text-amber-700 border-amber-200',
        rose: 'bg-rose-100 text-rose-700 border-rose-200',
        sky: 'bg-sky-100 text-sky-700 border-sky-200',
    }[color] || 'bg-slate-100 text-slate-700 border-slate-200')

    const borderSelected = (color) => ({
        amber: 'border-amber-400 bg-amber-50',
        rose: 'border-rose-400 bg-rose-50',
        sky: 'border-sky-400 bg-sky-50',
    }[color] || 'border-adminprimary bg-adminprimary/5')

    // 카테고리별 메뉴 그룹핑 (편집 모달용)
    const menusByCategory = (Array.isArray(allMenus) ? allMenus : []).reduce((acc, m) => {
        const cat = m.category || 'その他'
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(m)
        return acc
    }, {})

    const selectedTypeMeta = editingGroup ? typeMeta(editingGroup.group_type) : null

    return (
        <div className="bg-white/80 rounded-2xl border border-adminprimary/10 backdrop-blur-xl shadow-sm overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-adminprimary/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-adminprimary text-2xl">layers</span>
                    <div className="text-left">
                        <h3 className="font-black text-slate-900 text-base">メニューグループ</h3>
                        <p className="text-xs text-slate-500 mt-0.5">ランチ/ディナー時間帯切替・食べ放題・手動切替</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">{groups.length}</span>
                    <span className={`material-symbols-outlined text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>expand_more</span>
                </div>
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-3">
                            {loading ? (
                                <div className="py-8 text-center text-slate-400 text-sm">読み込み中...</div>
                            ) : (
                                <>
                                    {groups.length === 0 && (
                                        <div className="py-6 text-center text-slate-400 text-sm">
                                            グループがまだありません。下のボタンから作成してください。
                                        </div>
                                    )}
                                    {groups.map(g => {
                                        const meta = typeMeta(g.group_type)
                                        return (
                                            <div key={g.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-adminprimary/30 transition-colors">
                                                <span className={`material-symbols-outlined p-2 rounded-lg ${colorClass(meta.color)} border`}>{meta.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900 truncate">{g.name}</span>
                                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${colorClass(meta.color)} border`}>{meta.label}</span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                        {g.group_type === 'TIME_WINDOW' && (
                                                            <>{g.active_from}〜{g.active_to}{g.weekdays ? ` · ${g.weekdays.split(',').map(d => WEEKDAYS.find(w => w.key === d)?.label).join('')}` : ' · 毎日'}</>
                                                        )}
                                                        {g.group_type === 'COURSE' && (
                                                            <>{cur.fmt(g.price_per_person)}/人 · {g.duration_minutes}分 · {g.course_type === 'food' ? '食べ放題' : g.course_type === 'drink' ? '飲み放題' : '食べ&飲み放題'}</>
                                                        )}
                                                        {g.group_type === 'MANUAL' && (
                                                            <span className={g.is_active ? 'text-green-600 font-bold' : 'text-slate-400'}>{g.is_active ? '● 有効' : '○ 無効'}</span>
                                                        )}
                                                        <span className="ml-2 text-slate-400">· メニュー {g.menu_ids?.length || 0}件</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => openEdit(g)} className="text-slate-400 hover:text-adminprimary p-1.5 rounded-lg hover:bg-adminprimary/10 transition-colors">
                                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                                </button>
                                                <button onClick={() => deleteGroup(g)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                                </button>
                                            </div>
                                        )
                                    })}

                                    {/* ボタン行 */}
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={openCreate}
                                            className="flex-1 py-3 border-2 border-dashed border-adminprimary/30 rounded-xl text-adminprimary font-bold text-sm hover:bg-adminprimary/5 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">add</span>
                                            新規グループ作成
                                        </button>
                                        <button
                                            onClick={() => setShowHelp(true)}
                                            className="px-4 py-3 border-2 border-dashed border-sky-300 rounded-xl text-sky-600 font-bold text-sm hover:bg-sky-50 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">help_outline</span>
                                            使い方
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── 編集モーダル (Portal — body直下にレンダリングしてoverflow-hidden/backdrop-blurを回避) ─── */}
            <Portal>
                <AnimatePresence>
                    {editingGroup && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                            onClick={closeModal}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                                onClick={e => e.stopPropagation()}
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
                            >
                                {/* ヘッダー */}
                                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                                    <div className="flex items-center gap-2.5">
                                        {selectedTypeMeta && (
                                            <span className={`material-symbols-outlined p-1.5 rounded-lg ${colorClass(selectedTypeMeta.color)} border text-[20px]`}>
                                                {selectedTypeMeta.icon}
                                            </span>
                                        )}
                                        <h3 className="font-black text-slate-900 text-lg">
                                            {editingGroup.id ? 'グループ編集' : '新規グループ作成'}
                                        </h3>
                                    </div>
                                    <button onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg">
                                        <span className="material-symbols-outlined text-slate-500">close</span>
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                                    {/* タイプ選択（説明付き） */}
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 block mb-2">
                                            グループのタイプを選択
                                        </label>
                                        <div className="grid grid-cols-1 gap-2">
                                            {GROUP_TYPES.map(t => {
                                                const isSelected = editingGroup.group_type === t.key
                                                return (
                                                    <button
                                                        key={t.key}
                                                        onClick={() => setEditingGroup(prev => ({ ...prev, group_type: t.key }))}
                                                        className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                                                            isSelected
                                                                ? borderSelected(t.color)
                                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                                        }`}
                                                    >
                                                        <span className={`material-symbols-outlined p-2 rounded-lg ${colorClass(t.color)} border flex-shrink-0 mt-0.5`}>{t.icon}</span>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-black text-sm text-slate-900">{t.label}</span>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorClass(t.color)} border`}>{t.sublabel}</span>
                                                            </div>
                                                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t.desc}</p>
                                                            <p className="text-[11px] text-slate-400 mt-0.5 italic">{t.example}</p>
                                                        </div>
                                                        {isSelected && (
                                                            <span className="material-symbols-outlined text-green-500 flex-shrink-0 mt-0.5">check_circle</span>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* グループ名 */}
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 block mb-1">グループ名 *</label>
                                        <input
                                            type="text"
                                            value={editingGroup.name}
                                            onChange={e => setEditingGroup(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder={
                                                editingGroup.group_type === 'TIME_WINDOW' ? '例: ランチセット / ディナーメニュー' :
                                                editingGroup.group_type === 'COURSE' ? '例: 90分食べ放題 / 飲み放題プラン' :
                                                '例: 季節限定メニュー / 本日のおすすめ'
                                            }
                                            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-adminprimary/50"
                                        />
                                    </div>

                                    {/* タイプ別 추가 입력 */}
                                    {editingGroup.group_type === 'TIME_WINDOW' && (
                                        <div className="space-y-3 p-4 bg-amber-50/60 rounded-xl border border-amber-200">
                                            <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                                表示する時間帯・曜日を設定してください
                                            </p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">開始時刻</label>
                                                    <input type="time" value={editingGroup.active_from}
                                                        onChange={e => setEditingGroup(prev => ({ ...prev, active_from: e.target.value }))}
                                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">終了時刻</label>
                                                    <input type="time" value={editingGroup.active_to}
                                                        onChange={e => setEditingGroup(prev => ({ ...prev, active_to: e.target.value }))}
                                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 block mb-1.5">曜日 <span className="font-normal text-slate-400">（未選択 = 毎日）</span></label>
                                                <div className="flex gap-1.5">
                                                    {WEEKDAYS.map(d => {
                                                        const selected = editingGroup.weekdays?.split(',').includes(d.key)
                                                        return (
                                                            <button key={d.key} onClick={() => toggleWeekday(d.key)}
                                                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                                                                    selected ? 'bg-adminprimary text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:border-adminprimary/40'
                                                                }`}>
                                                                {d.label}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {editingGroup.group_type === 'COURSE' && (
                                        <div className="space-y-3 p-4 bg-rose-50/60 rounded-xl border border-rose-200">
                                            <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px]">restaurant</span>
                                                コース内容を設定してください
                                            </p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">1人あたり料金 ({cur.symbol})</label>
                                                    <input type="number" min="0" value={editingGroup.price_per_person}
                                                        onChange={e => setEditingGroup(prev => ({ ...prev, price_per_person: e.target.value }))}
                                                        step={cur.decimals > 0 ? '0.01' : '1'}
                                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">制限時間 (分)</label>
                                                    <input type="number" min="10" value={editingGroup.duration_minutes}
                                                        onChange={e => setEditingGroup(prev => ({ ...prev, duration_minutes: parseIntOr(e.target.value, 90) }))}
                                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">ラストオーダー (終了何分前)</label>
                                                    <input type="number" min="0" value={editingGroup.last_order_minutes}
                                                        onChange={e => setEditingGroup(prev => ({ ...prev, last_order_minutes: parseIntOr(e.target.value, 0) }))}
                                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 block mb-1">対象</label>
                                                    <select value={editingGroup.course_type}
                                                        onChange={e => setEditingGroup(prev => ({ ...prev, course_type: e.target.value }))}
                                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                                                        <option value="food">食べ放題</option>
                                                        <option value="drink">飲み放題</option>
                                                        <option value="both">食べ&飲み放題</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <p className="text-[11px] text-rose-500 flex items-start gap-1">
                                                <span className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0">info</span>
                                                スタッフページ「食べ放題」タブからテーブルごとにコースを開始できます。
                                            </p>
                                        </div>
                                    )}

                                    {editingGroup.group_type === 'MANUAL' && (
                                        <div className="p-4 bg-sky-50/60 rounded-xl border border-sky-200 space-y-3">
                                            <p className="text-xs font-bold text-sky-700 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px]">toggle_on</span>
                                                初期状態を設定してください
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-700">グループを有効にする</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">後からいつでもON/OFFを切り替えられます</p>
                                                </div>
                                                <button
                                                    onClick={() => setEditingGroup(prev => ({ ...prev, is_active: !prev.is_active }))}
                                                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${editingGroup.is_active ? 'bg-green-500' : 'bg-slate-300'}`}
                                                >
                                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editingGroup.is_active ? 'translate-x-6' : 'translate-x-0'}`} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* メニュー 선택 */}
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 block mb-2">
                                            含めるメニュー
                                            <span className="ml-2 font-normal text-adminprimary">{editingGroup.menu_ids.length}件選択中</span>
                                        </label>
                                        <div className="border border-slate-200 rounded-xl max-h-64 overflow-y-auto">
                                            {Object.entries(menusByCategory).map(([cat, items]) => (
                                                <div key={cat} className="border-b border-slate-100 last:border-0">
                                                    <div className="px-3 py-2 bg-slate-50 text-xs font-black text-slate-500 uppercase tracking-wider sticky top-0">{cat}</div>
                                                    {items.map(m => {
                                                        const checked = editingGroup.menu_ids.includes(m.id)
                                                        return (
                                                            <label key={m.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                                                <input type="checkbox" checked={checked}
                                                                    onChange={() => toggleMenuId(m.id)}
                                                                    className="w-4 h-4 accent-adminprimary" />
                                                                <span className="flex-1 text-sm">{m.name_jp || m.name_ko || m.name_en}</span>
                                                                <span className="text-xs text-slate-400">{cur.fmt(m.price || 0)}</span>
                                                            </label>
                                                        )
                                                    })}
                                                </div>
                                            ))}
                                            {Object.keys(menusByCategory).length === 0 && (
                                                <div className="px-3 py-6 text-center text-slate-400 text-sm">メニューがありません</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
                                    <button onClick={closeModal} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
                                        キャンセル
                                    </button>
                                    <button onClick={saveGroup} disabled={saving}
                                        className="px-5 py-2.5 text-sm font-bold bg-adminprimary text-white rounded-xl hover:bg-[#a81928] disabled:opacity-50 transition-colors">
                                        {saving ? '保存中...' : '保存する'}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Portal>

            {/* ─── 使い方ヘルプモーダル (Portal) ─── */}
            <Portal>
                <AnimatePresence>
                    {showHelp && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                            onClick={() => setShowHelp(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                                onClick={e => e.stopPropagation()}
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
                            >
                                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                                    <div className="flex items-center gap-2.5">
                                        <span className="material-symbols-outlined text-sky-500 text-2xl">help_outline</span>
                                        <h3 className="font-black text-slate-900 text-lg">メニューグループ 使い方</h3>
                                    </div>
                                    <button onClick={() => setShowHelp(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                                        <span className="material-symbols-outlined text-slate-500">close</span>
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-3">
                                        メニューグループとは、<strong>特定のメニューをまとめてグループ化</strong>し、表示・非表示や価格ルールを一括管理できる機能です。
                                    </p>

                                    {GROUP_TYPES.map(t => (
                                        <div key={t.key} className={`rounded-xl border-2 overflow-hidden ${
                                            t.color === 'amber' ? 'border-amber-200' :
                                            t.color === 'rose' ? 'border-rose-200' : 'border-sky-200'
                                        }`}>
                                            {/* タイプヘッダー */}
                                            <div className={`px-4 py-3 flex items-center gap-3 ${
                                                t.color === 'amber' ? 'bg-amber-50' :
                                                t.color === 'rose' ? 'bg-rose-50' : 'bg-sky-50'
                                            }`}>
                                                <span className={`material-symbols-outlined p-2 rounded-lg ${colorClass(t.color)} border text-[20px]`}>{t.icon}</span>
                                                <div>
                                                    <p className="font-black text-slate-900 text-sm">{t.label}</p>
                                                    <p className={`text-[11px] font-bold ${
                                                        t.color === 'amber' ? 'text-amber-600' :
                                                        t.color === 'rose' ? 'text-rose-600' : 'text-sky-600'
                                                    }`}>{t.sublabel}</p>
                                                </div>
                                            </div>
                                            {/* タイプ説明 */}
                                            <div className="px-4 py-3 space-y-2">
                                                <p className="text-sm text-slate-700 leading-relaxed">{t.desc}</p>
                                                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 italic">{t.example}</p>
                                                <div className="mt-2">
                                                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5">設定ステップ</p>
                                                    <ol className="space-y-1">
                                                        {t.steps.map((step, i) => (
                                                            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                                                <span className={`flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-black flex items-center justify-center mt-0.5 ${colorClass(t.color)}`}>{i + 1}</span>
                                                                {step}
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* 補足 */}
                                    <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
                                        <span className="material-symbols-outlined text-blue-400 text-[18px] flex-shrink-0 mt-0.5">lightbulb</span>
                                        <p className="text-xs text-blue-700 leading-relaxed">
                                            1つのメニューを複数のグループに所属させることができます。
                                            グループ内のメニューは、グループが非アクティブな間はお客様のメニュー画面に表示されません。
                                        </p>
                                    </div>
                                </div>

                                <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
                                    <button
                                        onClick={() => { setShowHelp(false); openCreate() }}
                                        className="w-full py-2.5 text-sm font-bold bg-adminprimary text-white rounded-xl hover:bg-[#a81928] transition-colors flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">add</span>
                                        グループを作成する
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Portal>
        </div>
    )
}
