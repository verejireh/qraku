import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { currencyHelpers } from '../config/currency'
import axios from 'axios'
import { useLanguage } from '../context/LanguageContext'
import { AdminNavBar } from './AdminView'

export default function AdminMenuRegisterView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()

    const { t, setLanguage, languageNames } = useLanguage()
    const [showOptionGuide, setShowOptionGuide] = useState(false)

    const [isLoading, setIsLoading] = useState(false)
    const [storeData, setStoreData] = useState(null)
    // 매장 통화 — 가격은 최소단위 정수로 저장(JP=엔/GB=펜스). 입력은 major, 저장 시 변환.
    const cur = currencyHelpers(storeData)
    const [useAiBackground, setUseAiBackground] = useState(true)

    // 이미지 업로드 관련 state
    const [imageFile, setImageFile] = useState(null)
    const [imagePreview, setImagePreview] = useState(null)
    const [uploadedImageUrl, setUploadedImageUrl] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadError, setUploadError] = useState(null)

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        translations: {}, // Dynamic: { en: {name: '..', description: '..'}, ko: ... }
        category: '',
        options: [], // e.g., [{group_name: 'Size', choices: [{name: 'Large', extra_price: 150}]}]
        is_takeout_available: false,
        allergens: [],
    })

    // Highlight fields that were auto-translated to prompt manual review
    const [highlightedFields, setHighlightedFields] = useState({})

    // Dynamic categories fetched from existing menus
    const [categories, setCategories] = useState([])
    const [newCategoryInput, setNewCategoryInput] = useState('')
    const [categoriesLoading, setCategoriesLoading] = useState(true)

    useEffect(() => {
        setLanguage('ja')
        fetchStoreData()
        fetchCategories()
    }, [setLanguage, shop_id])

    const fetchCategories = async () => {
        setCategoriesLoading(true)
        try {
            const res = await axios.get(`/api/menus/${shop_id}`)
            const rawMenus = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || [])
            const uniqueCategories = [...new Set(rawMenus.map(m => m.category).filter(Boolean))]
            setCategories(uniqueCategories)
            // Auto-select first category if available
            if (uniqueCategories.length > 0) {
                setFormData(prev => prev.category ? prev : { ...prev, category: uniqueCategories[0] })
            }
        } catch (e) {
            console.error("Failed to fetch categories", e)
        } finally {
            setCategoriesLoading(false)
        }
    }

    const handleAddCategory = () => {
        const trimmed = newCategoryInput.trim()
        if (!trimmed) return
        if (categories.includes(trimmed)) {
            setNewCategoryInput('')
            setFormData(prev => ({ ...prev, category: trimmed }))
            return
        }
        setCategories(prev => [...prev, trimmed])
        setFormData(prev => ({ ...prev, category: trimmed }))
        setNewCategoryInput('')
    }

    const fetchStoreData = async () => {
        try {
            const res = await axios.get(`/api/stores/${shop_id}`)
            setStoreData(res.data)
            // Initialize translations based on supported_languages
            if (res.data.supported_languages) {
                const langs = res.data.supported_languages.split(',')
                const initialTranslations = {}
                langs.forEach(l => {
                    const cleanLang = l.trim()
                    if (cleanLang && cleanLang !== 'ja') {
                        initialTranslations[cleanLang] = { name: '', description: '' }
                    }
                })
                setFormData(prev => ({ ...prev, translations: initialTranslations }))
            }
        } catch (e) {
            console.error("Failed to fetch store data", e)
        }
    }

    const handleInputChange = (e) => {
        const { name, value } = e.target

        // Remove highlight warning when owner manually edits the auto-translated field
        setHighlightedFields(prev => {
            if (prev[name]) {
                const newHighlights = { ...prev }
                delete newHighlights[name]
                return newHighlights
            }
            return prev
        })

        if (name.startsWith('trans_')) {
            // e.g. trans_en_name or trans_ko_description
            const parts = name.split('_')
            const langCode = parts[1]
            const fieldType = parts.slice(2).join('_') // name or description

            setFormData(prev => ({
                ...prev,
                translations: {
                    ...prev.translations,
                    [langCode]: {
                        ...prev.translations[langCode],
                        [fieldType]: value
                    }
                }
            }))
        } else {
            setFormData(prev => ({ ...prev, [name]: value }))
        }
    }

    // 이미지 파일 선택 핸들러
    const handleImageSelect = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        // 이미지 파일 검증
        if (!file.type.startsWith('image/')) {
            setUploadError('이미지 파일만 업로드할 수 있습니다.')
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            setUploadError('파일 크기가 10MB를 초과합니다.')
            return
        }

        setImageFile(file)
        setUploadError(null)

        // 로컬 미리보기 생성
        const reader = new FileReader()
        reader.onload = (ev) => setImagePreview(ev.target.result)
        reader.readAsDataURL(file)

        // 서버에 업로드 (자동 리사이즈 + WebP 변환)
        setIsUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('store_id', storeData?.id || shop_id)

            const res = await axios.post('/api/menus/upload-image', fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })

            setUploadedImageUrl(res.data.image_url)
            setUploadError(null)
        } catch (err) {
            console.error('Image upload failed:', err)
            setUploadError(err.response?.data?.detail || '이미지 업로드에 실패했습니다.')
            setUploadedImageUrl(null)
        } finally {
            setIsUploading(false)
        }
    }

    const setCategory = (cat) => {
        setFormData(prev => ({ ...prev, category: cat }))
    }

    // --- Options Handlers ---
    const addOptionGroup = () => {
        setFormData(prev => ({
            ...prev,
            options: [...prev.options, { group_name: '', choices: [{ name: '', extra_price: 0 }] }]
        }))
    }

    const removeOptionGroup = (gIdx) => {
        setFormData(prev => ({
            ...prev,
            options: prev.options.filter((_, i) => i !== gIdx)
        }))
    }

    const handleOptionGroupChange = (gIdx, newName) => {
        setFormData(prev => {
            const newOps = [...prev.options];
            newOps[gIdx].group_name = newName;
            return { ...prev, options: newOps };
        })
    }

    const addOptionChoice = (gIdx) => {
        setFormData(prev => {
            const newOps = [...prev.options];
            newOps[gIdx].choices.push({ name: '', extra_price: 0 });
            return { ...prev, options: newOps };
        })
    }

    const removeOptionChoice = (gIdx, cIdx) => {
        setFormData(prev => {
            const newOps = [...prev.options];
            newOps[gIdx].choices.splice(cIdx, 1);
            return { ...prev, options: newOps };
        })
    }

    const handleOptionChoiceChange = (gIdx, cIdx, field, val) => {
        setFormData(prev => {
            const newOps = [...prev.options];
            newOps[gIdx].choices[cIdx][field] = field === 'extra_price' ? Number(val) : val;
            return { ...prev, options: newOps };
        })
    }

    const handleTranslate = async () => {
        if (!formData.name) {
            alert("먼저 일본어 메뉴 이름을 입력해주세요.")
            return
        }

        const targetLangs = Object.keys(formData.translations)
        // If no supported target languages exist, we can still request 'ja' rewrite or just skip?
        // We will include 'ja' so the rewrite always happens.
        const requestLangs = [...targetLangs, 'ja']
        
        setIsLoading(true)
        try {
            // New Batch API Request for both name and description
            const res = await axios.post('/api/translate/', {
                name_ja: formData.name,
                description_ja: formData.description || "",
                target_langs: requestLangs
            })

            const translatedData = res.data // { "ko": {"name": "..", "description": ".."}, ... }

            const newTranslations = { ...formData.translations }
            const newHighlights = { ...highlightedFields }
            
            let updatedNameJa = formData.name
            let updatedDescJa = formData.description

            Object.keys(translatedData).forEach(lang => {
                if (lang === 'ja') {
                    updatedNameJa = translatedData[lang].name || updatedNameJa
                    updatedDescJa = translatedData[lang].description || updatedDescJa
                } else {
                    newTranslations[lang] = {
                        name: translatedData[lang].name || "",
                        description: translatedData[lang].description || ""
                    }

                    // Highlight fields if they successfully received auto-translated text
                    if (translatedData[lang].name) newHighlights[`trans_${lang}_name`] = true
                    if (translatedData[lang].description) newHighlights[`trans_${lang}_description`] = true
                }
            })

            setFormData(prev => ({ 
                ...prev, 
                name: updatedNameJa,
                description: updatedDescJa,
                translations: newTranslations 
            }))
            setHighlightedFields(newHighlights) // Set warning colors for review mode

        } catch (e) {
            console.error("Translation failed", e)
            alert("자동 번역에 실패했습니다: " + (e.response?.data?.detail || e.message))
        } finally {
            setIsLoading(false)
        }
    }

    const handleSubmit = async () => {
        if (!formData.name || !formData.price) {
            alert("메뉴 이름(일본어)과 가격은 필수 입력 항목입니다.")
            return
        }
        if (!formData.category) {
            alert("カテゴリを選択してください。")
            return
        }

        setIsLoading(true)
        try {
            // Standard fields
            const payload = {
                store_id: parseInt(storeData?.id || shop_id),

                name_jp: formData.name,
                description_jp: formData.description || null,

                name_en: formData.translations.en?.name || null,
                name_ko: formData.translations.ko?.name || null,
                name_zh: formData.translations.zh?.name || null,

                description_en: formData.translations.en?.description || null,
                description_ko: formData.translations.ko?.description || null,
                description_zh: formData.translations.zh?.description || null,

                price: cur.toMinorUnits(formData.price),   // major 입력 → 최소단위 정수
                category: formData.category,
                image_url: uploadedImageUrl || null,
                is_takeout_available: formData.is_takeout_available,
                options: JSON.stringify(
                    formData.options
                        .filter(g => g.group_name.trim() !== '')
                        .map(g => ({
                            ...g,
                            choices: g.choices.map(c => ({ ...c, extra_price: cur.toMinorUnits(c.extra_price) })),
                        }))
                ),
                allergens: JSON.stringify(formData.allergens),
            }

            // Other arbitrary dynamic languages go into extra_translations mapped string JSON
            const extra = {}
            Object.entries(formData.translations).forEach(([code, valObj]) => {
                if (!['en', 'ko', 'zh'].includes(code)) {
                    extra[code] = valObj
                }
            })
            payload.extra_translations = JSON.stringify(extra)

            await axios.post('/api/menus/', payload)

            // Success! Route back to menu management
            navigate(`/${shop_id}/admin/menu`)
        } catch (e) {
            console.error("Failed to register menu", e)
            alert("메뉴 등록 실패: " + (e.response?.data?.detail || e.message))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#f8f6f6] text-slate-900 font-display relative z-0">
            {/* Custom Background and Gradients */}
            <style>{`
                .tsubaki-gradient { background: linear-gradient(135deg, #c21e2f 0%, #7f1d1d 100%); }
                .tsubaki-pattern-bg { background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='3' fill='%23c21e2f' fill-opacity='0.05'/%3E%3Ccircle cx='10' cy='10' r='2' fill='%23c21e2f' fill-opacity='0.04'/%3E%3Ccircle cx='50' cy='50' r='2' fill='%23c21e2f' fill-opacity='0.04'/%3E%3C/svg%3E"); }
            `}</style>

            {/* Unified Navigation Header */}
            <AdminNavBar shop_id={shop_id} />

            {/* Main Form Area */}
            <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 md:p-8 gap-8 tsubaki-pattern-bg">
                {/* Progress Header */}
                <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-900">{t('admin.register.title')}</h1>
                            <p className="text-slate-500 text-sm">{t('admin.register.subtitle')}</p>
                        </div>
                        <p className="text-adminprimary font-bold text-sm">{t('admin.register.step')} 1 / 3</p>
                    </div>
                    <div className="w-full bg-adminprimary/10 h-3 rounded-full overflow-hidden">
                        <div className="bg-adminprimary h-full rounded-full transition-all duration-500" style={{ width: "33%" }}></div>
                    </div>
                </div>

                {/* 1. Photo Upload Section */}
                <section className="bg-white rounded-xl p-6 shadow-sm border border-adminprimary/10 transition-colors">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="bg-adminprimary text-white size-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                        <h3 className="font-bold text-lg">{t('admin.register.upload_photo')}</h3>
                    </div>
                    {/* 숨김 파일 input */}
                    <input
                        id="menu-image-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageSelect}
                    />

                    <div
                        className="flex flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed border-adminprimary/30 bg-adminprimary/5 px-6 py-12 hover:bg-adminprimary/10 transition-colors cursor-pointer group relative overflow-hidden"
                        onClick={() => document.getElementById('menu-image-input').click()}
                    >
                        {/* 업로드 진행 오버레이 */}
                        {isUploading && (
                            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm">
                                <div className="w-10 h-10 border-4 border-adminprimary border-t-transparent rounded-full animate-spin mb-3"></div>
                                <p className="font-bold text-adminprimary text-sm">이미지 최적화 중... (WebP 변환)</p>
                            </div>
                        )}

                        {/* 미리보기 또는 기본 UI */}
                        {imagePreview ? (
                            <div className="flex flex-col items-center gap-4">
                                <img src={imagePreview} alt="메뉴 미리보기" className="w-48 h-48 object-cover rounded-xl shadow-lg border-2 border-adminprimary/20" />
                                <div className="text-center">
                                    <p className="text-slate-900 font-bold">
                                        {uploadedImageUrl ? '✅ WebP 변환 완료!' : imageFile?.name}
                                    </p>
                                    <p className="text-slate-500 text-xs mt-1">클릭하여 다른 이미지 선택</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="bg-white p-4 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-adminprimary text-4xl">add_a_photo</span>
                                </div>
                                <div className="text-center">
                                    <p className="text-slate-900 text-xl font-bold">{t('admin.register.snap_or_drop')}</p>
                                    <p className="text-slate-500 text-sm mt-1">自動でリサイズ + WebP 変換されます</p>
                                </div>
                                <button
                                    type="button"
                                    className="bg-adminprimary hover:bg-adminprimary/90 text-white font-bold py-3 px-8 rounded-lg shadow-lg shadow-adminprimary/20 transition-all"
                                >
                                    {t('admin.register.choose_file')}
                                </button>
                            </>
                        )}
                    </div>

                    {/* 업로드 에러 메시지 */}
                    {uploadError && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-red-500 text-sm">error</span>
                            <p className="text-red-600 text-sm font-medium">{uploadError}</p>
                        </div>
                    )}

                    {/* AI Toggle */}
                    <div className="mt-6 flex items-center justify-between p-4 bg-adminprimary/5 rounded-lg border border-adminprimary/10">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-adminprimary">magic_button</span>
                            <div>
                                <p className="font-bold text-slate-900">{t('admin.register.ai_bg_removal')}</p>
                                <p className="text-xs text-slate-500">{t('admin.register.ai_bg_desc')}</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                checked={useAiBackground}
                                onChange={() => setUseAiBackground(!useAiBackground)}
                                className="sr-only peer"
                                type="checkbox"
                            />
                            <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-6 after:transition-all peer-checked:bg-adminprimary"></div>
                        </label>
                    </div>
                </section>

                {/* 2. Details & Auto-Translation */}
                <section className="bg-white rounded-xl p-6 shadow-sm border border-adminprimary/10 transition-colors">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <span className="bg-adminprimary text-white size-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                            <h3 className="font-bold text-lg">{t('admin.register.menu_details')}</h3>
                        </div>
                        <button
                            onClick={handleTranslate}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-adminprimary/10 hover:bg-adminprimary/20 hover:scale-105 text-adminprimary rounded-lg font-bold text-sm transition-all border border-adminprimary/30 shadow-sm"
                        >
                            <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                            {t('admin.register.ai_translate')}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Main Japanese Input block */}
                        <div className="col-span-1 md:col-span-2 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('admin.register.item_name')} *</label>
                                <input
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    className="w-full text-xl p-4 rounded-lg border-2 border-adminprimary/20 focus:border-adminprimary outline-none focus:ring-0 bg-[#f8f6f6]/50 transition-all text-slate-900"
                                    placeholder="例: 特製桜ラーメン"
                                    type="text"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('admin.register.description')}</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    className="w-full p-4 rounded-lg border-2 border-adminprimary/20 focus:border-adminprimary outline-none focus:ring-0 bg-[#f8f6f6]/50 transition-all text-slate-900 resize-none"
                                    placeholder="Briefly describe the menu item..."
                                    rows="3"
                                />
                            </div>
                        </div>

                        {/* Price */}
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-2">{t('admin.register.price')} ({cur.symbol}) *</label>
                            <input
                                name="price"
                                value={formData.price}
                                onChange={handleInputChange}
                                className="w-full text-xl p-4 rounded-lg border-2 border-adminprimary/20 focus:border-adminprimary outline-none focus:ring-0 bg-[#f8f6f6]/50 transition-all text-slate-900"
                                placeholder={cur.decimals > 0 ? '10.00' : '1200'}
                                type="number"
                                step={cur.decimals > 0 ? '0.01' : '1'}
                                min="0"
                            />
                        </div>

                        {/* Takeout Toggle */}
                        <div className="col-span-1 md:col-span-2">
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, is_takeout_available: !prev.is_takeout_available }))}
                                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                                    formData.is_takeout_available
                                        ? 'border-adminprimary bg-adminprimary/5'
                                        : 'border-slate-200 bg-white'
                                }`}
                            >
                                <span className="text-2xl">{formData.is_takeout_available ? '🥡' : '🍽️'}</span>
                                <div className="flex-1">
                                    <p className="font-bold text-sm text-slate-800">{t('admin.register.takeout_available')}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{t('admin.register.takeout_desc')}</p>
                                </div>
                                <div className={`w-12 h-6 rounded-full transition-colors relative ${formData.is_takeout_available ? 'bg-adminprimary' : 'bg-slate-200'}`}>
                                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${formData.is_takeout_available ? 'left-7' : 'left-1'}`} />
                                </div>
                            </button>
                        </div>

                        {/* Category Select */}
                        <div className="col-span-1 md:col-span-2 mt-2 mb-4">
                            <label className="block text-sm font-bold text-slate-500 mb-2">{t('admin.register.category')} *</label>
                            {categoriesLoading ? (
                                <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                                    <div className="w-4 h-4 border-2 border-adminprimary border-t-transparent rounded-full animate-spin"></div>
                                    カテゴリを読み込み中...
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-2">
                                        {categories.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => setCategory(cat)}
                                                className={`px-4 py-2 rounded-full border text-sm font-bold transition-colors ${formData.category === cat ? 'bg-adminprimary/10 border-adminprimary text-adminprimary bg-adminprimary/20' : 'border-slate-200 text-slate-500 hover:border-adminprimary hover:text-adminprimary'}`}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                    {categories.length === 0 && (
                                        <p className="text-slate-400 text-sm italic mb-2">カテゴリがありません。新しいカテゴリを追加してください。</p>
                                    )}
                                    {/* Add new category inline */}
                                    <div className="flex items-center gap-2 mt-3">
                                        <input
                                            value={newCategoryInput}
                                            onChange={(e) => setNewCategoryInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                                            className="flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:border-adminprimary outline-none text-sm bg-slate-50 transition-all"
                                            placeholder="新しいカテゴリ名を入力..."
                                        />
                                        <button
                                            onClick={handleAddCategory}
                                            disabled={!newCategoryInput.trim()}
                                            className="px-4 py-2 bg-adminprimary/10 hover:bg-adminprimary/20 text-adminprimary rounded-lg text-sm font-bold transition-colors border border-adminprimary/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-sm">add</span>
                                            {t('admin.common.add')}
                                        </button>
                                    </div>
                                    {!formData.category && (
                                        <p className="text-red-400 text-xs mt-2 font-bold">⚠ カテゴリを選択してください</p>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Options Builder UI */}
                        <div className="col-span-1 md:col-span-2 mt-2 mb-4 bg-slate-50 border border-adminprimary/20 rounded-xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-lg">{t('admin.register.custom_options')}</h4>
                                    <p className="text-xs text-slate-500">{t('admin.register.options_desc')}</p>
                                </div>
                                <button onClick={addOptionGroup} className="text-adminprimary bg-adminprimary/10 hover:bg-adminprimary/20 px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1 transition-colors">
                                    <span className="material-symbols-outlined text-sm">add</span> {t('admin.register.add_option_group')}
                                </button>
                            </div>

                            {/* Option Group Guide - Collapsible */}
                            <div className="mb-5">
                                <button
                                    onClick={() => setShowOptionGuide(!showOptionGuide)}
                                    className="flex items-center gap-2 text-sm text-adminprimary hover:text-adminprimary/80 font-bold transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">{showOptionGuide ? 'expand_less' : 'help'}</span>
                                    {t('admin.register.option_guide_title')}
                                </button>
                                {showOptionGuide && (
                                    <div className="mt-3 p-4 bg-white border border-adminprimary/15 rounded-xl shadow-sm">
                                        <p className="text-sm text-slate-600 mb-3 leading-relaxed">{t('admin.register.option_guide_desc')}</p>
                                        <img src="/option_group_guide.png" alt={t('admin.register.option_guide_title')} className="w-full rounded-lg border border-slate-200 shadow-sm" />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                {formData.options.map((group, gIdx) => (
                                    <div key={gIdx} className="border border-adminprimary/10 bg-white rounded-lg p-4 shadow-sm relative group">
                                        <button onClick={() => removeOptionGroup(gIdx)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="material-symbols-outlined text-lg">close</span>
                                        </button>
                                        <div className="mb-3 w-3/4">
                                            <label className="text-xs font-bold text-slate-500 mb-1 block">{t('admin.register.group_name')}</label>
                                            <input
                                                value={group.group_name}
                                                onChange={(e) => handleOptionGroupChange(gIdx, e.target.value)}
                                                className="w-full p-2 border border-slate-200 rounded-md focus:border-adminprimary outline-none bg-slate-50 text-sm"
                                                placeholder="e.g., サイズ (Size)"
                                            />
                                        </div>
                                        <div className="space-y-2 pl-4 border-l-2 border-adminprimary/20 relative">
                                            {group.choices.map((choice, cIdx) => (
                                                <div key={cIdx} className="flex items-center gap-2">
                                                    <input
                                                        value={choice.name}
                                                        onChange={(e) => handleOptionChoiceChange(gIdx, cIdx, 'name', e.target.value)}
                                                        className="flex-1 p-2 border border-slate-200 rounded-md focus:border-adminprimary outline-none bg-slate-50 text-sm"
                                                        placeholder={t('admin.register.option_name')}
                                                    />
                                                    <div className="relative w-28 flex-shrink-0">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">{cur.symbol}</span>
                                                        <input
                                                            type="number"
                                                            value={choice.extra_price}
                                                            onChange={(e) => handleOptionChoiceChange(gIdx, cIdx, 'extra_price', e.target.value)}
                                                            className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-md focus:border-adminprimary outline-none bg-slate-50 text-sm font-mono"
                                                            placeholder="0"
                                                            step={cur.decimals > 0 ? '0.01' : '1'}
                                                        />
                                                    </div>
                                                    <button onClick={() => removeOptionChoice(gIdx, cIdx)} className="text-slate-400 hover:text-red-500 mx-1">
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>
                                                </div>
                                            ))}
                                            <button onClick={() => addOptionChoice(gIdx)} className="mt-2 text-xs font-bold text-adminprimary flex items-center gap-1 hover:underline">
                                                <span className="material-symbols-outlined text-xs">add</span> {t('admin.register.add_choice')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Auto-Translations (Dynamic block for multi-lang inputs) */}
                        {Object.entries(formData.translations).map(([code, valueObj]) => (
                            <div key={code} className={`col-span-1 flex flex-col gap-3 p-5 border rounded-xl transition-colors ${Object.keys(highlightedFields).some(k => k.includes(`_${code}_`)) ? 'border-yellow-300 bg-yellow-50/50' : 'border-adminprimary/10 bg-white/50'}`}>
                                <h4 className="flex items-center justify-between text-sm font-bold text-slate-600">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm text-adminprimary">translate</span>
                                        {languageNames[code] || code.toUpperCase()} Translation
                                    </div>
                                    {Object.keys(highlightedFields).some(k => k.includes(`_${code}_`)) && (
                                        <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-1 rounded-md font-bold uppercase">Needs Review</span>
                                    )}
                                </h4>

                                <div className="space-y-3 mt-2">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 mb-1 block">Name</label>
                                        <input
                                            name={`trans_${code}_name`}
                                            value={valueObj.name}
                                            onChange={handleInputChange}
                                            className={`w-full p-3 rounded-lg border outline-none text-slate-900 transition-all ${highlightedFields[`trans_${code}_name`]
                                                ? 'border-yellow-400 bg-yellow-100/50 ring-2 ring-yellow-400/20'
                                                : 'border-slate-200 bg-slate-50 focus:border-adminprimary'
                                                }`}
                                            type="text"
                                            placeholder={`Name in ${code.toUpperCase()}`}
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-500 mb-1 block">Description</label>
                                        <textarea
                                            name={`trans_${code}_description`}
                                            value={valueObj.description}
                                            onChange={handleInputChange}
                                            className={`w-full p-3 rounded-lg border outline-none text-slate-900 transition-all resize-none ${highlightedFields[`trans_${code}_description`]
                                                ? 'border-yellow-400 bg-yellow-100/50 ring-2 ring-yellow-400/20'
                                                : 'border-slate-200 bg-slate-50 focus:border-adminprimary'
                                                }`}
                                            rows="3"
                                            placeholder={`Description in ${code.toUpperCase()}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 2.5 アレルゲン情報 */}
                <section className="bg-white rounded-xl p-6 shadow-sm border border-adminprimary/10">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-lg">⚠️</span>
                        <h3 className="font-bold text-lg">アレルゲン情報</h3>
                        <span className="ml-auto text-[10px] text-slate-400 font-bold">任意 — 含まれる場合に選択</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { key: 'wheat',      label: '小麦',   emoji: '🌾' },
                            { key: 'egg',        label: '卵',     emoji: '🥚' },
                            { key: 'dairy',      label: '乳',     emoji: '🥛' },
                            { key: 'buckwheat',  label: 'そば',   emoji: '🍜' },
                            { key: 'peanut',     label: '落花生', emoji: '🥜' },
                            { key: 'shrimp',     label: 'えび',   emoji: '🦐' },
                            { key: 'crab',       label: 'かに',   emoji: '🦀' },
                            { key: 'soybean',    label: '大豆',   emoji: '🫘' },
                            { key: 'walnut',     label: 'くるみ', emoji: '🌰' },
                            { key: 'beef',       label: '牛肉',   emoji: '🐄' },
                            { key: 'pork',       label: '豚肉',   emoji: '🐷' },
                            { key: 'chicken',    label: '鶏肉',   emoji: '🐔' },
                            { key: 'sesame',     label: 'ごま',   emoji: '🌿' },
                        ].map(({ key, label, emoji }) => {
                            const active = formData.allergens.includes(key)
                            return (
                                <button key={key} type="button"
                                    onClick={() => setFormData(prev => ({
                                        ...prev,
                                        allergens: active
                                            ? prev.allergens.filter(a => a !== key)
                                            : [...prev.allergens, key]
                                    }))}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border transition-all ${active
                                        ? 'bg-red-500 text-white border-red-500 shadow-sm'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-red-300 hover:text-red-400'}`}
                                >
                                    {emoji} {label}
                                </button>
                            )
                        })}
                    </div>
                    {formData.allergens.length > 0 && (
                        <p className="text-xs text-red-500 mt-3 font-bold">
                            ⚠️ 含まれるアレルゲン: {formData.allergens.join(', ')}
                        </p>
                    )}
                </section>

                {/* 3. Final Action Tap */}
                <section className="pb-20">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="bg-adminprimary text-white size-6 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                        <h3 className="font-bold text-lg">{t('admin.register.review_publish')}</h3>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className={`w-full tsubaki-gradient text-white text-xl font-extrabold py-6 rounded-xl shadow-xl shadow-adminprimary/30 hover:shadow-2xl hover:scale-[1.01] transition-all flex items-center justify-center gap-3 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? (
                            <div className="w-6 h-6 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <span className="material-symbols-outlined text-3xl">check_circle</span>
                        )}
                        {isLoading ? t('admin.common.loading') : t('admin.register.confirm_register')}
                    </button>
                    <p className="text-center text-slate-400 text-sm mt-4">
                        Auto API Request optimizes time — manual review required before confirming.
                    </p>
                </section>
            </main>

            {/* Sticky Mobile Bottom Nav Accent */}
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[90%] md:w-auto md:min-w-[400px] bg-white p-4 rounded-2xl shadow-2xl border border-adminprimary/20 flex items-center justify-between md:hidden z-50">
                <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-bold tracking-widest">Progress</span>
                    <span className="font-bold text-adminprimary">Ready</span>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="bg-adminprimary text-white px-6 py-2 rounded-lg font-bold shadow-md h-10 flex items-center justify-center"
                >
                    {isLoading ? t('admin.common.loading') : t('admin.common.save')}
                </button>
            </div>

            {/* Background Decorative Elements */}
            <div className="fixed top-20 left-[-50px] opacity-20 pointer-events-none select-none z-[-1]">
                <span className="material-symbols-outlined text-[200px] text-adminprimary">filter_vintage</span>
            </div>
            <div className="fixed bottom-[-50px] right-[-50px] opacity-10 pointer-events-none select-none z-[-1]">
                <span className="material-symbols-outlined text-[300px] text-adminprimary">filter_vintage</span>
            </div>
        </div>
    )
}
