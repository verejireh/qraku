# S2 — 지도 기반 탐색 UI (스펙 + 구현 계획)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> 브랜치: `discover_build` · 작성일: 2026-06-08 · 상위: [WORKPLAN.md](./WORKPLAN.md)

**Goal:** 디스커버리 「내 주변」을 무료 임베드 지도(Leaflet)로 보여주고, 핀에서 S1 선결제 CTA와 외부 구글맵 핸드오프로 잇는다. 비용 안전(온디맨드 재검색) 기본.

**Architecture:** react-leaflet v5 + OSM 무료 타일. 가게 핀은 아이콘 에셋 없이 **CircleMarker(색 원)** 로 그려 Vite 아이콘 경로 이슈를 원천 회피. 지도/리스트는 **토글**(기본 리스트)이며 **같은 검색결과 1벌을 공유**(토글 시 추가 API 0). 지도를 밀면 자동검색하지 않고 **「このエリアを再検索」 버튼**으로만 재호출(온디맨드). 백엔드 무수정.

**Tech:** React 19.2, Vite 7, react-leaflet ^5, leaflet ^1.9, Tailwind.

## 확정 결정
- 라이브러리: **Leaflet + react-leaflet v5 + OSM 타일(무료)**. 핀 = CircleMarker.
- 첫 화면 = **리스트**, `[リスト] [地図]` 토글로 전환.
- 재검색 = **온디맨드 버튼**(지도 이동 시 자동검색 금지).
- 외부 구글 핸드오프: 리스트 카드(기존 `地図で見る`) + 지도 핀 팝업 **모두** `store.google_maps_url`.
- 백엔드 무수정(`/nearby`가 `latitude/longitude/distance_m/can_accept_takeout/slug/google_maps_url` 제공). GiST 공간인덱스 이미 존재.

## File Fence
| 파일 | 변경 |
|---|---|
| `frontend-react/package.json` (+lock) | `leaflet`, `react-leaflet` 추가 |
| `frontend-react/src/components/DiscoverNearbyMap.jsx` | **신규** 지도 컴포넌트 |
| `frontend-react/src/views/DiscoverView.jsx` | NearbyPanel 토글 + 지도 연결 + searchCenter 도입 |

**불가침:** 백엔드, 결제 로직, S1 산출물 시그니처.

---

## Task 1 — 의존성 추가

- [ ] **Step 1:** `npm --prefix frontend-react install leaflet@^1.9 react-leaflet@^5`
  (react-leaflet v5 = React 19 호환. 설치 후 package.json dependencies에 두 패키지 존재 확인.)
- [ ] **Step 2:** 빌드 회귀 확인: `npm --prefix frontend-react run build` → 성공.
- [ ] **Step 3:** 커밋
  ```bash
  git add frontend-react/package.json frontend-react/package-lock.json
  git commit -m "build(discover): leaflet + react-leaflet v5 의존성 추가 (S2 T1)"
  ```

---

## Task 2 — DiscoverNearbyMap 컴포넌트 (신규)

**File:** Create `frontend-react/src/components/DiscoverNearbyMap.jsx`

- [ ] **Step 1: 컴포넌트 작성** (아래 전체 코드 그대로)
```jsx
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

        {/* 검색 반경 */}
        <Circle center={center} radius={radius}
          pathOptions={{ color: '#c21e2f', fillColor: '#c21e2f', fillOpacity: 0.06, weight: 1 }} />

        {/* 내 위치 */}
        <CircleMarker center={center} radius={7}
          pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }}>
          <Popup>現在地</Popup>
        </CircleMarker>

        {/* 가게 핀 (선결제 가능=빨강, 그 외=회색) */}
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

      {/* 온디맨드 재검색 버튼 (지도를 밀었을 때만) */}
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
```

- [ ] **Step 2:** 빌드 확인: `npm --prefix frontend-react run build` → 성공 (import 경로/leaflet CSS 정상).
- [ ] **Step 3:** 커밋
  ```bash
  git add frontend-react/src/components/DiscoverNearbyMap.jsx
  git commit -m "feat(discover-ui): Leaflet 근처 지도 컴포넌트 (CircleMarker 핀·반경·재검색) (S2 T2)"
  ```

---

## Task 3 — NearbyPanel 통합 (DiscoverView.jsx)

**File:** Modify `frontend-react/src/views/DiscoverView.jsx`

> 먼저 `NearbyPanel` 함수 전체를 읽고 아래를 적용한다. 앵커 문자열이 약간 다르면 동일 동작이 되도록 최소 조정.

- [ ] **Step 1: import 추가** (파일 상단 import 블록):
```jsx
import DiscoverNearbyMap from '../components/DiscoverNearbyMap'
```

- [ ] **Step 2: 상태 추가.** `NearbyPanel` 안 `const [takeoutOnly, setTakeoutOnly] = useState(false)` 다음에:
```jsx
  const [viewMode, setViewMode] = useState('list')   // 'list' | 'map'
  const [searchCenter, setSearchCenter] = useState(null)  // /nearby 질의 중심 (기본 = 현재위치)
```

- [ ] **Step 3: 위치 취득 시 searchCenter 초기화.** `requestLocation` 의 성공 콜백에서 `setCoords({ lat: ..., lng: ... })` 다음 줄에:
```jsx
        setSearchCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude })
```

