# S3 — 가벼운 실시간 신호 ("지금 바로 픽업") (스펙 + 계획)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> 브랜치: `discover_build` · 작성일: 2026-06-08 · 상위: [WORKPLAN.md](./WORKPLAN.md)

**Goal:** 디스커버리(리스트·지도)에 "지금 영업중 + 약 N분이면 픽업" 신호를 노출해, 구글맵이 못 하는 '주문용 실시간 상태'로 차별화한다. 비용 거의 0(기존 데이터 + 백엔드 필드 1개).

**범위 결정:** 가벼운 신호만. **동적 주방 대기시간(주문 집계 기반)은 S3.5로 분리(보류)** — 매력적이나 매장별 집계 쿼리·캐싱 필요해 비용/수요 검증 후.

## File Fence
| 파일 | 변경 |
|---|---|
| `backend/routers/discover.py` | `/nearby` 응답에 `takeout_default_wait_minutes` 추가 |
| `frontend-react/src/views/DiscoverView.jsx` | StoreCard 영업상태 뱃지 + 픽업 ETA |
| `frontend-react/src/components/DiscoverNearbyMap.jsx` | 팝업 영업상태/픽업 ETA/⚡割引中 |

**불가침:** 결제 로직, models.py, 마이그레이션, 동적 주방 집계.
**이미 보유(재사용):** `/nearby`가 `is_open`·`food_rescue_active`·`food_rescue_manual_active` 반환 중. `can_accept_takeout`(S1)·좌표(S2) 보유.

---

## Task 1 — backend `/nearby`: 픽업 대기 기본값 노출 + 営業中のみ 필터

**File:** `backend/routers/discover.py` (`discover_nearby`)

- [ ] **Step 1:** 함수 시그니처에 `takeout_only` 파라미터 다음 줄에 추가:
```python
    open_only: bool = Query(False, description="영업중(is_open) 매장만"),
```
- [ ] **Step 2:** SQL SELECT에 한 줄 추가. `s.takeout_enabled,` 다음 줄에:
```sql
            s.takeout_default_wait_minutes,
```
- [ ] **Step 3:** 영업중 필터를 SQL WHERE에 추가. 기존 `{food_rescue_clause}` 패턴과 동일하게, 함수 안에서 절(clause)을 만든다. `food_rescue_clause = (...)` 정의 근처에 추가:
```python
    open_clause = "AND s.is_open = TRUE" if open_only else ""
```
그리고 SQL의 `{food_rescue_clause}` 다음 줄에 `{open_clause}` 를 삽입(WHERE 절 안, ORDER BY 앞).
- [ ] **Step 4:** 결과 매핑(`items.append({...})`)에서 `"can_accept_takeout": ...,` 다음에:
```python
            "takeout_default_wait_minutes": r["takeout_default_wait_minutes"],
```
- [ ] **Step 5:** 응답 envelope(`return {...}`)에 에코 추가. `"takeout_only": takeout_only,` 다음:
```python
        "open_only": open_only,
```
- [ ] **Step 6:** 구문 검증 `uv run python -c "import ast; ast.parse(open('backend/routers/discover.py',encoding='utf-8').read()); print('OK')"` → OK
- [ ] **Step 7:** 헬퍼 테스트 회귀 `uv run --with pytest pytest backend/tests/ -q` → 9 passed
- [ ] **Step 8:** 커밋
  ```bash
  git add backend/routers/discover.py
  git commit -m "feat(discover): /nearby 에 픽업대기 노출 + open_only 영업중 필터 (S3 T1)"
  ```

---

## Task 2 — 리스트 StoreCard 영업상태 + 픽업 ETA

**File:** `frontend-react/src/views/DiscoverView.jsx` (`StoreCard`)

