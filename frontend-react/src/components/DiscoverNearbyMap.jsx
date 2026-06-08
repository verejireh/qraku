import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMapEvents, useMap } from 'react-leaflet'
import { useState, useEffect } from 'react'
import 'leaflet/dist/leaflet.css'

function MoveWatcher({ origin, onMovedAway }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter()
      const movedFar = Math.abs(c.lat - origin.lat) > 0.0008 || Math.abs(c.lng - origin.lng) > 0.0008
      onMovedAway(movedFar ? { lat: c.lat, lng: c.lng } : null)
    },
  })
  return null
}

function Recenter({ center }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng])
  return null
}

function _dist(m) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

export default function DiscoverNearbyMap({ stores, userCoords, searchCenter, radius, loading, onResearch }) {
  const [movedCenter, setMovedCenter] = useState(null)
  if (!userCoords) return null
  const center = searchCenter || userCoords

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200" style={{ height: '60vh', minHeight: 360 }}>
      <MapContainer center={[center.lat, center.lng]} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={center} />
        <MoveWatcher origin={center} onMovedAway={setMovedCenter} />

        {/* 検索反径 (検索中心基準) */}
        <Circle center={[center.lat, center.lng]} radius={radius}
          pathOptions={{ color: '#c21e2f', fillColor: '#c21e2f', fillOpacity: 0.06, weight: 1 }} />

        {/* 内位置 (実際のGPS) */}
        <CircleMarker center={[userCoords.lat, userCoords.lng]} radius={7}
          pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }}>
          <Popup>現在地</Popup>
        </CircleMarker>

        {stores.filter(s => s.latitude && s.longitude).map(s => {
          const color = s.can_accept_takeout ? '#c21e2f' : '#94a3b8'
          return (
            <CircleMarker key={s.store_id} center={[s.latitude, s.longitude]} radius={9}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}>
              <Popup>
                <div style={{ minWidth: 168 }}>
                  <p style={{ fontWeight: 800, margin: 0 }}>{s.store_name}</p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 8px' }}>
                    {_dist(s.distance_m)}{s.category ? ` · ${s.category}` : ''}
                  </p>
                  {s.food_rescue_manual_active && s.food_rescue_active && (
                    <p style={{ fontSize: 11, color: '#ea580c', fontWeight: 700, margin: '0 0 6px' }}>⚡ 割引中</p>
                  )}
                  {s.can_accept_takeout && s.is_open && s.takeout_default_wait_minutes > 0 && (
                    <p style={{ fontSize: 11, color: '#c21e2f', fontWeight: 700, margin: '0 0 6px' }}>🕒 約{s.takeout_default_wait_minutes}分で受取</p>
                  )}
                  {s.can_accept_takeout && s.slug && (
                    <a href={`/${s.slug}/takeout`} style={{ display: 'block', textAlign: 'center', background: '#c21e2f', color: '#fff', fontWeight: 800, padding: '7px 0', borderRadius: 8, textDecoration: 'none', marginBottom: 6 }}>テイクアウト注文</a>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {s.slug && <a href={`/${s.slug}`} style={{ flex: 1, textAlign: 'center', background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '6px 0', borderRadius: 8, textDecoration: 'none', fontSize: 12 }}>お店へ</a>}
                    {s.google_maps_url && <a href={s.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '6px 0', borderRadius: 8, textDecoration: 'none', fontSize: 12 }}>地図</a>}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {loading && (
        <div className="absolute top-3 right-3 z-[1000] bg-white/90 shadow rounded-full px-3 py-1.5 text-xs font-bold text-slate-600 flex items-center gap-1.5">
          <span className="w-3 h-3 border-2 border-[#c21e2f]/30 border-t-[#c21e2f] rounded-full animate-spin" />
          検索中…
        </div>
      )}

      {!loading && movedCenter && (
        <button
          onClick={() => { onResearch(movedCenter); setMovedCenter(null) }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white shadow-lg border border-slate-200 rounded-full px-4 py-2 text-xs font-bold text-[#c21e2f] hover:bg-slate-50"
        >
          🔄 このエリアを再検索
        </button>
      )}
    </div>
  )
}