- [ ] **Step 4: searchNearby 가 searchCenter 기준으로 질의.** `searchNearby` 콜백을 다음과 같이 조정:
  - 맨 앞 가드/좌표를 `coords` → `searchCenter` 로 교체:
```jsx
  const searchNearby = useCallback(async () => {
    if (!searchCenter) return
    setLoading(true)
    setSearchError(null)
    try {
      const res = await axios.get('/api/public/discover/nearby', {
        params: { lat: searchCenter.lat, lng: searchCenter.lng, radius, food_rescue_only: foodRescueOnly, takeout_only: takeoutOnly },
      })
      setStores(res.data.items || [])
    } catch (e) {
      setSearchError('検索に失敗しました。もう一度お試しください。')
    }
    setLoading(false)
  }, [searchCenter, radius, foodRescueOnly, takeoutOnly])
```
  - 자동 재검색 `useEffect` 의 조건/deps도 searchCenter 기준으로:
```jsx
  useEffect(() => {
    if (searchCenter) searchNearby()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCenter, radius, foodRescueOnly, takeoutOnly])
```

- [ ] **Step 5: 토글 버튼 추가.** 필터바(반경 옵션들이 있는 줄) 영역에, `事前決済可のみ` 버튼 블록 다음(혹은 필터바 끝)에 리스트/지도 토글 추가:
```jsx
        {/* 리스트/지도 토글 */}
        <div className="ml-auto flex items-center gap-1 bg-white border border-slate-200 rounded-full px-1 py-1">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${viewMode === 'list' ? 'bg-[#c21e2f] text-white' : 'text-slate-500 hover:text-[#c21e2f]'}`}
          >リスト</button>
          <button
            onClick={() => setViewMode('map')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${viewMode === 'map' ? 'bg-[#c21e2f] text-white' : 'text-slate-500 hover:text-[#c21e2f]'}`}
          >地図</button>
        </div>
```
> 참고: 기존 필터바에 `ml-auto`를 쓰는 재검색 아이콘 버튼이 있으면, 토글에 `ml-auto`가 겹치지 않게 한쪽만 유지(레이아웃 깨짐 방지).

- [ ] **Step 6: 지도/리스트 분기 렌더.** 결과 영역에서, 로딩/에러 처리 다음의 "결과 리스트"(`stores.map(... <StoreCard/>)` 그리드)를 `viewMode` 로 분기:
```jsx
      {!loading && viewMode === 'map' && stores.length > 0 && coords && (
        <DiscoverNearbyMap
          stores={stores}
          userCoords={coords}
          radius={radius}
          onResearch={(c) => setSearchCenter(c)}
        />
      )}

      {!loading && viewMode === 'list' && stores.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stores.map(store => (
            <StoreCard key={store.store_id} store={store} />
          ))}
        </div>
      )}
```
  (기존 빈 상태/에러 블록은 그대로 둔다. 기존 단일 리스트 그리드 블록을 위 두 블록으로 교체.)

- [ ] **Step 7: 빌드 + lint**
  - `npm --prefix frontend-react run build` → 성공
  - `cd frontend-react && npx eslint src/views/DiscoverView.jsx src/components/DiscoverNearbyMap.jsx` → 신규 에러 0 (기존 `catch (e)` 류 제외)

- [ ] **Step 8: 커밋**
  ```bash
  git add frontend-react/src/views/DiscoverView.jsx
  git commit -m "feat(discover-ui): 근처 모드 리스트/지도 토글 + 온디맨드 재검색 통합 (S2 T3)"
  ```

---

## Task 4 — Green Gate + 최종 검증

- [ ] **Step 1:** `npm --prefix frontend-react run build` → 성공
- [ ] **Step 2:** `cd frontend-react && npx eslint src/views/DiscoverView.jsx src/components/DiscoverNearbyMap.jsx` → 신규 에러 0
- [ ] **Step 3:** (선택, DB+dev서버 가용 시) 수동/Playwright: 「내 주변」→ 위치 허용 → `[地図]` 토글 → 핀 표시·핀 클릭 팝업의 CTA·재검색 버튼 동작 확인
- [ ] **Step 4:** 최종 커밋(잔여 시)

## 완료 기준 (DoD)
- [ ] 「내 주변」 기본 리스트, `[地図]` 토글로 지도 전환(데이터 공유)
- [ ] 지도에 내 위치·반경·가게 핀(선결제=빨강/그 외=회색)
- [ ] 핀 팝업: 테이크아웃 CTA(조건부)·お店へ·구글맵 핸드오프
- [ ] 지도 이동 시 자동검색 안 함, 「このエリアを再検索」 버튼으로만 재호출
- [ ] Green Gate(build + 신규 lint 0) 통과
- [ ] File Fence 준수, 백엔드 무수정

## Self-Review (작성자 점검)
- 스펙 커버리지: 라이브러리/토글/온디맨드/핸드오프/핀색 전부 Task에 매핑. ✅
- 플레이스홀더 없음(컴포넌트 전체 코드 포함). 통합부는 앵커+동작 명시(구현자 최소 조정 허용).
- 타입/이름 일관성: `searchCenter`·`viewMode`·`onResearch`·props(`stores/userCoords/radius`) 일치. 응답필드(`store_id/latitude/longitude/distance_m/can_accept_takeout/slug/google_maps_url`) 백엔드 제공값과 일치.
- 리스크: react-leaflet v5↔React19 호환(T1에서 확인), 재검색 버튼 z-index(`z-[1000]`), moveend 초기발화는 0.0008 임계로 억제.
