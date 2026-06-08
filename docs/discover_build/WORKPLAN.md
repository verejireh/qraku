# DISCOVER BUILD — 워크플랜 & 하네스 규정

> **목표**: 사장님이 데이터를 공개(`data_open_consent` / `allow_public_listing`)했을 때
> 파생되는 **새로운 소비자(식당·카페·베이커리를 이용하려는 손님)**를 위한 디스커버리 포털을 완성한다.
> 데이터를 모아 소비자를 락인(Lock-in)하는 "글로벌 외식업 데이터 애그리게이터"의 소비자 측 진입점.
>
> **브랜치**: `discover_build` (main에서 분리, 2026-06-07)
> **작성일**: 2026-06-07

---

## 0. 이미 구현된 토대 (재구현 금지)

| 영역 | 위치 | 상태 |
|---|---|---|
| 반경 검색 (PostGIS `ST_DWithin`) | `backend/routers/discover.py` `/nearby` | ✅ 동작 |
| 메뉴/가게 랭킹 | `discover.py` `/menus`, `/stores` | ✅ 동작 |
| 필터 옵션 | `discover.py` `/filters` | ✅ 동작 |
| 소비자 프론트 골격 | `frontend-react/src/views/DiscoverView.jsx` (`/discover`) | ✅ 리스트 UI + 위치권한 + 반경 + 🔥마감세일 필터 |
| 가게 데이터 필드 | `Store` 모델: `latitude/longitude`, `allow_public_listing`, `data_open_consent`, `food_rescue_*`, `slug`, `about_description`, `interior/exterior_photos`, `nearby_attractions` | ✅ 존재 |

**즉 백엔드 검색·랭킹은 거의 완성. 남은 것은 (1) 발견→선결제 동선, (2) 실제 지도 UI, (3) 실시간 차별화, (4) LINE 봇 진입점.**

---

## 1. 단계(Stage) 분할

각 스테이지는 **독립 스펙 → 계획 → 구현 → 검증 → 보고 → 다음 작업지시서**의 한 사이클이다.
스테이지 경계에서만 사용자 승인을 받고 다음으로 넘어간다.

| Stage | 이름 | 한 줄 목표 | 사용자 가치 |
|---|---|---|---|
| **S0** | 셋업 (현재) | 브랜치·워크플랜·하네스 규정 수립 | — (개발 기반) |
| **S1** | 발견→선결제 동선 | 디스커버리에서 가게를 누르면 테이크아웃 메뉴→선결제→픽업이 끊김 없이 이어짐 | 손님: "근처 가게 찾고 줄 안 서고 폰으로 미리 결제" |
| **S1.5** | 사장님 Square 연동 온보딩 가이드 | 단말기 없이도 Square 가입→활성화→연동으로 테이크아웃 선결제 받는 법을 admin에서 안내 | 사장님: "단말기 없어도 온라인 주문 받을 수 있구나" (혼란 제거) |
| **S2** | 지도 기반 탐색 UI | 리스트만 있는 것을 실제 지도(핀·현재위치·반경)로 | 손님: "지도에서 내 주변 가게를 한눈에" |
| **S3** | 실시간 차별화 (가벼운 신호) | 영업중 + "약 N분 픽업"(기본값) + 마감세일 강조 + 営業中のみ 필터 | 손님: "지금 바로 받을 수 있는 가게"를 직관적으로 |
| **S3.5** | (보류) 동적 주방 대기시간 | OrderItem 집계로 "지금 약 X분 대기" 실시간 계산 + Redis 캐싱 | 손님: 진짜 실시간 대기 — 수요/비용 검증 후 |
| **S4** | 메신저 봇 위치추천 (LINE) | QRaku 공식 LINE에서 위치 전송→근처 TOP3 카드→LINE 안 자동로그인 주문. **핵심/어댑터 분리로 유럽 WhatsApp 확장 대비** | 손님: "앱 안 열고 LINE 안에서 3초 만에 탐색·주문" |

> 우선순위가 가장 높고 "돈에 가장 가까운" 것은 **S1**(데이터→신규 손님→실제 결제 전환). S1부터 진행.
> S4는 가게별 LINE이 아닌 **QRaku 플랫폼 차원 공식 계정**이 별도로 필요 — 사전 준비 항목으로 분리.
>
> **보류 항목 (별도 스테이지로 분리):**
> - **현장결제(PAY_AT_COUNTER) 테이크아웃 + 노쇼 게이팅** — 사장님이 admin에서 "현장결제 허용 대상"을
>   ①업소 친구추가자 / ②QRaku 회원 / ③무조건 중 선택. ①은 가게별 LINE Login 채널 인프라 필요.
>   S1에서는 **온라인 선결제 가능 가게만** 다루고, 현장결제 게이팅은 전체 보류.

---

## 2. 하네스 규정 (main 보호 — 구현 중 버그 방지)

> 루트 [`CLAUDE.md`](../../CLAUDE.md)의 하네스 엔지니어링 규칙을 상속하며, discover_build 전용 규정을 추가한다.