- [ ] **Step 1:** 우측 뱃지 컬럼에서, `🛍 事前決済OK` 뱃지 블록 다음(거리 `<span>` 앞)에 영업상태 뱃지 추가:
```jsx
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${store.is_open ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {store.is_open ? '営業中' : '準備中'}
            </span>
```
- [ ] **Step 2:** 픽업 ETA 라인 추가. food_rescue 메시지 블록(`{store.food_rescue_manual_active && store.food_rescue_msg && (...)}`) **다음**, `{/* アクション */}` div **앞**에:
```jsx
        {store.can_accept_takeout && store.is_open && store.takeout_default_wait_minutes > 0 && (
          <p className="text-xs text-[#c21e2f] font-bold flex items-center gap-1">
            <MSI name="schedule" className="text-sm" />
            約{store.takeout_default_wait_minutes}分で受取
          </p>
        )}
```
- [ ] **Step 3: 営業中のみ 필터 토글.** `NearbyPanel`에 `openOnly` 상태 추가 (`const [takeoutOnly, ...]` 옆):
```jsx
  const [openOnly, setOpenOnly] = useState(false)
```
`searchNearby`의 axios params에 `open_only: openOnly` 추가하고, `searchNearby` useCallback deps와 자동검색 useEffect deps 둘 다에 `openOnly` 추가. 필터바의 `事前決済可のみ` 토글 다음에 버튼 추가:
```jsx
        <button
          onClick={() => setOpenOnly(v => !v)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
            openOnly ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">storefront</span>
          営業中のみ
        </button>
```
- [ ] **Step 4:** 커밋
  ```bash
  git add frontend-react/src/views/DiscoverView.jsx
  git commit -m "feat(discover-ui): 근처 카드 영업상태·픽업 ETA + 営業中のみ 필터 (S3 T2)"
  ```

---

## Task 3 — 지도 핀 팝업 실시간 신호

**File:** `frontend-react/src/components/DiscoverNearbyMap.jsx`

- [ ] **Step 1:** 팝업 내부, 거리 `<p>`(`{distLabel(s.distance_m)}...`) **다음**에 두 줄 추가:
```jsx
                  {s.food_rescue_manual_active && s.food_rescue_active && (
                    <p style={{ fontSize: 11, color: '#ea580c', fontWeight: 700, margin: '0 0 6px' }}>⚡ 割引中</p>
                  )}
                  {s.can_accept_takeout && s.is_open && s.takeout_default_wait_minutes > 0 && (
                    <p style={{ fontSize: 11, color: '#c21e2f', fontWeight: 700, margin: '0 0 6px' }}>🕒 約{s.takeout_default_wait_minutes}分で受取</p>
                  )}
```
- [ ] **Step 2:** 커밋
  ```bash
  git add frontend-react/src/components/DiscoverNearbyMap.jsx
  git commit -m "feat(discover-ui): 지도 핀 팝업 영업상태·픽업 ETA·割引中 (S3 T3)"
  ```

---

## Task 4 — Green Gate

- [ ] **Step 1:** `uv run --with pytest pytest backend/tests/ -q` → 9 passed
- [ ] **Step 2:** `npm --prefix frontend-react run build` → 성공
- [ ] **Step 3:** `cd frontend-react && npx eslint src/views/DiscoverView.jsx src/components/DiscoverNearbyMap.jsx` → 신규 에러 0(기존 catch(e) 제외)
- [ ] **Step 4:** (DB 가용 시) `/nearby` 응답에 `takeout_default_wait_minutes` 포함 스모크 확인

## 완료 기준 (DoD)
- [ ] `/nearby` 응답에 `takeout_default_wait_minutes` 포함
- [ ] 리스트 카드: 営業中/準備中 뱃지 + (선결제·영업중 시) 「約N分で受取」
- [ ] 지도 팝업: 같은 신호 + ⚡割引中
- [ ] 픽업 ETA는 `can_accept_takeout && is_open` 일 때만
- [ ] 「営業中のみ」 필터(`open_only`) 동작 — 영업중 매장만 표시
- [ ] Green Gate(pytest·build·신규 lint 0) 통과, 백엔드 집계쿼리 미추가(비용안전)

## Self-Review
- 스펙 커버리지: 픽업ETA(T1·T2·T3)·영업상태(T2·T3)·마감세일 강조(T3) 매핑 ✅
- 필드 일관성: `takeout_default_wait_minutes`·`is_open`·`food_rescue_active`·`food_rescue_manual_active`·`can_accept_takeout` 모두 `/nearby` 제공값(또는 T1 신규)과 일치.
- 비용: 신규 집계/조인 없음. Store 컬럼 1개 SELECT 추가뿐.
