# Coding Rules — QRaku Harness Engineering

> **핵심 원칙**: AI는 범위를 최대화하려 하고, 하네스는 범위를 최소화한다.
> 요청된 파일만 수정하고, 요청된 기능만 구현하며, "더 잘하려는" 시도는 하지 않는다.

이 문서는 모든 에이전트가 작업 시작 전 반드시 읽어야 하는 **공통 규칙**이다.
새 규칙은 이 파일에만 추가하고, 각 도메인 전용 규칙은 `websocket-rules.md`, `payment-rules.md` 같은 분리된 파일에 둔다.

---

## 규칙 1 — 변경 허용 파일 (File Fence)

작업 요청 시 **지정된 파일 외에는 절대 수정하지 않는다.**

| 작업 종류 | 허용 파일 |
|---|---|
| 새 API 엔드포인트 | 해당 도메인 라우터 파일만 (예: 결제 → `paypay.py`) |
| 새 모델 추가 | `backend/models.py` 하단에 append만 |
| 스키마 마이그레이션 | `backend/database.py`의 `migration_sqls` 리스트 끝에만 추가 |
| 프론트 컴포넌트 수정 | 지정된 컴포넌트 파일만 |
| 새 라우터 추가 | 새 파일 생성 + `backend/main.py`에 `include_router` 등록만 |
| 새 백그라운드 워커 작업 | `backend/workers/{domain}_tasks.py`에만 추가 |

### 금지 사항

- 기존 함수 시그니처 변경 (특히 라우터 함수, API 응답 구조)
- 요청하지 않은 파일을 "일관성을 위해" 수정하는 행위
- 기존 패턴을 "더 나은 방식"으로 리팩토링하는 행위
- 사용 중인 의존성 버전 임의 업그레이드
- `requirements.txt` / `pyproject.toml` / `package.json`에 작업 범위 외 패키지 추가

### 작업 종료 시 자기 검증 체크리스트

- [ ] 수정한 파일 목록이 작업 요청서의 "허용 파일"과 **정확히** 일치하는가?
- [ ] 기존 함수의 인자/리턴 타입을 바꾸지 않았는가?
- [ ] "더 나아 보여서" 추가한 변경이 없는가?

---

## 규칙 2 — 마이그레이션 태그 규칙

`backend/database.py`의 `migration_sqls`에 항목 추가 시 **반드시 날짜와 목적 주석**을 붙인다.

```python
# [2026-05-09] Redis 큐 작업 추적용 컬럼
"ALTER TABLE `order` ADD COLUMN dispatch_state VARCHAR(32) DEFAULT 'pending'",
```

### 마이그레이션 작성 원칙

1. **이미 존재하는 컬럼 추가**: 중복 에러가 자동 무시되므로 안전 — 다만 **중복 라인을 두 번 추가하면 안 됨**. 추가 전 `Grep "<컬럼명>" backend/database.py`로 확인.
2. **새 테이블**: `SQLModel.metadata.create_all`이 자동 생성 → `ALTER TABLE` 불필요. 새 모델 클래스만 `models.py`에 추가하면 됨.
3. **컬럼 타입 변경**은 절대 자동 마이그레이션에 넣지 않는다 — 수동 운영 작업으로 분리.
4. **DROP COLUMN / DROP TABLE**은 자동 마이그레이션에 절대 넣지 않는다.
5. **인덱스/UNIQUE 제약 추가**: 별도 라인으로 명시 (`CREATE INDEX`, `ALTER TABLE ... ADD CONSTRAINT`).

---

## 규칙 3 — 라우터 책임 경계

각 라우터 파일의 담당 도메인을 엄격히 지킨다. **도메인 경계를 넘는 코드는 끼워넣지 않는다.**

| 파일 | 담당 |
|---|---|
| `orders.py` | 주문 생성, Square 테이크아웃 선결제 |
| `pos.py` | 스태프용 정산/결제 (EatIn) |
| `admin.py` | 매장 설정, 스태프 CRUD, 출퇴근 토글, 근태 통계 |
| `staff_auth.py` | 마스터PIN/스태프 로그인 인증만 |
| `menu_groups.py` | 메뉴 그룹 CRUD |
| `tabehoudai.py` | 食べ放題 세션 관리 |
| `billing.py` | Stripe 구독 관리 |
| `square_oauth.py` | Square OAuth 연동 |
| `paypay.py` | PayPay Direct 결제/콜백 |
| `webhooks.py` | 외부 결제사 webhook 수신 (Stripe / PayPay / Square) |
| `ws.py` | WebSocket 엔드포인트 정의만 (브로드캐스트 로직은 `utils/websocket.py`) |

