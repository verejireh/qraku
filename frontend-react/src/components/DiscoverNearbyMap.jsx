import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMapEvents } from 'react-leaflet'
import { useState } from 'react'
import 'leaflet/dist/leaflet.css'

// 지도 이동 감지 → 중심이 일정 이상 바뀌면 '재검색' 버튼 노출 (온디맨드)
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

function distLabel(m) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

export default function DiscoverNearbyMap({ stores, userCoords, radius, onResearch }) {
  const [movedCenter, setMovedCenter] = useState(null)
  if (!userCoords) return null
  const center = [userCoords.lat, userCoords.lng]

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200" style={{ height: '60vh', minHeight: 360 }}>
      <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MoveWatcher origin={userCoords} onMovedAway={setMovedCenter} />

        <Circle center={center} radius={radius}
          pathOptions={{ color: '#c21e2f', fillColor: '#c21e2f', fillOpacity: 0.06, weight: 1 }} />

        <CircleMarker center={center} radius={7}
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
                    {distLabel(s.distance_m)}{s.category ? ` · ${s.category}` : ''}
                  </p>
                  {s.can_accept_takeout && s.slug && (
                    <a href={`/${s.slug}/takeout`}
                      style={{ display: 'block', textAlign: 'center', background: '#c21e2f', color: '#fff', fontWeight: 800, padding: '7px 0', borderRadius: 8, textDecoration: 'none', marginBottom: 6 }}>
                      テイクアウト注文
                    </a>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {s.slug && (
                      <a href={`/${s.slug}`}
                        style={{ flex: 1, textAlign: 'center', background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '6px 0', borderRadius: 8, textDecoration: 'none', fontSize: 12 }}>
                        お店へ
                      </a>
                    )}
                    {s.google_maps_url && (
                      <a href={s.google_maps_url} target="_blank" rel="noopener noreferrer"
                        style={{ flex: 1, textAlign: 'center', background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '6px 0', borderRadius: 8, textDecoration: 'none', fontSize: 12 }}>
                        地図
                      </a>
                    )}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {movedCenter && (
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