### R1 — 브랜치 격리
- 모든 작업은 **`discover_build`에서만**. `main` 직접 커밋·푸시 **절대 금지**.
- main 통합은 **모든 스테이지 완료 + 코드리뷰 통과 후 PR**로만. 직접 merge 금지.
- 각 스테이지는 독립 커밋(또는 작은 커밋 묶음)으로 기록.

### R2 — File Fence (스테이지별 변경 허용 파일)
- 각 스테이지 시작 시 작업지시서에 **변경 허용 파일 목록**을 명시한다.
- 목록 밖 파일은 수정 금지. "일관성"·"개선"을 이유로 한 범위 확장 금지.

### R3 — 결제 핵심 불가침
- `frontend-react/src/components/magnolia/MagnoliaCartModal.jsx` (결제 SDK), `OrderView.jsx`의 props 시그니처, `backend/routers/orders.py`의 선결제 경로는 **재구현·시그니처 변경 금지**.
- S1의 "선결제 연결"은 **기존 테이크아웃 선결제 플로우를 호출/재사용**할 뿐, 새 결제 로직을 만들지 않는다.

### R4 — 신규 도메인 = 신규 파일
- `discover.py`는 디스커버리 검색 전용으로 **확장만** (기존 엔드포인트 응답 구조 유지).
- 소비자 계정 / QRaku 포인트 / LINE 봇은 **각각 새 라우터 파일**로 생성 후 `main.py`에 등록만.

### R5 — 마이그레이션 안전
- 모델은 `backend/models.py` 하단 **append만**.
- 기존 테이블 컬럼 추가 → `database.py`의 `migration_sqls` **리스트 끝**에 `# [YYYY-MM-DD] 목적` 주석과 함께.
- 새 테이블은 `create_all` 자동 생성 → `ALTER` 불필요. **중복 추가 금지**(추가 전 기존 항목 확인).

### R6 — 공개 API 안전 (소비자 노출)
- discover 계열은 **인증 없는 공개 API** → 반드시 `allow_public_listing = TRUE` 매장만 노출.
- 새 공개 엔드포인트마다 노출 필드 검토(전화·정확좌표 등 민감도) + `/security-review` 1회.

### R7 — Green Gate (완료 보고 전 필수 검증)
- 프론트 변경: `cd frontend-react && npm run build` + `npm run lint` 통과.
- 백엔드 변경: 서버 import/기동 + 변경 엔드포인트 스모크 확인.
- **깨진 상태로 "완료" 보고 금지** ([`verification-before-completion`] 스킬 준수).

### R8 — 단계 경계에서만 사용자 개입
- 스테이지 도중에는 멈추지 않는다. **스테이지 끝**에서만:
  1. 사용자측 구현 보고(아래 §4 형식)
  2. 다음 작업 모델 + 작업지시서 작성
  3. 사용자 승인 대기 → 승인 후 다음 스테이지 진입

---

## 3. 사용할 에이전트 & 스킬 (스테이지별)

### 프로세스 스킬 (공통, 순서대로)
| 단계 | 스킬 | 용도 |
|---|---|---|
| 설계 | `superpowers:brainstorming` | 각 스테이지 요구사항·설계 확정 |
| 계획 | `superpowers:writing-plans` | 스테이지별 상세 구현 계획 작성 |
| 구현 | `superpowers:test-driven-development` | 테스트 우선 구현 |
| 디버그 | `superpowers:systematic-debugging` | 버그·실패 발생 시 |
| 리뷰 | `superpowers:requesting-code-review` + `receiving-code-review` | 구현 후 검증 |
| 검증 | `superpowers:verification-before-completion` | "완료" 주장 전 증거 확보 |
| 마감 | `superpowers:finishing-a-development-branch` | 전체 완료 후 PR 결정 |

### 구현/도메인 스킬
| 스킬 | 용도 | 적용 스테이지 |
|---|---|---|
| `frontend-design` | 소비자용 디스커버리/지도/카드 UI (시각 품질) | S1·S2·S3 |
| `supabase-postgres-best-practices` | PostGIS 공간 쿼리·인덱스 튜닝 참고(브랜드 무관 Postgres 원칙만 차용) | S2·S3 |
| `/code-review` | 변경 diff 정확성·단순화 리뷰 | 각 스테이지 |
| `/security-review` | 공개 API 노출·데이터 보호 점검 | S1·S4 |
| `/run`, `/verify` | 앱 실제 기동·동작 확인 | 각 스테이지 |

### 에이전트 (필요 시에만 — 사용자 요청/명시 범위 내)
| 에이전트 | 용도 |
|---|---|
| `Explore` | 스테이지 착수 전 관련 코드 광역 탐색 (읽기 전용) |
| `Plan` | 아키텍처 트레이드오프 정리·구현 전략 |
| `code-simplifier` | 구현 직후 변경분 정리 |
| `general-purpose` | 다단계 조사/검색이 필요할 때 |