**새 도메인 기능은 반드시 새 파일로 생성한다.** 기존 파일에 끼워넣기 금지.

### 도메인 신설 시 절차

1. 새 라우터 파일 생성 (`backend/routers/<domain>.py`)
2. `APIRouter(prefix="/api/<domain>", tags=["<domain>"])`로 prefix 명시
3. `backend/main.py`에 `from routers import <domain>` + `app.include_router(<domain>.router)`
4. `current-tasks.md`의 작업 카드에 새 파일을 명시

---

## 규칙 4 — 테마뷰 수정 규칙

7개 테마뷰는 병렬 구조로 존재한다:
`SakuraThemeView`, `CosmosThemeView`, `SunflowerThemeView`, `LavenderThemeView`, `AjisaiThemeView`, `CamelliaThemeView`, `BambooThemeView`

| 상황 | 적용 규칙 |
|---|---|
| 특정 테마만 지정 | 해당 파일만 수정 |
| "모든 테마에 적용" 명시 | 7개 전체 동일 패턴 적용 |
| 명시 없음 | 테마뷰 수정 금지 — 사용자에게 어느 테마인지 확인 |

### 핵심 데이터 레이어 보호

- **`OrderView.jsx`** — 모든 테마뷰의 공통 데이터 레이어. props 시그니처(`tabehoudaiMenuIds`, `session` 등) 변경 금지. 새 prop 추가 시 7개 테마뷰 모두 안전하게 받도록 default 값 보장.
- **`MagnoliaCartModal.jsx`** — 결제 핵심 파일. **결제 관련 요청 외에는 건드리지 않는다.**

### 알려진 패턴

- `overflow-hidden` + `backdrop-blur-xl` 조합에서 `position: fixed` 모달이 잘리는 문제 → `createPortal`로 해결됨 (`MenuGroupsSection.jsx` 참고). 같은 문제 발생 시 동일 패턴 적용.

---

## 규칙 5 — 멀티테넌시 강제 규칙

이 서비스는 SaaS이며, **다른 매장의 데이터가 노출되면 즉시 비즈니스가 끝난다.** 모든 새 코드는 다음을 만족해야 한다.

### Backend

1. **모든 SELECT/UPDATE/DELETE 쿼리에 `store_id` 또는 `shop_id` 필터가 있어야 한다.**
2. 라우터 함수에서 `entity_id`를 받아 가져온 후 반드시 소유 검증:
   ```python
   entity = await session.get(Model, entity_id)
   if not entity or entity.store_id != resolved_store.id:
       raise HTTPException(status_code=404, detail="Not found")
   ```
   (404 사용 — 존재 여부 누설 방지)
3. **WebSocket 메시지 송신**도 `store_id` 격리. `manager.broadcast(message, store_id)` 형태로만 호출. 전체 브로드캐스트 함수 절대 만들지 않음.
4. **파일 업로드 경로**(GCS 등)는 반드시 `store_<id>/...` 접두사를 가짐.
5. **공개(공인되지 않은) 엔드포인트**에서 `store_id`를 path/쿼리로 받을 때, 응답에 다른 store의 데이터가 섞이지 않도록 명시적 필터링.

### Frontend

1. URL `/:shop_id/...` 패턴에서 가져온 `shop_id`만 사용. 로컬스토리지에 캐시된 다른 매장 ID 우선시 금지.
2. JWT가 다른 store에 속한 어드민이면 호출 거부 (`require_admin`이 서버에서 검증해주므로 클라이언트는 단순 호출만).

---

## 규칙 6 — 멱등성 (Idempotency) 강제 규칙

> 자세한 결제 멱등성 규칙은 [`payment-rules.md`](./payment-rules.md) 참조. 여기에는 일반 원칙만.

다음 작업은 **항상 멱등하게** 작성한다:

- 외부 결제사 webhook 수신
- 주문 생성 (재시도 시 중복 주문 금지)
- 환불 처리
- 백그라운드 워커 작업 (재시도 시 중복 부수효과 금지)

### 패턴

1. 클라이언트에서 `Idempotency-Key` 헤더 또는 `request_id` 필드 받기.
2. UNIQUE INDEX로 DB 레벨 보호 (예: `Order.square_payment_id`, `WebhookEvent.event_id`).
3. 중복 요청 감지 시 **기존 결과를 반환** (에러 아님).

