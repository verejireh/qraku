import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const SORT_OPTIONS = [
  { key: 'popular',     label: '人気順',     sublabel: 'テーブル当たり注文数',  icon: 'local_fire_department' },
  { key: 'most_orders', label: '総注文数順',  sublabel: '最も注文された',        icon: 'bar_chart' },
  { key: 'newest',      label: '新着順',     sublabel: '最近追加されたメニュー', icon: 'new_releases' },
  { key: 'most_menus',  label: 'メニュー数順', sublabel: 'メニューが多いお店',   icon: 'restaurant_menu' },
]

export default function DiscoverView() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const [sort, setSort] = useState('popular')
  const [prefecture, setPrefecture] = useState('')
  const [category, setCategory] = useState('')

  const [filters, setFilters] = useState({ regions: [], categories: [], sort_options: {} })
  const [selectedStore, setSelectedStore] = useState(null)

  const LIMIT = 20

  // 필터 옵션 로드
  useEffect(() => {
    axios.get('/api/public/discover/filters')
      .then(r => setFilters(r.data))
      .catch(() => {})
  }, [])

  const loadItems = useCallback(async (reset = false) => {
    setLoading(true)
    const currentPage = reset ? 1 : page
    try {
      const params = { sort, page: currentPage, limit: LIMIT }
      if (prefecture) params.prefecture = prefecture
      if (category) params.category = category
      if (selectedStore) params.store_id = selectedStore

      const res = await axios.get('/api/public/discover/menus', { params })
      const data = res.data
      if (reset) {
        setItems(data.items)
        setPage(2)
      } else {
        setItems(prev => [...prev, ...data.items])
        setPage(p => p + 1)
      }
      setTotal(data.total)
      setHasMore(data.items.length === LIMIT)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [sort, prefecture, category, selectedStore, page])

  // 필터/정렬 변경 시 리셋
  useEffect(() => {
    setPage(1)
    setItems([])
    setHasMore(true)
    loadItems(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, prefecture, category, selectedStore])

  const prefectures = [...new Set(filters.regions.map(r => r.prefecture).filter(Boolean))]

  return (
    <div className="min-h-screen bg-[#f9f6f1]">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-2xl font-black text-[#c21e2f] tracking-tight">QRaku</span>
          <span className="text-sm text-slate-400 font-medium">Discover</span>
          <span className="ml-auto text-xs text-slate-400">{total.toLocaleString()} メニュー</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Sort Options */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSort(opt.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all border ${
                sort === opt.key
                  ? 'bg-[#c21e2f] text-white border-[#c21e2f] shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#c21e2f]'
              }`}
            >
              <span className="material-symbols-outlined text-base">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Prefecture */}
          <select
            value={prefecture}
            onChange={e => setPrefecture(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-full bg-white focus:outline-none focus:border-[#c21e2f] text-slate-600"
          >
            <option value="">全都道府県</option>
            {prefectures.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Category */}
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-full bg-white focus:outline-none focus:border-[#c21e2f] text-slate-600"
          >
            <option value="">全カテゴリ</option>
            {filters.categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Clear filters */}
          {(prefecture || category || selectedStore) && (
            <button
              onClick={() => { setPrefecture(''); setCategory(''); setSelectedStore(null) }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-full bg-white text-slate-500 hover:text-[#c21e2f] flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">close</span>
              クリア
            </button>
          )}
        </div>

        {/* Sort description */}
        <p className="text-xs text-slate-400">
          {SORT_OPTIONS.find(o => o.key === sort)?.sublabel}で並べています
        </p>

        {/* Menu Grid */}
        {items.length === 0 && !loading ? (
          <div className="text-center py-24 text-slate-400">
            <span className="material-symbols-outlined text-5xl block mb-3">search_off</span>
            <p className="font-medium">該当するメニューが見つかりません</p>
            <p className="text-xs mt-1">フィルターを変更してみてください</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {items.map((item, idx) => (
              <MenuCard
                key={`${item.menu_id}-${idx}`}
                item={item}
                onStoreClick={() => setSelectedStore(item.store_id === selectedStore ? null : item.store_id)}
                isStoreSelected={selectedStore === item.store_id}
              />
            ))}
            {/* Skeleton loaders */}
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <div key={`skel-${i}`} className="bg-white rounded-2xl overflow-hidden animate-pulse">
                <div className="bg-slate-100 h-36" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && items.length > 0 && (
          <div className="text-center pt-2">
            <button
              onClick={() => loadItems(false)}
              className="px-8 py-3 bg-white border border-slate-200 rounded-full text-sm font-bold text-slate-600 hover:border-[#c21e2f] hover:text-[#c21e2f] transition-all"
            >
              もっと見る
            </button>
          </div>
        )}

        {/* Selected store filter badge */}
        {selectedStore && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
            <div className="flex items-center gap-2 bg-[#1b1b1d] text-white px-5 py-3 rounded-full shadow-xl text-sm font-bold">
              <span className="material-symbols-outlined text-base">store</span>
              このお店のメニューを表示中
              <button onClick={() => setSelectedStore(null)} className="ml-1 opacity-70 hover:opacity-100">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MenuCard({ item, onStoreClick, isStoreSelected }) {
  const [imgErr, setImgErr] = useState(false)

  const rankBadge = item.orders_per_table >= 5
    ? { label: 'HOT', color: 'bg-red-500' }
    : item.orders_per_table >= 2
    ? { label: 'POPULAR', color: 'bg-orange-400' }
    : null

  return (
    <div className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all border ${isStoreSelected ? 'border-[#c21e2f]' : 'border-transparent'}`}>
      {/* Image */}
      <div className="relative h-36 bg-slate-100">
        {item.image_url && !imgErr ? (
          <img
            src={item.image_url}
            alt={item.menu_name_jp || item.menu_name_en || ''}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-200">
            <span className="material-symbols-outlined text-4xl">restaurant</span>
          </div>
        )}
        {/* Rank badge */}
        {rankBadge && (
          <span className={`absolute top-2 left-2 text-[10px] font-black text-white px-2 py-0.5 rounded-full ${rankBadge.color}`}>
            {rankBadge.label}
          </span>
        )}
        {/* Price */}
        {item.price > 0 && (
          <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            ¥{item.price.toLocaleString()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1">
        <p className="font-bold text-sm text-[#1b1b1d] line-clamp-2 leading-tight">
          {item.menu_name_jp || item.menu_name_en || 'No name'}
        </p>
        {item.category && (
          <span className="inline-block text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
            {item.category}
          </span>
        )}

        {/* Stats */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
          {item.menu_order_count > 0 && (
            <span className="flex items-center gap-0.5">
              <span className="material-symbols-outlined text-xs">shopping_bag</span>
              {item.menu_order_count}
            </span>
          )}
          {item.orders_per_table > 0 && (
            <span className="flex items-center gap-0.5 ml-auto text-orange-400 font-bold">
              <span className="material-symbols-outlined text-xs">table_bar</span>
              {item.orders_per_table}x
            </span>
          )}
        </div>

        {/* Store name */}
        <button
          onClick={onStoreClick}
          className="w-full text-left mt-1 pt-2 border-t border-slate-50 flex items-center gap-1 group"
        >
          <span className="material-symbols-outlined text-xs text-slate-300 group-hover:text-[#c21e2f] transition-colors">store</span>
          <span className="text-[11px] text-slate-400 group-hover:text-[#c21e2f] transition-colors truncate">
            {item.store_name}
          </span>
          {(item.prefecture || item.city) && (
            <span className="text-[10px] text-slate-300 ml-auto flex-shrink-0">
              {item.city || item.prefecture}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
