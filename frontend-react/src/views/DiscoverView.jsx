import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'

const SORT_OPTIONS = [
  { key: 'popular',     label: '人気順',     sublabel: 'テーブル当たり注文数',  icon: 'local_fire_department' },
  { key: 'most_orders', label: '総注文数順',  sublabel: '最も注文された',        icon: 'bar_chart' },
  { key: 'newest',      label: '新着順',     sublabel: '最近追加されたメニュー', icon: 'new_releases' },
  { key: 'most_menus',  label: 'メニュー数順', sublabel: 'メニューが多いお店',   icon: 'restaurant_menu' },
]

const RADIUS_OPTIONS = [
  { value: 300,  label: '300m' },
  { value: 800,  label: '800m', default: true },
  { value: 1500, label: '1.5km' },
  { value: 3000, label: '3km' },
]

function MSI({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// ── 近くのお店カード ─────────────────────────────────────────────────────────
function StoreCard({ store }) {
  const distLabel = store.distance_m < 1000
    ? `${Math.round(store.distance_m)}m`
    : `${(store.distance_m / 1000).toFixed(1)}km`

  const miniUrl = store.slug ? `/${store.slug}` : null

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-all">
      <div className="p-4 space-y-3">
        {/* 店名 + バッジ */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-black text-[#1b1b1d] text-base leading-tight truncate">{store.store_name}</p>
            {store.category && (
              <span className="inline-block text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 mt-1">
                {store.category}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {store.food_rescue_manual_active && store.food_rescue_active && (
              <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-0.5 rounded-full flex items-center gap-0.5">
                🔥 割引中
              </span>
            )}
            {store.can_accept_takeout && (
              <span className="text-[10px] font-black bg-[#c21e2f] text-white px-2 py-0.5 rounded-full flex items-center gap-0.5">
                🛍 事前決済OK
              </span>
            )}
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-0.5">
              <MSI name="near_me" className="text-sm text-[#c21e2f]" />
              {distLabel}
            </span>
          </div>
        </div>

        {/* 住所 */}
        {store.address && (
          <p className="text-xs text-slate-400 truncate flex items-center gap-1">
            <MSI name="location_on" className="text-sm flex-shrink-0" />
            {store.address}
          </p>
        )}

        {/* フードレスキュー メッセージ */}
        {store.food_rescue_manual_active && store.food_rescue_msg && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800 flex items-start gap-1.5">
            <span className="text-sm flex-shrink-0">🔥</span>
            <span>{store.food_rescue_msg}</span>
          </div>
        )}

        {/* アクション */}
        <div className="space-y-2 pt-1">
          {store.can_accept_takeout && store.slug && (
            <a
              href={`/${store.slug}/takeout`}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#c21e2f] hover:bg-[#a01828] text-white font-black text-xs transition-colors"
            >
              <MSI name="shopping_bag" className="text-base" />
              テイクアウト注文（事前決済）
            </a>
          )}
          <div className="flex gap-2">
            <a
              href={store.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
            >
              <MSI name="map" className="text-base" />
              地図で見る
            </a>
            {miniUrl && (
              <a
                href={miniUrl}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                <MSI name="storefront" className="text-base" />
                お店へ
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 近くのお店モード ─────────────────────────────────────────────────────────
function NearbyPanel() {
  const [geoState, setGeoState] = useState('idle') // idle | requesting | granted | denied | error
  const [coords, setCoords] = useState(null)       // { lat, lng }
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)
  const [radius, setRadius] = useState(800)
  const [foodRescueOnly, setFoodRescueOnly] = useState(false)
  const [takeoutOnly, setTakeoutOnly] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGeoState('error')
      return
    }
    setGeoState('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoState('granted')
      },
      () => setGeoState('denied'),
      { timeout: 10000, maximumAge: 60000 }
    )
  }

  const searchNearby = useCallback(async () => {
    if (!coords) return
    setLoading(true)
    setSearchError(null)
    try {
      const res = await axios.get('/api/public/discover/nearby', {
        params: { lat: coords.lat, lng: coords.lng, radius, food_rescue_only: foodRescueOnly, takeout_only: takeoutOnly },
      })
      setStores(res.data.items || [])
    } catch (e) {
      setSearchError('検索に失敗しました。もう一度お試しください。')
    }
    setLoading(false)
  }, [coords, radius, foodRescueOnly, takeoutOnly])

  // 座標 or フィルター変更時に自動再検索
  useEffect(() => {
    if (coords) searchNearby()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, radius, foodRescueOnly, takeoutOnly])

  // ── 位置未取得 ──
  if (geoState === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-5 text-center">
        <div className="w-20 h-20 rounded-full bg-[#c21e2f]/10 flex items-center justify-center">
          <MSI name="near_me" className="text-5xl text-[#c21e2f]" />
        </div>
        <div>
          <p className="font-black text-lg text-[#1b1b1d]">近くのお店を探す</p>
          <p className="text-sm text-slate-400 mt-1">現在地から徒歩10分以内の<br />お店とマグカル割引を表示します</p>
        </div>
        <button
          onClick={requestLocation}
          className="px-8 py-3 bg-[#c21e2f] hover:bg-[#a01828] text-white font-black rounded-full shadow-lg text-sm transition-colors flex items-center gap-2"
        >
          <MSI name="my_location" className="text-base" />
          現在地を使う
        </button>
      </div>
    )
  }

  if (geoState === 'requesting') {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-10 h-10 border-4 border-[#c21e2f]/20 border-t-[#c21e2f] rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">現在地を取得中...</p>
      </div>
    )
  }

  if (geoState === 'denied' || geoState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
        <MSI name="location_off" className="text-5xl text-slate-300" />
        <div>
          <p className="font-bold text-slate-600">位置情報が取得できませんでした</p>
          <p className="text-xs text-slate-400 mt-1">ブラウザの設定で位置情報を許可してください</p>
        </div>
        <button
          onClick={requestLocation}
          className="px-6 py-2 border border-slate-200 rounded-full text-sm font-bold text-slate-600 hover:border-[#c21e2f] hover:text-[#c21e2f] transition-colors"
        >
          再試行
        </button>
      </div>
    )
  }

  // ── 位置取得済み: フィルター + 結果 ──
  return (
    <div className="space-y-4">
      {/* フィルターバー */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 半径 */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-full px-1 py-1">
          {RADIUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRadius(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                radius === opt.value
                  ? 'bg-[#c21e2f] text-white'
                  : 'text-slate-500 hover:text-[#c21e2f]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* マグカル割引フィルター */}
        <button
          onClick={() => setFoodRescueOnly(v => !v)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
            foodRescueOnly
              ? 'bg-orange-500 text-white border-orange-500 shadow-md'
              : 'bg-white text-slate-600 border-slate-200 hover:border-orange-400'
          }`}
        >
          <span>🔥</span>
          割引中のみ
        </button>

        {/* テイクアウト可フィルター */}
        <button
          onClick={() => setTakeoutOnly(v => !v)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
            takeoutOnly
              ? 'bg-[#c21e2f] text-white border-[#c21e2f] shadow-md'
              : 'bg-white text-slate-600 border-slate-200 hover:border-[#c21e2f]'
          }`}
        >
          <span>🛍</span>
          事前決済可のみ
        </button>

        {/* 現在地アイコン + 再検索 */}
        <button
          onClick={searchNearby}
          disabled={loading}
          className="ml-auto p-2 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-[#c21e2f] hover:border-[#c21e2f] transition-colors disabled:opacity-40"
          title="再検索"
        >
          <MSI name="refresh" className="text-base" />
        </button>
      </div>

      {/* ステータス */}
      {!loading && (
        <p className="text-xs text-slate-400">
          {stores.length > 0
            ? `${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 以内に ${stores.length} 件のお店`
            : foodRescueOnly
              ? 'このエリアで現在割引中のお店はありません'
              : `${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 以内にお店が見つかりません`
          }
        </p>
      )}

      {/* エラー */}
      {searchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{searchError}</div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#c21e2f]/20 border-t-[#c21e2f] rounded-full animate-spin" />
        </div>
      )}

      {/* 結果リスト */}
      {!loading && stores.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stores.map(store => (
            <StoreCard key={store.store_id} store={store} />
          ))}
        </div>
      )}

      {/* 空状態 */}
      {!loading && stores.length === 0 && !searchError && (
        <div className="text-center py-16 text-slate-400">
          <MSI name="location_searching" className="text-5xl block mb-3" />
          <p className="font-medium text-sm">近くにお店が見つかりません</p>
          <p className="text-xs mt-1">範囲を広げるか、場所を変えてお試しください</p>
        </div>
      )}
    </div>
  )
}

// ── メインビュー ──────────────────────────────────────────────────────────────
export default function DiscoverView() {
  const [mode, setMode] = useState('ranking') // 'ranking' | 'nearby'

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
  const selectedStoreData = useMemo(
    () => items.find(it => it.store_id === selectedStore) ?? null,
    [selectedStore, items]
  )

  const LIMIT = 20

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

  useEffect(() => {
    if (mode !== 'ranking') return
    setPage(1)
    setItems([])
    setHasMore(true)
    loadItems(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, prefecture, category, selectedStore, mode])

  const prefectures = [...new Set(filters.regions.map(r => r.prefecture).filter(Boolean))]

  return (
    <div className="min-h-screen bg-[#f9f6f1]">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-black text-[#c21e2f] tracking-tight">QRaku</span>
            <span className="text-sm text-slate-400 font-medium">Discover</span>
            {mode === 'ranking' && (
              <span className="ml-auto text-xs text-slate-400">{total.toLocaleString()} メニュー</span>
            )}
          </div>

          {/* モード切替タブ */}
          <div className="flex gap-1">
            <button
              onClick={() => setMode('ranking')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                mode === 'ranking'
                  ? 'bg-[#c21e2f] text-white border-[#c21e2f] shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-[#c21e2f]'
              }`}
            >
              <MSI name="leaderboard" className="text-base" />
              ランキング
            </button>
            <button
              onClick={() => setMode('nearby')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                mode === 'nearby'
                  ? 'bg-[#c21e2f] text-white border-[#c21e2f] shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-[#c21e2f]'
              }`}
            >
              <MSI name="near_me" className="text-base" />
              近くのお店
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── 近くのお店モード ── */}
        {mode === 'nearby' && <NearbyPanel />}

        {/* ── ランキングモード ── */}
        {mode === 'ranking' && (
          <>
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
                  <MSI name={opt.icon} className="text-base" />
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
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

              {(prefecture || category || selectedStore) && (
                <button
                  onClick={() => { setPrefecture(''); setCategory(''); setSelectedStore(null) }}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-full bg-white text-slate-500 hover:text-[#c21e2f] flex items-center gap-1"
                >
                  <MSI name="close" className="text-base" />
                  クリア
                </button>
              )}
            </div>

            <p className="text-xs text-slate-400">
              {SORT_OPTIONS.find(o => o.key === sort)?.sublabel}で並べています
            </p>

            {/* Menu Grid */}
            {items.length === 0 && !loading ? (
              <div className="text-center py-24 text-slate-400">
                <MSI name="search_off" className="text-5xl block mb-3" />
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

            {selectedStore && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
                <div className="flex items-center gap-2 bg-[#1b1b1d] text-white px-5 py-3 rounded-full shadow-xl text-sm font-bold">
                  <MSI name="store" className="text-base" />
                  このお店のメニューを表示中
                  <button onClick={() => setSelectedStore(null)} className="ml-1 opacity-70 hover:opacity-100">
                    <MSI name="close" className="text-base" />
                  </button>
                </div>
                {selectedStoreData?.can_accept_takeout && selectedStoreData.slug && (
                  <a
                    href={`/${selectedStoreData.slug}/takeout`}
                    className="flex items-center gap-1.5 bg-[#c21e2f] hover:bg-[#a01828] text-white px-5 py-3 rounded-full shadow-xl text-sm font-black"
                  >
                    <MSI name="shopping_bag" className="text-base" />
                    テイクアウト注文
                  </a>
                )}
              </div>
            )}
          </>
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
            <MSI name="restaurant" className="text-4xl" />
          </div>
        )}
        {rankBadge && (
          <span className={`absolute top-2 left-2 text-[10px] font-black text-white px-2 py-0.5 rounded-full ${rankBadge.color}`}>
            {rankBadge.label}
          </span>
        )}
        {item.price > 0 && (
          <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            ¥{item.price.toLocaleString()}
          </span>
        )}
      </div>

      <div className="p-3 space-y-1">
        <p className="font-bold text-sm text-[#1b1b1d] line-clamp-2 leading-tight">
          {item.menu_name_jp || item.menu_name_en || 'No name'}
        </p>
        {item.category && (
          <span className="inline-block text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
            {item.category}
          </span>
        )}

        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
          {item.menu_order_count > 0 && (
            <span className="flex items-center gap-0.5">
              <MSI name="shopping_bag" className="text-xs" />
              {item.menu_order_count}
            </span>
          )}
          {item.orders_per_table > 0 && (
            <span className="flex items-center gap-0.5 ml-auto text-orange-400 font-bold">
              <MSI name="table_bar" className="text-xs" />
              {item.orders_per_table}x
            </span>
          )}
        </div>

        <button
          onClick={onStoreClick}
          className="w-full text-left mt-1 pt-2 border-t border-slate-50 flex items-center gap-1 group"
        >
          <MSI name="store" className="text-xs text-slate-300 group-hover:text-[#c21e2f] transition-colors" />
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
