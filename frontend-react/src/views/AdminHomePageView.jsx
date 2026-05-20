import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import adminApi from '../hooks/useAdminApi'
import axios from 'axios'
import { AdminNavBar } from './AdminView'
import {
    Sparkles, Home, Camera, MapPin, Image as ImageIcon, Plus, Trash2, Upload,
    Globe, Megaphone, ChevronRight, Star, ExternalLink, Timer, Briefcase, Gift,
    BarChart2, TrendingUp, Flame, Users,
} from 'lucide-react'

/**
 * /admin/homepage — 매장 공개 페이지(qraku.com/{shop_id}) 컨텐츠 관리
 */

function Toggle({ value, onChange, disabled }) {
    return (
        <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
            className={`w-12 h-6 rounded-full relative transition-colors ${value ? 'bg-rose-500' : 'bg-slate-300'} ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
            <div className={`absolute top-1 size-4 bg-white rounded-full transition-all shadow ${value ? 'left-7' : 'left-1'}`} />
        </button>
    )
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']


function parseList(raw) {
    if (!raw) return []
    try {
        const v = typeof raw === 'string' ? JSON.parse(raw) : raw
        return Array.isArray(v) ? v : []
    } catch {
        return []
    }
}

export default function AdminHomePageView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const [storeData, setStoreData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Section states
    const [allowListing, setAllowListing] = useState(false)
    const [prefecture, setPrefecture] = useState('')
    const [city, setCity] = useState('')
    const [aboutDescription, setAboutDescription] = useState('')
    const [specialty, setSpecialty] = useState('')
    const [interiorPhotos, setInteriorPhotos] = useState([])
    const [exteriorPhotos, setExteriorPhotos] = useState([])
    const [attractions, setAttractions] = useState([])  // [{name, description, image_url}]
    const [businessHours, setBusinessHours] = useState({})
    
    // Food Rescue & Job Board
    const [foodRescueActive, setFoodRescueActive] = useState(false)
    const [foodRescueMsg, setFoodRescueMsg] = useState('')
    const [foodRescueMode, setFoodRescueMode] = useState('manual')   // 'auto' | 'manual'
    const [foodRescueAutoMinutes, setFoodRescueAutoMinutes] = useState(60)
    const [jobBoardActive, setJobBoardActive] = useState(false)
    const [jobBoardText, setJobBoardText] = useState('')
    
    // LINE Digital Stamp
    const [stampActive, setStampActive] = useState(false)
    const [stampTarget, setStampTarget] = useState(10)
    const [stampRewardMsg, setStampRewardMsg] = useState('')
    const [stampRewardDiscount, setStampRewardDiscount] = useState(0)

    // Photo Review Contest & SEO
    const [photoContestActive, setPhotoContestActive] = useState(false)
    const [photoContestRewardAmount, setPhotoContestRewardAmount] = useState(500)
    const [photoReviews, setPhotoReviews] = useState([])

    const interiorInputRef = useRef(null)
    const exteriorInputRef = useRef(null)
    const attractionInputRef = useRef(null)
    const [pendingAttractionIdx, setPendingAttractionIdx] = useState(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await axios.get(`/api/stores/${shop_id}`)
                const d = res.data
                setStoreData(d)
                setAllowListing(Boolean(d.allow_public_listing))
                setPrefecture(d.prefecture || '')
                setCity(d.city || '')
                setAboutDescription(d.about_description || '')
                setSpecialty(d.specialty || '')
                setInteriorPhotos(parseList(d.interior_photos))
                setExteriorPhotos(parseList(d.exterior_photos))
                setAttractions(parseList(d.nearby_attractions))
                
                if (d.business_hours) {
                    try { setBusinessHours(JSON.parse(d.business_hours)) } catch {}
                }
                
                setFoodRescueActive(Boolean(d.food_rescue_active))
                setFoodRescueMsg(d.food_rescue_msg || '')
                setFoodRescueMode(d.food_rescue_mode || 'manual')
                setFoodRescueAutoMinutes(d.food_rescue_auto_minutes || 60)
                setJobBoardActive(Boolean(d.job_board_active))
                setJobBoardText(d.job_board_text || '')
                
                setStampActive(Boolean(d.stamp_active))
                setStampTarget(d.stamp_target || 10)
                setStampRewardMsg(d.stamp_reward_msg || '')
                setStampRewardDiscount(d.stamp_reward_discount || 0)
                
                setPhotoContestActive(Boolean(d.photo_contest_active))
                setPhotoContestRewardAmount(d.photo_contest_reward_amount || 500)

                // Fetch Photo Reviews
                const reviewsRes = await adminApi.get(`/api/stores/${shop_id}/photo-reviews`)
                setPhotoReviews(reviewsRes.data)
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [shop_id])

    const handleSave = async () => {
        if (!storeData) return
        setSaving(true)
        try {
            await adminApi.patch(`/api/stores/${shop_id}`, {
                allow_public_listing: allowListing,
                prefecture: prefecture.trim() || null,
                city: city.trim() || null,
                about_description: aboutDescription.trim() || null,
                specialty: specialty.trim() || null,
                interior_photos: JSON.stringify(interiorPhotos),
                exterior_photos: JSON.stringify(exteriorPhotos),
                nearby_attractions: JSON.stringify(attractions),
                business_hours: JSON.stringify(businessHours),
                food_rescue_active: foodRescueActive,
                food_rescue_msg: foodRescueMsg.trim() || null,
                food_rescue_mode: foodRescueMode,
                food_rescue_auto_minutes: parseInt(foodRescueAutoMinutes, 10) || 60,
                job_board_active: jobBoardActive,
                job_board_text: jobBoardText.trim() || null,
                stamp_active: stampActive,
                stamp_target: parseInt(stampTarget, 10) || 10,
                stamp_reward_msg: stampRewardMsg.trim() || null,
                stamp_reward_discount: parseInt(stampRewardDiscount, 10) || 0,
                photo_contest_active: photoContestActive,
                photo_contest_reward_amount: parseInt(photoContestRewardAmount, 10) || 500,
            })
            alert('保存しました ✨')
        } catch (e) {
            alert('保存に失敗しました: ' + (e.response?.data?.detail || e.message))
        } finally {
            setSaving(false)
        }
    }

    const handleUpdateReviewStatus = async (reviewId, newStatus) => {
        try {
            await adminApi.patch(`/api/stores/${shop_id}/photo-reviews/${reviewId}/status`, { status: newStatus })
            setPhotoReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status: newStatus } : r))
            if (newStatus === 'best_of_month') {
                alert('이달의 사진으로 선정되었습니다! 해당 고객에게 할인 쿠폰이 발급되었습니다 🎉')
            }
        } catch (e) {
            alert('상태 업데이트에 실패했습니다.')
        }
    }

    // ── Photo upload helpers ────────────────────────────────────────────
    const uploadFile = async (file, type) => {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('store_id', String(storeData.id))
        fd.append('photo_type', type)
        const res = await adminApi.post('/api/stores/upload-photo', fd, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
        return res.data.image_url
    }

    const handleInteriorUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        try {
            const url = await uploadFile(file, 'interior')
            setInteriorPhotos(prev => [...prev, url])
        } catch (e) {
            alert('アップロードに失敗しました')
        } finally {
            e.target.value = ''
        }
    }

    const handleExteriorUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        try {
            const url = await uploadFile(file, 'exterior')
            setExteriorPhotos(prev => [...prev, url])
        } catch (e) {
            alert('アップロードに失敗しました')
        } finally {
            e.target.value = ''
        }
    }

    const handleAttractionUpload = async (e) => {
        const file = e.target.files[0]
        if (!file || pendingAttractionIdx === null) return
        try {
            const url = await uploadFile(file, 'attraction')
            setAttractions(prev => prev.map((a, i) => i === pendingAttractionIdx ? { ...a, image_url: url } : a))
        } catch (e) {
            alert('アップロードに失敗しました')
        } finally {
            e.target.value = ''
            setPendingAttractionIdx(null)
        }
    }

    if (loading) {
        return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" /></div>
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <AdminNavBar storeData={storeData} shop_id={shop_id} />

            <div className="max-w-4xl mx-auto px-4 md:px-10 py-8 space-y-6">

                {/* ── タイトル ─────────────────────────────── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                            <Home className="w-6 h-6 text-rose-500" /> My Home Page
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">お客様向けに公開する <span className="font-mono text-rose-500">qraku.com/{shop_id}</span> の内容をカスタマイズ</p>
                    </div>
                    {allowListing && (
                        <a href={`/${shop_id}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-rose-50 hover:border-rose-200 transition-colors">
                            <ExternalLink className="w-4 h-4" /> プレビュー
                        </a>
                    )}
                </div>

                {/* ── 公開設定 + 혜택 설명 ─────────────────────── */}
                <section className="bg-gradient-to-br from-rose-50 to-amber-50 rounded-2xl border border-rose-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Megaphone className="w-5 h-5 text-rose-500" />
                            <h3 className="font-black text-slate-900">公開ホームページを有効にする</h3>
                        </div>
                        <Toggle value={allowListing} onChange={setAllowListing} />
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        登録された情報をもとに、お客様が訪れる無料ホームページが <span className="font-bold text-rose-500">qraku.com/{shop_id}</span> に自動公開されます。
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                            { icon: '🏠', title: 'プロ仕様の専用ページ', desc: 'メニュー・地図・QR注文ボタンが入ったホームページ' },
                            { icon: '📍', title: 'QRaku ディレクトリに掲載', desc: '近くを検索しているお客様の検索結果に表示' },
                            { icon: '💰', title: '月額 ¥1,000 割引', desc: '広告効果の還元として全プランから割引' },
                            { icon: '🎨', title: '内装・外観・周辺情報を自由に追加', desc: 'お店の雰囲気を写真で伝えられます' },
                            { icon: '📱', title: 'LINE 友だち追加ボタン', desc: 'リピーター獲得につながります' },
                            { icon: '🛍️', title: 'テイクアウト QR で事前注文', desc: 'お客様が好きな時間に来店できます' },
                        ].map((b, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 bg-white/60 rounded-xl border border-white">
                                <span className="text-2xl shrink-0">{b.icon}</span>
                                <div>
                                    <p className="text-sm font-black text-slate-800">{b.title}</p>
                                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{b.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-3">※ 売上データや顧客個人情報は一切公開されません</p>
                </section>

                {/* ── 営業時間設定 ─────────────────────── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Timer className="w-5 h-5 text-rose-500" />
                            <h3 className="font-bold text-lg">営業時間</h3>
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        お店の営業時間を設定してください。この情報はミニホームページ(qraku.com/{shop_id})に表示されます。
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {DAY_KEYS.map((key) => {
                            const day = businessHours[key] || { open: '11:00', close: '22:00', closed: false }
                            const tDay = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' }[key]
                            return (
                                <div key={key} className={`p-3 rounded-xl border transition-all ${day.closed ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-rose-50 border-rose-200'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-black text-slate-700">{tDay}</span>
                                        <button onClick={() => {
                                            const newH = { ...businessHours, [key]: { ...day, closed: !day.closed } }
                                            setBusinessHours(newH)
                                        }}
                                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${day.closed ? 'bg-red-100 text-red-500' : 'bg-emerald-100 text-emerald-600'}`}>
                                            {day.closed ? '休業' : '営業'}
                                        </button>
                                    </div>
                                    {!day.closed && (
                                        <div className="space-y-1">
                                            <input type="time" value={day.open} onChange={e => {
                                                const newH = { ...businessHours, [key]: { ...day, open: e.target.value } }
                                                setBusinessHours(newH)
                                            }} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-rose-400" />
                                            <input type="time" value={day.close} onChange={e => {
                                                const newH = { ...businessHours, [key]: { ...day, close: e.target.value } }
                                                setBusinessHours(newH)
                                            }} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-rose-400" />
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </section>

                {/* ── 푸드 레스큐 (타임 세일) ─────────────────────── */}
                <section className="bg-white rounded-2xl border border-rose-200 shadow-sm p-6 overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Timer className="w-5 h-5 text-rose-500" />
                            <h3 className="font-black text-slate-900">フードレスキュー (タイムセール)</h3>
                        </div>
                        <Toggle value={foodRescueActive} onChange={setFoodRescueActive} />
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        閉店前の食材ロス削減！オンにすると、お客様のホームページ上部に目立つカウントダウンバナーが表示されます。
                    </p>
                    {foodRescueActive && (
                        <div className="mt-4 space-y-4">
                            {/* バナーメッセージ */}
                            <div className="p-4 bg-rose-50 rounded-xl">
                                <label className="text-xs font-bold text-rose-700 block mb-1">バナーメッセージ</label>
                                <input type="text" placeholder="例: 閉店前セール！全メニュー30%OFF！"
                                    value={foodRescueMsg} onChange={e => setFoodRescueMsg(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-rose-200 rounded-lg focus:outline-none focus:border-rose-400" />
                            </div>

                            {/* モード選択 */}
                            <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                                <p className="text-xs font-bold text-slate-700">🎛️ 表示タイミングを選択</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* 自動モード */}
                                    <button
                                        onClick={() => setFoodRescueMode('auto')}
                                        className={`flex flex-col gap-1.5 p-4 rounded-xl border-2 text-left transition-all ${
                                            foodRescueMode === 'auto'
                                                ? 'border-rose-500 bg-rose-50'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">⏰</span>
                                            <span className="text-sm font-black text-slate-800">自動</span>
                                            {foodRescueMode === 'auto' && <span className="ml-auto text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full">選択中</span>}
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-relaxed">営業終了 N分前に自動でバナーを表示。Registerからも手動ONできます。</p>
                                    </button>
                                    {/* 手動モード */}
                                    <button
                                        onClick={() => setFoodRescueMode('manual')}
                                        className={`flex flex-col gap-1.5 p-4 rounded-xl border-2 text-left transition-all ${
                                            foodRescueMode === 'manual'
                                                ? 'border-rose-500 bg-rose-50'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">🖐️</span>
                                            <span className="text-sm font-black text-slate-800">手動</span>
                                            {foodRescueMode === 'manual' && <span className="ml-auto text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full">選択中</span>}
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-relaxed">Registerページのタイムセールボタンを押したときだけ表示。</p>
                                    </button>
                                </div>

                                {/* 自動モード設定 */}
                                {foodRescueMode === 'auto' && (
                                    <div className="pt-3 border-t border-slate-200">
                                        <label className="text-xs font-bold text-slate-600 block mb-2">営業終了の何分前に自動表示しますか？</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number" min={5} max={480} step={5}
                                                value={foodRescueAutoMinutes}
                                                onChange={e => setFoodRescueAutoMinutes(e.target.value)}
                                                className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-rose-400 text-center font-bold"
                                            />
                                            <span className="text-sm text-slate-500 font-medium">分前</span>
                                        </div>
                                        {Object.keys(businessHours).length === 0 && (
                                            <p className="mt-2 text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                                ⚠️ 営業時間が未設定のため、自動表示が機能しません。上の「営業時間」から設定してください。
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* 手動モード案内 */}
                                {foodRescueMode === 'manual' && (
                                    <div className="pt-3 border-t border-slate-200">
                                        <p className="text-[11px] text-slate-500 bg-white px-3 py-2 rounded-lg border border-slate-100">
                                            📱 <strong>Registerページ</strong>の「タイムセール」ボタンを押すと、ホームページにバナーが表示されます。
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {/* ── 마이크로 채용 보드 (구인 공고) ─────────────────────── */}
                <section className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-blue-500" />
                            <h3 className="font-black text-slate-900">求人ボード (アルバイト募集)</h3>
                        </div>
                        <Toggle value={jobBoardActive} onChange={setJobBoardActive} />
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        お店を好きなお客様からスタッフを募集！ホームページの最下部に小さな求人枠を表示します。
                    </p>
                    {jobBoardActive && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                            <label className="text-xs font-bold text-blue-700 block mb-1">募集内容</label>
                            <textarea placeholder="例: 今夜3時間だけ手伝える方急募！時給1,500円" rows={3}
                                value={jobBoardText} onChange={e => setJobBoardText(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none" />
                        </div>
                    )}
                </section>

                {/* ── LINE Digital Stamp & CRM ─────────────────────── */}
                <section className="bg-white rounded-2xl border border-[#06C755]/30 shadow-sm p-6 overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#06C755]"></div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Gift className="w-5 h-5 text-[#06C755]" />
                            <h3 className="font-black text-slate-900">LINE デジタルスタンプ (CRM)</h3>
                        </div>
                        <Toggle value={stampActive} onChange={setStampActive} />
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        LINE連携で注文したお客様に自動でスタンプを付与します。スタンプが貯まるとお会計時に自動割引が適用されます。
                    </p>
                    {stampActive && (
                        <div className="mt-4 p-4 bg-[#06C755]/5 rounded-xl space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[#06C755] block mb-1">目標スタンプ数</label>
                                <select 
                                    value={stampTarget} 
                                    onChange={e => setStampTarget(Number(e.target.value))}
                                    className="w-full px-3 py-2 text-sm border border-[#06C755]/30 rounded-lg focus:outline-none focus:border-[#06C755] bg-white">
                                    <option value={3}>3個</option>
                                    <option value={5}>5個</option>
                                    <option value={10}>10個</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[#06C755] block mb-1">特典メッセージ (お客様向け)</label>
                                <input type="text" placeholder="例: スタンプ10個で500円割引！"
                                    value={stampRewardMsg} onChange={e => setStampRewardMsg(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-[#06C755]/30 rounded-lg focus:outline-none focus:border-[#06C755]" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[#06C755] block mb-1">割引金額 (円) ※実際に注文金額からマイナスされます</label>
                                <input type="number" placeholder="例: 500" min={0}
                                    value={stampRewardDiscount} onChange={e => setStampRewardDiscount(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-[#06C755]/30 rounded-lg focus:outline-none focus:border-[#06C755]" />
                            </div>
                        </div>
                    )}
                </section>

                {/* ── Photo Review Contest & SEO ─────────────────────── */}
                <section className="bg-white rounded-2xl border border-indigo-500/30 shadow-sm p-6 overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">📸</span>
                            <h3 className="font-black text-slate-900">ポトリビューコンテスト (SEO強化)</h3>
                        </div>
                        <Toggle value={photoContestActive} onChange={setPhotoContestActive} />
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        お客様がミニホームページに写真を投稿できる機能です。良質な写真が増えることでGoogle検索順位(SEO)が上がります！
                    </p>
                    {photoContestActive && (
                        <div className="mt-4 p-4 bg-indigo-50 rounded-xl space-y-4">
                            <div>
                                <label className="text-xs font-bold text-indigo-700 block mb-1">
                                    今月の写真特典 (円) ※選ばれたお客様に自動で割引クーポンが発行されます
                                </label>
                                <input type="number" placeholder="例: 500" min={0}
                                    value={photoContestRewardAmount} onChange={e => setPhotoContestRewardAmount(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                            </div>

                            {/* 投稿された写真の管理 */}
                            <div className="pt-4 border-t border-indigo-200">
                                <h4 className="font-bold text-indigo-800 text-sm mb-3">📸 投稿された写真の管理</h4>
                                {photoReviews.length === 0 ? (
                                    <p className="text-xs text-slate-500">まだ投稿がありません。</p>
                                ) : (
                                    <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                        {photoReviews.map(r => (
                                            <div key={r.id} className="flex gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                                <img src={r.image_url} alt="review" className="w-20 h-20 object-cover rounded-md" />
                                                <div className="flex-1 text-sm">
                                                    <p className="font-medium text-slate-700 mb-1">{r.comment || 'コメントなし'}</p>
                                                    <p className="text-xs text-slate-400 mb-2">状態: 
                                                        <span className={`ml-1 font-bold ${r.status === 'pending' ? 'text-orange-500' : r.status === 'approved' ? 'text-green-500' : 'text-indigo-600'}`}>
                                                            {r.status === 'pending' ? '承認待ち' : r.status === 'approved' ? '承認済み' : '🏆 今月の写真!'}
                                                        </span>
                                                    </p>
                                                    <div className="flex gap-2">
                                                        {r.status === 'pending' && (
                                                            <>
                                                                <button onClick={() => handleUpdateReviewStatus(r.id, 'approved')} className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded hover:bg-green-200">承認する (公開)</button>
                                                                <button onClick={() => handleUpdateReviewStatus(r.id, 'rejected')} className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded hover:bg-red-200">拒否する</button>
                                                            </>
                                                        )}
                                                        {r.status === 'approved' && (
                                                            <button onClick={() => handleUpdateReviewStatus(r.id, 'best_of_month')} className="px-2 py-1 bg-indigo-500 text-white text-xs font-bold rounded hover:bg-indigo-600 shadow-sm">🏆 今月の写真に選ぶ (クーポン発行)</button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {/* ── 地域 ─────────────────────────── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h3 className="font-black flex items-center gap-2 mb-4">
                        <MapPin className="w-5 h-5 text-rose-500" /> 所在地
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-600 block mb-1">都道府県</label>
                            <input type="text" placeholder="例: 東京都"
                                value={prefecture} onChange={e => setPrefecture(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-rose-400" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 block mb-1">市区町村</label>
                            <input type="text" placeholder="例: 渋谷区"
                                value={city} onChange={e => setCity(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-rose-400" />
                        </div>
                    </div>
                </section>

                {/* ── 店舗紹介文 ─────────────────────── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h3 className="font-black flex items-center gap-2 mb-2">
                        <Sparkles className="w-5 h-5 text-rose-500" /> 店舗紹介文
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">お店の雰囲気・歴史・こだわりなどを自由に書いてください</p>
                    <textarea rows={5}
                        value={aboutDescription}
                        onChange={e => setAboutDescription(e.target.value)}
                        placeholder="例: 当店は1985年創業の老舗ラーメン店です。秘伝のスープは...&#10;丁寧に説明することでお客様の心を掴みます。"
                        maxLength={2000}
                        className="w-full px-3 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-rose-400 resize-none leading-relaxed"
                    />
                    <p className="text-xs text-slate-400 text-right mt-1">{aboutDescription.length}/2000</p>
                </section>

                {/* ── 自慢ポイント ─────────────────── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h3 className="font-black flex items-center gap-2 mb-2">
                        <Star className="w-5 h-5 text-rose-500" /> 自慢ポイント・おすすめ
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">「これだけは譲れない」というアピールポイントを短く</p>
                    <textarea rows={3}
                        value={specialty}
                        onChange={e => setSpecialty(e.target.value)}
                        placeholder="例: 国産小麦100%の自家製麺 / 厳選した北海道産の食材 / オーナー自慢のワインセラー"
                        maxLength={1000}
                        className="w-full px-3 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-rose-400 resize-none"
                    />
                    <p className="text-xs text-slate-400 text-right mt-1">{specialty.length}/1000</p>
                </section>

                {/* ── 内装写真 ───────────────────────── */}
                <PhotoGallerySection
                    icon={<ImageIcon className="w-5 h-5 text-rose-500" />}
                    title="店内・内装写真"
                    desc="お店の雰囲気が伝わる写真をアップロードしてください（最大10枚）"
                    photos={interiorPhotos}
                    onAdd={() => interiorInputRef.current?.click()}
                    onRemove={(idx) => setInteriorPhotos(prev => prev.filter((_, i) => i !== idx))}
                    inputRef={interiorInputRef}
                    onUpload={handleInteriorUpload}
                    max={10}
                />

                {/* ── 外観写真 ───────────────────────── */}
                <PhotoGallerySection
                    icon={<Camera className="w-5 h-5 text-rose-500" />}
                    title="外観写真"
                    desc="お店の入口や看板の写真。初めてのお客様が見つけやすくなります（最大5枚）"
                    photos={exteriorPhotos}
                    onAdd={() => exteriorInputRef.current?.click()}
                    onRemove={(idx) => setExteriorPhotos(prev => prev.filter((_, i) => i !== idx))}
                    inputRef={exteriorInputRef}
                    onUpload={handleExteriorUpload}
                    max={5}
                />

                {/* ── 周辺観光スポット ─────────────────── */}
                <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                    <h3 className="font-black flex items-center gap-2 mb-2">
                        <Globe className="w-5 h-5 text-rose-500" /> 周辺観光スポット・おすすめ
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">観光客のお客様が来店する動機になります（最大8件）</p>

                    <div className="space-y-3">
                        {attractions.map((a, idx) => (
                            <div key={idx} className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <button
                                    onClick={() => { setPendingAttractionIdx(idx); attractionInputRef.current?.click() }}
                                    className="w-20 h-20 bg-white rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center hover:border-rose-300 transition-colors shrink-0"
                                >
                                    {a.image_url
                                        ? <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                                        : <Camera className="w-6 h-6 text-slate-300" />
                                    }
                                </button>
                                <div className="flex-1 space-y-2">
                                    <input
                                        type="text"
                                        placeholder="スポット名 (例: 渋谷スクランブル交差点)"
                                        value={a.name || ''}
                                        onChange={e => setAttractions(prev => prev.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))}
                                        className="w-full px-3 py-1.5 text-sm font-bold border border-slate-200 rounded-lg focus:outline-none focus:border-rose-400"
                                    />
                                    <input
                                        type="text"
                                        placeholder="一言説明 (例: 徒歩3分・観光名所)"
                                        value={a.description || ''}
                                        onChange={e => setAttractions(prev => prev.map((p, i) => i === idx ? { ...p, description: e.target.value } : p))}
                                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-rose-400"
                                    />
                                </div>
                                <button
                                    onClick={() => setAttractions(prev => prev.filter((_, i) => i !== idx))}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {attractions.length < 8 && (
                            <button
                                onClick={() => setAttractions(prev => [...prev, { name: '', description: '', image_url: '' }])}
                                className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-500 hover:border-rose-300 hover:text-rose-500 transition-colors flex items-center justify-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> スポットを追加
                            </button>
                        )}
                    </div>
                    <input ref={attractionInputRef} type="file" accept="image/*" onChange={handleAttractionUpload} className="hidden" />
                </section>

                {/* ── インサイト ─────────────────────── */}
                <InsightsSection shop_id={shop_id} />

                {/* ── 保存 ──────────────────────────── */}
                <div className="sticky bottom-0 bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-lg flex items-center justify-between">
                    <p className="text-xs text-slate-500">変更を反映するには保存してください</p>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-gradient-to-r from-rose-500 to-rose-600 text-white font-black px-8 py-3 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-60 flex items-center gap-2"
                    >
                        {saving ? '保存中...' : '保存する'} <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

            </div>
        </div>
    )
}

// ────────────────────────────────────────────────────
// SPC-07 인사이트 미니 대시보드
// ────────────────────────────────────────────────────
function InsightsSection({ shop_id }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const DAYS = 30

    useEffect(() => {
        const qs = `shop_id=${shop_id}&days=${DAYS}`
        Promise.all([
            adminApi.get(`/api/admin/insights/visitors?${qs}&days=14`),
            adminApi.get(`/api/admin/insights/popular_menus?${qs}`),
            adminApi.get(`/api/admin/insights/rescue_effect?${qs}`),
            adminApi.get(`/api/admin/insights/neighborhood_avg?${qs}`),
        ]).then(([v, m, r, n]) => {
            setData({ visitors: v.data, menus: m.data, rescue: r.data, neighborhood: n.data })
        }).catch(() => {}).finally(() => setLoading(false))
    }, [shop_id])

    if (loading) return (
        <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 flex items-center justify-center h-28">
            <div className="w-6 h-6 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
        </section>
    )
    if (!data) return null

    const { visitors, menus, rescue, neighborhood } = data

    // ── 방문자 트렌드 미니 바차트 ──
    const maxOrders = Math.max(...(visitors.data.map(d => d.orders)), 1)

    // ── 마감 할인 효과 ──
    const totalOrders = (rescue.rescue?.orders || 0) + (rescue.normal?.orders || 0)

    return (
        <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-6">
            <h3 className="font-black flex items-center gap-2 text-slate-900">
                <BarChart2 className="w-5 h-5 text-rose-500" /> データインサイト
                <span className="ml-auto text-xs font-normal text-slate-400">過去 {DAYS} 日間</span>
            </h3>

            {/* ── 주문 트렌드 (14일) ── */}
            <div>
                <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> 注文トレンド（過去14日）
                </p>
                <div className="flex items-end gap-1 h-16">
                    {visitors.data.length === 0
                        ? <p className="text-xs text-slate-400">データなし</p>
                        : visitors.data.map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <div
                                    className="w-full bg-rose-400 rounded-t transition-all"
                                    style={{ height: `${Math.max(4, (d.orders / maxOrders) * 52)}px` }}
                                />
                                <span className="text-[9px] text-slate-400 leading-none">
                                    {d.day.slice(5)}
                                </span>
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                                    {d.orders}件
                                </div>
                            </div>
                        ))
                    }
                </div>
            </div>

            {/* ── 인기 메뉴 Top 5 ── */}
            <div>
                <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" /> 人気メニュー Top {menus.items?.length || 0}（過去 {DAYS} 日）
                </p>
                {menus.items?.length === 0
                    ? <p className="text-xs text-slate-400">データなし</p>
                    : <div className="space-y-2">
                        {menus.items.map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-400 w-4 shrink-0">{i + 1}</span>
                                <span className="text-xs font-bold text-slate-700 flex-1 truncate">{item.name_jp || item.menu_item_id}</span>
                                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0">
                                    <div className="h-full bg-rose-400 rounded-full" style={{ width: `${item.pct}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-500 w-8 text-right shrink-0">{item.qty}個</span>
                            </div>
                        ))}
                    </div>
                }
            </div>

            {/* ── 마감 할인 효果 + 동네 비교 — 2열 ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 마감 할인 효과 */}
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                    <p className="text-xs font-bold text-orange-600 mb-3 flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5" /> マグカル割引 効果
                    </p>
                    {totalOrders === 0
                        ? <p className="text-xs text-slate-400">データなし</p>
                        : <>
                            <div className="flex justify-between text-xs mb-2">
                                <span className="text-slate-600">割引あり注文</span>
                                <span className="font-black text-orange-600">
                                    {rescue.rescue.orders}件 ({rescue.rescue_pct}%)
                                </span>
                            </div>
                            <div className="w-full h-2 bg-orange-100 rounded-full overflow-hidden mb-3">
                                <div className="h-full bg-orange-400 rounded-full" style={{ width: `${rescue.rescue_pct}%` }} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center">
                                <div className="bg-white rounded-lg p-2">
                                    <p className="text-[10px] text-slate-400">割引時 平均単価</p>
                                    <p className="font-black text-sm text-orange-500">¥{Math.round(rescue.rescue.avg_amount).toLocaleString()}</p>
                                </div>
                                <div className="bg-white rounded-lg p-2">
                                    <p className="text-[10px] text-slate-400">通常時 平均単価</p>
                                    <p className="font-black text-sm text-slate-600">¥{Math.round(rescue.normal.avg_amount).toLocaleString()}</p>
                                </div>
                            </div>
                        </>
                    }
                </div>

                {/* 동네 평균 비교 */}
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <p className="text-xs font-bold text-blue-600 mb-3 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> エリア比較
                    </p>
                    {!neighborhood.neighborhood
                        ? <p className="text-xs text-slate-400">{neighborhood.note}</p>
                        : <>
                            <p className="text-[10px] text-slate-400 mb-2">{neighborhood.note}</p>
                            <div className="space-y-2">
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-600">自店舗 平均単価</span>
                                        <span className="font-black text-blue-600">¥{Math.round(neighborhood.my.avg_amount).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">エリア平均</span>
                                        <span className="font-bold text-slate-500">¥{Math.round(neighborhood.neighborhood.avg_amount).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="pt-1 border-t border-blue-100 flex justify-between text-xs">
                                    <span className="text-slate-600">自店舗 注文数</span>
                                    <span className="font-black text-blue-600">{neighborhood.my.orders}件</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">エリア平均 注文数</span>
                                    <span className="font-bold text-slate-500">{neighborhood.neighborhood.orders_per_store}件/店</span>
                                </div>
                            </div>
                        </>
                    }
                </div>
            </div>
        </section>
    )
}

// ────────────────────────────────────────────────────
// 사진 갤러리 섹션 공통 컴포넌트
// ────────────────────────────────────────────────────
function PhotoGallerySection({ icon, title, desc, photos, onAdd, onRemove, inputRef, onUpload, max }) {
    return (
        <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h3 className="font-black flex items-center gap-2 mb-2">{icon} {title}</h3>
            <p className="text-xs text-slate-400 mb-4">{desc}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {photos.map((url, idx) => (
                    <div key={idx} className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden group">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                            onClick={() => onRemove(idx)}
                            className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Trash2 className="w-3.5 h-3.5 text-white" />
                        </button>
                    </div>
                ))}
                {photos.length < max && (
                    <button
                        onClick={onAdd}
                        className="aspect-square border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-rose-300 hover:text-rose-500 transition-colors"
                    >
                        <Upload className="w-5 h-5" />
                        <span className="text-[10px] font-bold">追加</span>
                    </button>
                )}
            </div>
            <input ref={inputRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
        </section>
    )
}
