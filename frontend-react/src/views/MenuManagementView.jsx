import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext'
import { AdminNavBar } from './AdminView'
import MenuGroupsSection from '../components/MenuGroupsSection'
import { currencyHelpers } from '../config/currency'

export default function MenuManagementView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()

    const { t } = useLanguage()

    const [storeData, setStoreData] = useState(null)
    const cur = currencyHelpers(storeData)
    const [menus, setMenus] = useState([])
    const [categories, setCategories] = useState([])
    const [activeCategory, setActiveCategory] = useState('All')
    const [loading, setLoading] = useState(true)
    const [newCategory, setNewCategory] = useState('')
    const [showCatManager, setShowCatManager] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    const [uploadingMenuId, setUploadingMenuId] = useState(null)
    const imageInputRef = useRef(null)
    const [editTargetId, setEditTargetId] = useState(null)

    // Inline edit modal state
    const [editingMenu, setEditingMenu] = useState(null)
    const [editForm, setEditForm] = useState({ name_jp: '', description_jp: '', price: 0, category: '', allergens: [] })
    const [takeoutBlockedMsg, setTakeoutBlockedMsg] = useState(false)

    const extractArray = (res) => {
        if (!res) return [];
        if (Array.isArray(res)) return res;
        if (res.data) {
            if (Array.isArray(res.data)) return res.data;
            if (Array.isArray(res.data.data)) return res.data.data;
            if (Array.isArray(res.data.items)) return res.data.items;
            if (Array.isArray(res.data.menus)) return res.data.menus;
        }
        return [];
    };

    const fetchMenus = async () => {
        try {
            setLoading(true)
            const [storeRes, res] = await Promise.all([
                axios.get(`/api/stores/${shop_id}`).catch(() => null),
                axios.get(`/api/menus/${shop_id}`)
            ])
            
            if (storeRes && storeRes.data) {
                setStoreData(storeRes.data?.data || storeRes.data)
            }

            const data = extractArray(res);
            setMenus(data)

            const cats = Array.from(new Set(data.map(m => m.category).filter(Boolean)))
            setCategories(cats)
        } catch (e) {
            console.error("Failed to fetch menus", e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchMenus()
    }, [shop_id])

    const toggleSoldOut = async (menuId, isAvailable) => {
        try {
            const newStatus = !isAvailable
            setMenus(prev => (Array.isArray(prev) ? prev : []).map(m => m.id === menuId ? { ...m, is_available: newStatus } : m))
            await axios.patch(`/api/menus/${menuId}/availability?is_available=${newStatus}`)
        } catch (e) {
            console.error("Failed to update status", e)
            alert("상태 업데이트 실패. 다시 시도해주세요.")
            fetchMenus()
        }
    }

    const toggleTakeout = async (menuId, current) => {
        const next = !current
        if (next && !storeData?.takeout_enabled) {
            setTakeoutBlockedMsg(true)
            setTimeout(() => setTakeoutBlockedMsg(false), 3000)
            return
        }
        try {
            setMenus(prev => (Array.isArray(prev) ? prev : []).map(m => m.id === menuId ? { ...m, is_takeout_available: next } : m))
            await axios.put(`/api/menus/${menuId}`, { is_takeout_available: next })
        } catch (e) {
            console.error("Failed to update takeout", e)
            fetchMenus()
        }
    }

    const toggleDailySpecial = async (menuId, current) => {
        try {
            const next = !current
            setMenus(prev => (Array.isArray(prev) ? prev : []).map(m => m.id === menuId ? { ...m, is_daily_special: next, special_price: next ? m.special_price : null } : m))
            await axios.put(`/api/menus/${menuId}`, { is_daily_special: next, special_price: next ? undefined : null })
        } catch (e) {
            console.error("Failed to update daily special", e)
            fetchMenus()
        }
    }

    const updateSpecialPrice = async (menuId, price) => {
        try {
            const val = price === '' || price === null ? null : parseInt(price)
            setMenus(prev => (Array.isArray(prev) ? prev : []).map(m => m.id === menuId ? { ...m, special_price: val } : m))
            await axios.put(`/api/menus/${menuId}`, { special_price: val })
        } catch (e) {
            console.error("Failed to update special price", e)
            fetchMenus()
        }
    }

    const handleDelete = async (menuId) => {
        if (!window.confirm("정말로 이 메뉴를 삭제하시겠습니까?")) return;
        try {
            await axios.delete(`/api/menus/${menuId}`)
            setMenus(prev => (Array.isArray(prev) ? prev : []).filter(m => m.id !== menuId))
        } catch (e) {
            console.error("Failed to delete menu", e)
            alert("메뉴 삭제 실패.")
        }
    }

    const handleImageUpload = async (menuId, file) => {
        if (!file || !file.type.startsWith('image/')) {
            alert('이미지 파일만 업로드할 수 있습니다.')
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            alert('파일 크기가 10MB를 초과합니다.')
            return
        }

        setUploadingMenuId(menuId)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('store_id', shop_id)

            const uploadRes = await axios.post('/api/menus/upload-image', fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })

            const newImageUrl = uploadRes.data.image_url

            await axios.put(`/api/menus/${menuId}`, { image_url: newImageUrl })

            setMenus(prev => prev.map(m => m.id === menuId ? { ...m, image_url: newImageUrl } : m))
        } catch (err) {
            console.error('이미지 업로드 실패:', err)
            alert('이미지 업로드 실패: ' + (err.response?.data?.detail || err.message))
        } finally {
            setUploadingMenuId(null)
            setEditTargetId(null)
        }
    }

    const triggerImageUpload = (menuId) => {
        setEditTargetId(menuId)
        imageInputRef.current?.click()
    }

    const onFileSelected = (e) => {
        const file = e.target.files?.[0]
        if (file && editTargetId) {
            handleImageUpload(editTargetId, file)
        }
        e.target.value = ''
    }

    const openEditModal = (item) => {
        setEditingMenu(item)
        let parsedAllergens = []
        try { parsedAllergens = JSON.parse(item.allergens || '[]') } catch {}
        setEditForm({
            name_jp: item.name_jp || item.name || '',
            description_jp: item.description_jp || item.description || '',
            price: item.price || 0,
            category: item.category || '',
            allergens: Array.isArray(parsedAllergens) ? parsedAllergens : [],
        })
    }

    const saveEdit = async () => {
        if (!editingMenu) return
        try {
            await axios.put(`/api/menus/${editingMenu.id}`, {
                ...editForm,
                allergens: JSON.stringify(editForm.allergens),
            })
            setMenus(prev => prev.map(m => m.id === editingMenu.id ? { ...m, ...editForm } : m))
            setEditingMenu(null)
        } catch (e) {
            console.error('メニュー更新失敗:', e)
            alert('更新に失敗しました。')
        }
    }

    const filteredMenus = useMemo(() => {
        const safeMenus = Array.isArray(menus) ? menus : [];
        let filtered = safeMenus;
        
        if (activeCategory !== 'All') {
            filtered = filtered.filter(m => m.category === activeCategory)
        }
        
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(m => 
                (m.name_jp || m.name)?.toLowerCase().includes(q) ||
                (m.description_jp || m.description)?.toLowerCase().includes(q)
            )
        }
        return filtered;
    }, [menus, activeCategory, searchQuery])

    if (loading) return <div className="p-12 text-center text-adminprimary animate-pulse font-bold">Loading...</div>

    return (
        <div className="min-h-screen bg-[#f8f6f6] tsubaki-pattern-bg font-display flex flex-col">
            <AdminNavBar storeData={storeData} shop_id={shop_id} />

            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .tsubaki-card-hover { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .tsubaki-card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 24px -10px rgba(194, 30, 47, 0.2); border-color: rgba(194, 30, 47, 0.3); }
            `}</style>

            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileSelected}
            />

            <main className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8 flex-1">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <span className="material-symbols-outlined text-adminprimary bg-adminprimary/5 p-2 rounded-xl">restaurant_menu</span>
                            {t('admin.menu.title') || 'Menu Management'}
                        </h2>
                        <p className="text-slate-500 mt-2 font-medium">{t('admin.menu.manage_your_offerings') || 'Manage your offerings'} <span className="text-adminprimary font-bold">({menus.length})</span></p>
                    </div>
                    <button onClick={() => navigate(`/${shop_id}/admin/menu/new`)} 
                        className="bg-gradient-to-r from-[#c21e2f] to-[#991825] hover:from-[#a81928] hover:to-[#7f131f] text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-adminprimary/30 transition-all hover:shadow-xl hover:-translate-y-0.5"
                    >
                        <span className="material-symbols-outlined font-bold">add</span>
                        {t('admin.operation.add') || '追加'}
                    </button>
                </div>

                <div className="bg-white/80 rounded-2xl shadow-sm border border-adminprimary/10 p-4 sticky top-20 z-40 backdrop-blur-xl">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 hide-scrollbar flex-1">
                            <button onClick={() => setActiveCategory('All')} 
                                className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all ${activeCategory === 'All' ? 'bg-adminprimary text-white shadow-md shadow-adminprimary/20 scale-105' : 'bg-slate-100/80 hover:bg-adminprimary/10 text-slate-600'}`}>
                                {t('admin.menu.all_items') || 'All Items'}
                            </button>
                            {categories.map(cat => (
                                <button key={cat} onClick={() => setActiveCategory(cat)} 
                                    className={`px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-adminprimary text-white shadow-md shadow-adminprimary/20 scale-105' : 'bg-slate-100/80 hover:bg-adminprimary/10 text-slate-600'}`}>
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3 w-full lg:w-auto">
                            <div className="relative flex-1 lg:w-64">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                                <input 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-adminprimary focus:border-adminprimary transition-colors outline-none" 
                                    placeholder="Menu search..." 
                                    type="text" 
                                />
                            </div>
                            <button
                                onClick={() => setShowCatManager(!showCatManager)}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap border ${showCatManager ? 'bg-adminprimary/10 border-adminprimary/30 text-adminprimary' : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'}`}
                            >
                                <span className="material-symbols-outlined text-[18px]">category</span>
                                {t('admin.menu.category_manage') || 'カテゴリ管理'}
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                    {showCatManager && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col md:flex-row gap-6">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-3">
                                        <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)}
                                            placeholder={t('admin.menu.new_category') || '新しいカテゴリ名...'}
                                            className="w-full max-w-sm px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-adminprimary outline-none"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && newCategory.trim()) {
                                                    if (!categories.includes(newCategory.trim())) setCategories(prev => [...prev, newCategory.trim()]);
                                                    setNewCategory('');
                                                }
                                            }}
                                        />
                                        <button onClick={() => {
                                                if (newCategory.trim() && !categories.includes(newCategory.trim())) setCategories(prev => [...prev, newCategory.trim()]);
                                                setNewCategory('');
                                            }}
                                            className="px-5 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors"
                                        >
                                            {t('admin.operation.add') || '追加'}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-amber-600 bg-amber-50 px-3 py-1.5 rounded inline-block font-medium">※ メニューが紐づいているカテゴリは削除できません。</p>
                                </div>
                                <div className="flex-[2] flex flex-wrap gap-2 content-start">
                                    {categories.map(cat => {
                                        const count = menus.filter(m => m.category === cat).length;
                                        return (
                                            <div key={cat} className="flex items-center gap-1.5 px-3 py-1.5 bg-adminprimary/5 rounded-full border border-adminprimary/20">
                                                <span className="text-sm font-bold text-adminprimary">{cat}</span>
                                                <span className="text-xs text-adminprimary/60 font-black tracking-tighter">({count})</span>
                                                {count === 0 && (
                                                    <button onClick={() => setCategories(prev => prev.filter(c => c !== cat))} className="ml-1 text-red-400 hover:text-red-600">
                                                        <span className="material-symbols-outlined text-sm block">close</span>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>
                </div>

                <MenuGroupsSection shop_id={shop_id} allMenus={menus} store={storeData} />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                    <AnimatePresence>
                    {filteredMenus.map((item, idx) => (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: (idx % 10) * 0.05, ease: "easeOut" }} key={item.id} 
                            className="bg-white border border-adminprimary/10 rounded-2xl overflow-hidden flex flex-col tsubaki-card-hover group cursor-pointer relative shadow-sm">
                            
                            <div className="h-44 bg-slate-100 relative" onClick={() => triggerImageUpload(item.id)} title="画像をアップロード">
                                {uploadingMenuId === item.id ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-adminprimary/10 backdrop-blur-sm z-10">
                                        <div className="w-8 h-8 border-4 border-adminprimary border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                ) : (
                                    <>
                                        {item.image_url ? (
                                            <img alt={item.name_jp || item.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src={item.image_url} />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                                <span className="material-symbols-outlined text-4xl mb-1">image</span>
                                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">No Image</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px] z-10">
                                            <span className="material-symbols-outlined text-white text-3xl">add_a_photo</span>
                                        </div>
                                    </>
                                )}
                                <div className="absolute top-3 left-3 flex gap-1.5">
                                    <span className="px-2 py-1 bg-white/90 backdrop-blur-sm shadow-sm rounded-lg text-[10px] font-black text-adminprimary uppercase tracking-widest border border-white">
                                        {item.category || 'NO CATEGORY'}
                                    </span>
                                    {item.is_daily_special && (
                                        <span className="px-2 py-1 bg-amber-500 shadow-sm rounded-lg text-[10px] font-black text-white uppercase tracking-widest">
                                            SPECIAL
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 md:p-5 flex-1 flex flex-col bg-white">
                                <div className="flex justify-between items-start gap-3 mb-2">
                                    <h3 className="font-extrabold text-lg text-slate-900 leading-snug line-clamp-2">{item.name_jp || item.name}</h3>
                                    <div className="text-right shrink-0">
                                        {item.is_daily_special && item.special_price != null ? (
                                            <>
                                                <span className="font-black text-lg text-amber-600 px-2 rounded-lg bg-amber-50 border border-amber-200 whitespace-nowrap">{cur.fmt(item.special_price)}</span>
                                                <div className="text-xs text-slate-400 line-through mt-0.5">{cur.fmt(item.price)}</div>
                                            </>
                                        ) : (
                                            <span className="font-black text-lg text-adminprimary px-2 rounded-lg bg-adminprimary/5 border border-adminprimary/10 whitespace-nowrap">{cur.fmt(item.price)}</span>
                                        )}
                                    </div>
                                </div>
                                {item.is_daily_special && (
                                    <div className="flex items-center gap-2 mb-2 p-2 bg-amber-50 rounded-lg border border-amber-200/50">
                                        <span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">SPECIAL ¥</span>
                                        <input
                                            type="number"
                                            value={item.special_price ?? ''}
                                            placeholder={String(item.price)}
                                            onChange={e => {
                                                const val = e.target.value === '' ? null : parseInt(e.target.value)
                                                setMenus(prev => prev.map(m => m.id === item.id ? { ...m, special_price: val } : m))
                                            }}
                                            onBlur={e => updateSpecialPrice(item.id, e.target.value)}
                                            className="w-20 px-2 py-1 text-sm font-bold bg-white border border-amber-300 rounded-md text-amber-800 focus:ring-1 focus:ring-amber-400 outline-none"
                                        />
                                    </div>
                                )}
                                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-2 flex-1">{item.description_jp || item.description}</p>
                                {(() => {
                                    try {
                                        const allergens = JSON.parse(item.allergens || '[]')
                                        if (allergens.length > 0) return (
                                            <div className="flex flex-wrap gap-1 mb-3">
                                                {allergens.map(a => (
                                                    <span key={a} className="text-[9px] font-bold px-1.5 py-0.5 bg-red-50 text-red-500 border border-red-200 rounded-full">{a}</span>
                                                ))}
                                            </div>
                                        )
                                    } catch {}
                                    return null
                                })()}
                                
                                <div className="pt-4 flex items-center justify-between gap-2 mt-auto">
                                    <div className="flex flex-col gap-1">
                                        <label className="relative inline-flex items-center cursor-pointer group/toggle w-fit">
                                            <input checked={!item.is_available} onChange={() => toggleSoldOut(item.id, item.is_available)} className="sr-only peer" type="checkbox" />
                                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c21e2f] group-hover/toggle:ring-2 ring-adminprimary/20"></div>
                                            <span className="ml-2 text-[10px] font-black text-slate-400 peer-checked:text-adminprimary uppercase tracking-wider">
                                                {!item.is_available ? t('admin.status.sold_out') || 'SOLD OUT' : t('admin.status.open') || '販売中'}
                                            </span>
                                        </label>
                                        <button onClick={() => toggleTakeout(item.id, item.is_takeout_available)} className={`flex items-center gap-1 text-[10px] font-bold transition-colors w-fit ${item.is_takeout_available ? 'text-amber-600 hover:text-amber-700' : 'text-slate-400 hover:text-slate-500'}`}>
                                            <span className="material-symbols-outlined text-[14px]">{(item.is_takeout_available) ? "takeout_dining" : "block"}</span>
                                            {item.is_takeout_available ? t('admin.menu.takeout_ok') || 'Takeout OK' : t('admin.menu.takeout_no') || 'No Takeout'}
                                        </button>
                                        <label className="relative inline-flex items-center cursor-pointer group/toggle w-fit">
                                            <input checked={!!item.is_daily_special} onChange={() => toggleDailySpecial(item.id, item.is_daily_special)} className="sr-only peer" type="checkbox" />
                                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 group-hover/toggle:ring-2 ring-amber-300/30"></div>
                                            <span className="ml-2 text-[10px] font-black text-slate-400 peer-checked:text-amber-600 uppercase tracking-wider">SPECIAL</span>
                                        </label>
                                    </div>
                                    <div className="flex gap-1.5 self-end opacity-20 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openEditModal(item)} className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-adminprimary/10 text-slate-400 hover:text-adminprimary flex items-center justify-center border border-transparent hover:border-adminprimary/20 transition-all">
                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                        </button>
                                        <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center border border-transparent hover:border-red-200 transition-all">
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                    </AnimatePresence>
                    
                    {filteredMenus.length === 0 && (
                        <div className="col-span-full py-24 flex flex-col items-center justify-center text-slate-400">
                            <span className="material-symbols-outlined text-6xl mb-4 text-adminprimary/20">restaurant_menu</span>
                            <p className="text-lg font-bold">{t('admin.menu.no_menus') || '등록된 메뉴가 없습니다.'}</p>
                            <p className="text-sm mt-1">검색 조건을 변경하거나 새 메뉴를 추가해보세요.</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Edit Menu Modal */}
            <AnimatePresence>
                {editingMenu && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
                        onClick={() => setEditingMenu(null)}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}>
                            <div className="px-6 py-4 bg-gradient-to-r from-[#c21e2f] to-[#991825] text-white flex items-center justify-between">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <span className="material-symbols-outlined">edit_note</span>
                                    メニュー編集
                                </h3>
                                <button onClick={() => setEditingMenu(null)} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">メニュー名</label>
                                    <input type="text" value={editForm.name_jp}
                                        onChange={e => setEditForm(prev => ({ ...prev, name_jp: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-adminprimary focus:border-adminprimary outline-none transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">説明</label>
                                    <textarea value={editForm.description_jp}
                                        onChange={e => setEditForm(prev => ({ ...prev, description_jp: e.target.value }))}
                                        rows={3}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-adminprimary focus:border-adminprimary outline-none transition-colors resize-none" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">価格 (¥)</label>
                                        <input type="number" value={editForm.price}
                                            onChange={e => setEditForm(prev => ({ ...prev, price: parseInt(e.target.value) || 0 }))}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-adminprimary focus:border-adminprimary outline-none transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">カテゴリ</label>
                                        <select value={editForm.category}
                                            onChange={e => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-adminprimary focus:border-adminprimary outline-none transition-colors">
                                            <option value="">未設定</option>
                                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">⚠️ アレルゲン</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { key: 'wheat', label: '🌾小麦' }, { key: 'egg', label: '🥚卵' },
                                            { key: 'dairy', label: '🥛乳' }, { key: 'buckwheat', label: '🍜そば' },
                                            { key: 'peanut', label: '🥜落花生' }, { key: 'shrimp', label: '🦐えび' },
                                            { key: 'crab', label: '🦀かに' }, { key: 'soybean', label: '🫘大豆' },
                                            { key: 'walnut', label: '🌰くるみ' }, { key: 'beef', label: '🐄牛肉' },
                                            { key: 'pork', label: '🐷豚肉' }, { key: 'chicken', label: '🐔鶏肉' },
                                            { key: 'sesame', label: '🌿ごま' },
                                        ].map(({ key, label }) => {
                                            const active = editForm.allergens.includes(key)
                                            return (
                                                <button key={key} type="button"
                                                    onClick={() => setEditForm(prev => ({
                                                        ...prev,
                                                        allergens: active
                                                            ? prev.allergens.filter(a => a !== key)
                                                            : [...prev.allergens, key]
                                                    }))}
                                                    className={`px-2 py-1 rounded-full text-xs font-bold border transition-all ${active
                                                        ? 'bg-red-500 text-white border-red-500'
                                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-red-300'}`}
                                                >{label}</button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button onClick={() => setEditingMenu(null)}
                                    className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">
                                    キャンセル
                                </button>
                                <button onClick={saveEdit}
                                    className="px-6 py-2.5 bg-gradient-to-r from-[#c21e2f] to-[#991825] text-white rounded-xl text-sm font-bold shadow-lg shadow-adminprimary/30 hover:shadow-xl transition-all">
                                    保存
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {takeoutBlockedMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div className="bg-white rounded-2xl shadow-2xl border border-amber-200 px-6 py-5 max-w-sm w-full pointer-events-auto">
                            <div className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-amber-500 text-[28px]">warning</span>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-slate-800 mb-1">テイクアウトが無効です</p>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        「運営管理」ページでテイクアウトを ON にしてください。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