---

## 규칙 7 — 에러 응답 정책

| 상황 | 응답 |
|---|---|
| 입력 검증 실패 | `400 Bad Request` + 필드별 메시지 (`{field: "이유"}` 형식) |
| 인증 실패 | `401 Unauthorized` (토큰 없음/만료) |
| 권한 부족 | `403 Forbidden` (다른 매장 자원 접근 등) |
| 자원 없음 / 다른 매장 자원 | `404 Not Found` (존재 누설 방지) |
| 멱등성 충돌 | 이미 처리된 결과를 `200`으로 반환 |
| 외부 결제사/POS 실패 | `502 Bad Gateway` + 일반화된 메시지 |
| 서버 내부 오류 | `500` + 일반화된 메시지 (스택트레이스 노출 금지) |

### 절대 금지

- `raise HTTPException(detail=str(e))` — 내부 예외 메시지를 그대로 노출
- `try: ... except: pass` — 조용한 실패
- 응답 본문에 SQL 쿼리/스택트레이스/내부 경로 포함

### 권장 패턴

```python
import logging
logger = logging.getLogger(__name__)

try:
    result = await do_something()
except SomeKnownError as exc:
    logger.warning("known failure: %s", exc, extra={"store_id": store_id})
    raise HTTPException(status_code=400, detail="요청을 처리할 수 없습니다.")
except Exception as exc:
    logger.exception("unexpected failure", extra={"store_id": store_id})
    raise HTTPException(status_code=500, detail="서버 오류가 발생했습니다.")
```

---

## 규칙 8 — 로깅 / 감사 (Audit) 규칙

> 자세한 이벤트 로그 모델은 `current-tasks.md`의 작업 ID **REL-04** 참조.

1. **모든 상태 변경 작업**(주문 승인, 취소, 환불, PIN 입력, 결제 응답 수신)은 `EventLog` 테이블에 기록한다.
2. 로그에는 반드시 다음 컬럼이 포함된다:
   - `store_id`, `actor_type` (`customer`/`staff`/`admin`/`system`/`webhook`), `actor_id`, `action`, `target_type`, `target_id`, `payload_json`, `created_at`
3. 외부 API의 **응답 원문은 별도 컬럼에 통째로 저장** (`external_payload_raw TEXT`). 디버깅과 클레임 대응에 필수.
4. **PII는 절대 평문 저장 금지** — 카드 PAN, CVV, 마스터PIN 평문, 등은 어떤 로그에도 남기지 않는다.

---

## 규칙 9 — 의존성 / 환경변수 추가

새 환경변수 추가 시 다음을 동시에 처리:

1. 코드에서 `os.getenv("KEY", default)` 또는 사용처 명시
2. `backend/.env.example` 갱신 (없으면 생성)
3. `current-tasks.md`의 해당 작업 카드에 "환경변수 추가" 명시
4. 운영자 액션이 필요한 경우(키 발급 등) `tasks/current-tasks.md`의 "운영자 미완료 항목"에 추가

---

## 규칙 10 — Sub-agent 작업 위임 규칙

(이 프로젝트의 워크플로 — 자세한 건 `agents/*.md` 참조)

| 작업 종류 | 담당 에이전트 |
|---|---|
| 아키텍처 설계, 트레이드오프, 새 컴포넌트 도입 | `architect.md` |
| Redis / 워커 / 감사 로그 / DB 풀 / 멱등성 / 멀티테넌시 검증 | `backend-reliability.md` |
| WebSocket 매니저 / 채널 격리 / Pub/Sub 도입 | `websocket-specialist.md` |

**모든 에이전트는 작업 시작 전 이 `coding-rules.md`를 읽고 시작한다.**

---

## 규칙 11 — 변경된 작업 확인 (Definition of Done)

작업이 "완료"되었다고 보고하기 전에 반드시:

1. 수정 파일 목록을 자기 손으로 다시 한 번 확인 (File Fence 위반 여부)
2. 새 마이그레이션 추가 시 로컬에서 서버 재시작이 통과되는지 확인
3. 결제/주문 관련 변경 시 멱등성 시나리오를 코드에서 짚어봄
4. 멀티테넌시 관련 변경 시 "다른 store_id로 접근 시 404가 나오는가?" 한 번 더 검증
5. 신규 환경변수 / 외부 의존성이 있다면 `.env.example`과 `current-tasks.md`의 운영자 항목을 동시 갱신