### 모델 권장 (스테이지 "다음 작업 모델")
| 작업 성격 | 권장 모델 |
|---|---|
| 설계·브레인스토밍·아키텍처·리뷰 | **Opus** |
| 일반 구현(라우터·컴포넌트) | **Sonnet** |
| 단순 반복·보일러플레이트·문서 | **Haiku** |

---

## 4. 스테이지 완료 보고 형식 (R8-1)

각 스테이지 마지막에 아래 형식으로 보고한다.

### (A) 사용자측 구현 보고 — *비기술, 손님/사장님 관점*
> "이번에 무엇이 가능해졌나"를 기술 용어 없이 풀어서.
> 예) "이제 손님이 디스커버리에서 가게를 누르면 바로 그 가게의 테이크아웃 메뉴가 뜨고,
> 폰으로 결제까지 끝낸 뒤 가게에서 음식만 받아갈 수 있습니다."

### (B) 다음 작업 지시서 (Work Order)
```
■ 다음 스테이지: S_
■ 권장 모델: (Opus / Sonnet / Haiku)
■ 목표(한 줄):
■ 변경 허용 파일(File Fence):
   - ...
■ 사용할 스킬/에이전트:
   - ...
■ 완료 기준(검증 가능):
   - [ ] ...
   - [ ] Green Gate (build/lint/스모크) 통과
■ 하네스 주의:
   - (R3 결제 불가침 등 해당 항목)
```

### (C) 승인 대기
> 사용자가 작업지시서를 승인하면 다음 스테이지 진입.

---

## 5. 진행 로그

| 날짜 | 스테이지 | 결과 |
|---|---|---|
| 2026-06-09 | 외부 코드리뷰(GPT-5.5) 반영 | Imp1 LINE 멱등성 commit+ON CONFLICT(미커밋 버그 수정)·Imp2 온라인결제 판정 결제방식 매칭·Imp3 지도 searchCenter recenter+로딩유지·Imp4 takeout_only LIMIT 전 적용·Min1 PII 미저장·Min3 catch lint. 검증리뷰 통과, pytest 25/25·build OK·lint 0, /nearby 불변. 커밋 b30b4eb·3c043b2·55deb7d·53b913f·35eeeea |
| 2026-06-07 | S0 셋업 | 브랜치 `discover_build` 분리 + 본 워크플랜·하네스 규정 작성 |
| 2026-06-08 | S1 발견→선결제 | 완료. 공통 헬퍼(`utils/takeout.py`)+9테스트, discover 3엔드포인트에 `can_accept_takeout`·`slug`, 근처/랭킹 카드 테이크아웃 CTA·뱃지·필터. 7 Task 전부 스펙+품질 리뷰 통과, Opus 최종리뷰 Ready. pytest 9/9·빌드 OK. 커밋 6a78a53…04fe715. (main 미병합 — 누적) |
| 2026-06-08 | S1.5 Square 온보딩 | 완료. AdminPaymentView Square 미연동 시 "단말기 불필요·3단계(가입/활성화/연동)·카드+PayPay" 인라인 안내 카드 + 기존 가이드 링크. 스펙+품질 리뷰 통과, 빌드 OK. 커밋 5138de1. (main 미병합) |
| 2026-06-08 | S2 지도 UI | 완료. Leaflet+react-leaflet v5(무료 OSM 타일), 신규 `DiscoverNearbyMap.jsx`(CircleMarker 핀·반경·내위치), NearbyPanel 리스트/지도 토글(기본 리스트)+온디맨드 「このエリアを再検索」(자동검색 없음=비용안전), 핀 팝업 테이크아웃 CTA·お店へ·구글맵 핸드오프. 백엔드 무수정. 스펙+품질 리뷰 통과, 빌드 OK·신규 lint 0. 커밋 (deps)…a20f89a·c3fc103. (main 미병합) |
| 2026-06-08 | S4 LINE 봇 | ✅ 코드 완료 / ⏳ 채널 대기. 핵심 추출(`utils/nearby.py` find_nearby_stores — /nearby 불변)·중립 카드(`utils/nearby_cards.py`)·LINE 어댑터(`utils/line_client.py`)·웹훅(`routers/line_bot.py` /api/webhooks/line)·LIFF 자동로그인 주문동선. WhatsApp 어댑터만 추가하면 유럽 확장. 단위테스트 20/20, import 정상, 스펙+품질 리뷰 통과(서명검증·토큰무노출). 커밋 e1da878…6f1917b. **활성화: 대표님 LINE 채널 토큰을 .env에 입력 + 웹훅 URL 등록 후 E2E.** |
| 2026-06-08 | S3 실시간 신호(가벼움) | 완료. `/nearby`에 `takeout_default_wait_minutes`+`open_only` 필터, 리스트 카드 営業中/準備中 뱃지·「約N分で受取」(선결제·영업중 시), 営業中のみ 필터, 지도 팝업 ⚡割引中·픽업ETA. 집계쿼리 미추가(비용안전), 토큰 무노출. 스펙+품질 리뷰 통과, pytest 9/9·빌드 OK. 커밋 ece0235·6ebd5a4·e5f2c3f. (main 미병합) |
