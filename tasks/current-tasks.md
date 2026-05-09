# Current Tasks — QRaku 개선 사이클

> **사이클 목표**: 단일 서버 + 인메모리 상태에서 **운영 가능한 SaaS 인프라**로 전환의 첫걸음.
> 이번 사이클에서는 인프라 안정화에 집중 (Redis, EventLog, 멱등성, PayPay Webhook, 환불, 멀티테넌시 감사).
> AI 기능 / 멀티 인스턴스 실배포 / PostgreSQL 이전 등은 다음 사이클로.
>
> 모든 카드는 [`docs/coding-rules.md`](../docs/coding-rules.md) 규칙 1~11을 준수해야 한다.
> 작업자: 카드별 `Owner` 필드의 에이전트가 담당.

---

## 작업 완료 시 필수 절차

카드 작업이 끝날 때마다 **반드시 두 가지**를 동시에 처리한다:

1. **진행 보드 상태 갱신** — 해당 카드의 상태를 `TODO → ✅ DONE`으로 변경
2. **`tasks/work-log.md`에 append** — 아래 템플릿 사용:

```markdown
## [카드ID] 제목
**날짜**: YYYY-MM-DD
**담당**: 에이전트명 (모델)
**커밋**: `<hash>`

### 변경 파일
- `path/to/file` (신규/수정, N LOC) — 한 줄 설명

### 마이그레이션
없음 / `# [날짜] 목적` — SQL 내용

### 검증 결과
- ✅/❌ 수용 기준 항목별 결과

### 비고
- 운영자 액션 필요 항목
- 다음 가능 작업
- 특이사항
```

> 두 파일 모두 같은 커밋에 포함하거나, 작업 커밋 직후 별도 커밋으로 추가.

---

## 진행 보드

| ID | 제목 | Phase | 우선순위 | Owner | 모델 | 상태 |
|---|---|---|---|---|---|---|
| INF-01 | Redis 클라이언트 도입 | 1 | 🔴 P0 | backend-reliability | **sonnet** | ✅ DONE |
| INF-02 | EventLog 모델 + 헬퍼 | 1 | 🔴 P0 | backend-reliability | **sonnet** | ✅ DONE |
| INF-03 | Idempotency-Key 헬퍼 + Order 컬럼 | 1 | 🔴 P0 | backend-reliability | **sonnet** | ✅ DONE |
| INF-04 | WebhookEvent 모델 (멱등성) | 1 | 🔴 P0 | backend-reliability | **sonnet** | ✅ DONE |
| INF-05 | 헬스체크 엔드포인트 | 1 | 🟡 P2 | backend-reliability | **sonnet** | ✅ DONE |
| PAY-01 | PayPay Webhook 엔드포인트 | 1 | 🔴 P0 | backend-reliability | **sonnet** | ✅ DONE |
| PAY-02 | 환불 라우터 | 1 | 🔴 P0 | backend-reliability | **sonnet** | ✅ DONE |
| PAY-03 | 결제 영역 에러 메시지 정제 | 1 | 🟡 P2 | backend-reliability | **sonnet** | ✅ DONE |
| SEC-01 | 멀티테넌시 감사 (모든 라우터 grep) | 1 | 🔴 P0 | architect → backend-reliability | **opus → sonnet** | ✅ DONE |
| FE-01 | Display Toggle URL 가드 | 1 | 🟡 P2 | (frontend) | **sonnet** | TODO |
| WS-01 | WebSocket 이벤트 헬퍼 (`utils/events.py`) | 2 | 🟠 P1 | websocket-specialist | **sonnet** | ✅ DONE |
| WS-02 | WebSocket Redis Pub/Sub 어댑터 | 2 | 🟠 P1 | architect → websocket-specialist | **opus → sonnet** | TODO |
| WS-03 | WebSocket 인증 토큰 | 2 | 🟠 P1 | websocket-specialist | **sonnet** | ✅ DONE |
| WS-04 | 클라이언트 훅 통일 (heartbeat/재연결) | 2 | 🟡 P2 | websocket-specialist | **sonnet** | TODO |
| OPS-01 | Dockerfile + docker-compose (개발용) | 3 | 🟡 P2 | architect → backend-reliability | **opus → sonnet** | TODO |
| OPS-02 | Dramatiq + 첫 워커 (번역) | 3 | 🟡 P2 | architect → backend-reliability | **opus → sonnet** | TODO |
| OPS-03 | Alembic 도입 (신규 변경부터) | 3 | 🟡 P2 | architect → backend-reliability | **opus → sonnet** | TODO |

> **우선순위 표기**: 🔴 P0 (출시 전 필수) / 🟠 P1 (이번 사이클 내) / 🟡 P2 (사이클 후반)

### 모델 선택 규칙

| 모델 | 언제 쓰나 |
|---|---|
| **opus** | ① 새 컴포넌트 도입 결정 (Redis Pub/Sub 어댑터 설계, Dramatiq vs Celery, Alembic 전략), ② 폭이 넓고 트레이드오프가 많은 분석 (멀티테넌시 감사처럼 30개 라우터 전체 스캔), ③ 카드 자체를 새로 작성/수정. **`architect` 에이전트는 항상 opus.** |
| **sonnet** | 카드의 허용 파일이 명확하고 코드 스니펫까지 박혀있는 **순수 구현 작업**. 대부분의 INF/PAY/WS/FE/OPS 카드. **`backend-reliability` / `websocket-specialist` 에이전트는 sonnet**. |

**`opus → sonnet` 표기 의미**: 먼저 opus가 카드 정밀화/설계 검토(작업 시작 전 카드 보강) → 그 다음 sonnet이 구현. 두 단계로 나눠 시키면 토큰 비용은 줄고 품질은 안정적.

### 지시 예시

```
# 단순 구현
INF-01 sonnet으로 backend-reliability 에이전트로 작업해줘.

# 설계 검토 후 구현 (2단계)
SEC-01 opus의 architect로 먼저 정밀화 → 그 다음 sonnet의 backend-reliability로 구현해줘.

# 모델 전환
/model claude-opus-4-7   ← 카드 정밀화/큰 설계 결정 시
/model claude-sonnet-4-6  ← 실제 코드 작성 시
```

---

## 운영자 미완료 항목 (코드 외 작업)

| ID | 항목 | 비고 |
|---|---|---|
| OPR-01 | `ENCRYPTION_KEY` 운영 환경 발급 | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| OPR-02 | `VITE_LINE_LIFF_ID` LIFF 앱 발급 | LINE Developers Console |
| OPR-03 | `FRONTEND_BASE_URL=https://qraku.com` 설정 | PayPay 콜백용 |
| OPR-04 | `VISION_API_KEY` GCP Vision API 활성화 | 사진 NSFW 자동 차단 (선택) |
| OPR-05 | `REDIS_URL` 운영 환경 Redis 인스턴스 | INF-01 완료 후 |
| OPR-06 | PayPay 콘솔에 webhook URL 등록 | PAY-01 배포 후 |

---

# Phase 1 — Reliability Foundation

---

## 🟦 INF-01 — Redis 클라이언트 도입

**Owner**: backend-reliability
**Priority**: 🔴 P0
**Depends on**: 없음
**Blocks**: INF-03, INF-04, WS-02, OPS-02

### 배경

현재 캐시·분산 락·Pub/Sub·큐 모두 없음. 모든 후속 작업의 기반이 Redis.
공식 라이브러리: **`redis-py >= 5.0`** (asyncio 지원 내장, 별도 `aioredis` 패키지 불필요).

### 허용 파일

- `backend/utils/redis.py` (신규)
- `backend/main.py` (라이프사이클 훅에 init/close 호출 추가, 4줄 이내)
- `backend/.env.example` (`REDIS_URL` 추가)
- `pyproject.toml` (의존성 1줄 추가)

### 금지

- 라우터 수정 금지
- 기존 어떤 dict 캐시도 제거하지 않음 (이건 다른 카드)

### 구현 요구사항

1. `utils/redis.py`:
   - `redis.asyncio.Redis` 싱글톤 (`get_redis()`)
   - 연결 시 `decode_responses=True`
   - 시작 시 `await client.ping()`로 연결 검증, 실패 시 명확한 에러
   - `REDIS_URL` 미설정 시 명확한 에러 (예: `"REDIS_URL environment variable is required"`)
2. `main.py`:
   - `@app.on_event("startup")`에서 `await init_redis()`
   - `@app.on_event("shutdown")`에서 `await close_redis()`
3. `.env.example`:
   ```
   REDIS_URL=redis://localhost:6379/0
   ```
4. `pyproject.toml`: `redis>=5.0`

### 수용 기준

- [ ] 서버 시작 시 Redis ping 성공 시 부팅, 실패 시 즉시 종료 (`sys.exit(1)`)
- [ ] `from utils.redis import get_redis`로 어디서든 사용 가능
- [ ] `.env.example`에 변수 추가됨
- [ ] 다른 라우터/모델 변경 없음

### 검증

```bash
# Redis 없는 상태에서 서버 시작 → 즉시 실패해야 함
unset REDIS_URL
uv run uvicorn backend.main:app --port 8003

# Redis 있을 때
docker run -d -p 6379:6379 redis:7-alpine
export REDIS_URL=redis://localhost:6379/0
uv run uvicorn backend.main:app --port 8003
# 시작 로그에 "Redis connected" 표시
```

### 참고

- [`docs/architecture.md`](../docs/architecture.md) §2.2 Redis
- [`docs/coding-rules.md`](../docs/coding-rules.md) 규칙 9 (환경변수 추가)

---

## 🟦 INF-02 — EventLog 모델 + 헬퍼

**Owner**: backend-reliability
**Priority**: 🔴 P0
**Depends on**: 없음
**Blocks**: PAY-01, PAY-02, WS-01

### 배경

[`docs/coding-rules.md`](../docs/coding-rules.md) 규칙 8 — 모든 상태 변경 작업은 감사 로그가 필수.
현재는 어떤 통합 감사 테이블도 없음.

### 허용 파일

- `backend/models.py` (하단에 `EventLog` 클래스 append만)
- `backend/utils/event_log.py` (신규)
- `backend/database.py` (인덱스용 마이그레이션 1~2줄 추가)

### 금지

- 라우터에서 사용 시작은 별도 카드 (PAY-01, PAY-02, WS-01에서 자연스럽게 채택)

### 구현 요구사항

#### 모델 (`models.py` append)

```python
from sqlalchemy import Column, Text

class EventLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(index=True)
    actor_type: str = Field(max_length=32)  # customer | staff | admin | system | webhook
    actor_id: Optional[str] = Field(default=None, max_length=64)
    action: str = Field(max_length=64, index=True)  # order.created, refund.issued, ...
    target_type: Optional[str] = Field(default=None, max_length=32)
    target_id: Optional[int] = Field(default=None, index=True)
    payload_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    external_payload_raw: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
```

#### 헬퍼 (`utils/event_log.py`)

```python
async def log_event(
    session: AsyncSession,
    *,
    store_id: int,
    actor_type: str,
    action: str,
    actor_id: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    payload: dict | None = None,
    external_payload_raw: str | None = None,
) -> EventLog:
    """현재 트랜잭션에 EventLog 추가. commit은 호출자 책임."""
    log = EventLog(
        store_id=store_id,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload_json=json.dumps(payload, ensure_ascii=False) if payload else None,
        external_payload_raw=external_payload_raw,
    )
    session.add(log)
    return log
```

#### 마이그레이션 (`database.py`)

> 새 테이블이므로 `metadata.create_all`이 자동 생성.
> **단, 인덱스 일부는 수동 추가**:

```python
# [2026-05-09] EventLog 검색 최적화: (store_id, created_at) 복합 인덱스
"CREATE INDEX IF NOT EXISTS idx_eventlog_store_time ON eventlog(store_id, created_at)",
"CREATE INDEX IF NOT EXISTS idx_eventlog_store_action ON eventlog(store_id, action)",
```

### 수용 기준

- [ ] 서버 재시작 시 `eventlog` 테이블 자동 생성
- [ ] 인덱스 2개 생성됨
- [ ] `log_event()` 호출 시 commit 없이 `session.add`만 함 (호출자 트랜잭션 안에 합류)
- [ ] `payload`는 한국어/일본어 문자가 깨지지 않음 (`ensure_ascii=False`)

### 검증

```python
# 단발 스크립트로 검증
async with AsyncSessionLocal() as session:
    await log_event(session, store_id=1, actor_type="system", action="test")
    await session.commit()
# 직접 SELECT로 확인
```

### 참고

- [`docs/coding-rules.md`](../docs/coding-rules.md) 규칙 8

---

## 🟦 INF-03 — Idempotency-Key 헬퍼 + Order 컬럼

**Owner**: backend-reliability
**Priority**: 🔴 P0
**Depends on**: INF-01 (Redis)
**Blocks**: PAY-01, PAY-02

### 배경

클라이언트 재시도/연타로 인한 중복 결제·주문 차단. [`docs/payment-rules.md`](../docs/payment-rules.md) §2 참고.

### 허용 파일

- `backend/utils/idempotency.py` (신규)
- `backend/models.py` (Order에 `idempotency_key` 컬럼 1줄 추가)
- `backend/database.py` (마이그레이션 2줄 추가)
- `backend/.env.example` (`IDEMPOTENCY_TTL_SECONDS=86400` 추가)

### 금지

- 라우터에서 사용 시작은 PAY-01, PAY-02 카드에서 진행
- 기존 결제 라우터 변경은 이 카드에서 안 함

### 구현 요구사항

#### 헬퍼 (`utils/idempotency.py`)

```python
async def with_idempotency(
    key: str,
    ttl: int,
    fn: Callable[[], Awaitable[T]],
) -> T:
    """
    SETNX로 잠금 → 실행 → 결과 캐시 → 반환.
    중복 키:
      - 처리 중: HTTPException 409
      - 완료됨: 캐시된 결과 반환
    """
    redis = await get_redis()
    lock_key = f"idem:{key}:lock"
    result_key = f"idem:{key}:result"

    cached = await redis.get(result_key)
    if cached:
        return json.loads(cached)

    if not await redis.set(lock_key, "1", ex=60, nx=True):
        # 다른 워커가 처리 중
        raise HTTPException(status_code=409, detail="요청 처리 중입니다.")

    try:
        result = await fn()
        await redis.set(result_key, json.dumps(result, default=str), ex=ttl)
        return result
    finally:
        await redis.delete(lock_key)
```

#### Order 컬럼 추가

`models.py`의 `Order` 클래스:
```python
idempotency_key: Optional[str] = Field(default=None, max_length=64, index=True, unique=True)
```

#### 마이그레이션

```python
# [2026-05-09] Order에 클라이언트 idempotency_key 추가
"ALTER TABLE `order` ADD COLUMN idempotency_key VARCHAR(64) NULL",
"CREATE UNIQUE INDEX idx_order_idem_key ON `order`(idempotency_key)",
```

### 수용 기준

- [ ] 같은 키로 빠르게 두 번 호출 → 두 번째는 `409` (잠금 보유 중)
- [ ] 첫 호출 완료 후 같은 키로 재호출 → `200` + 첫 결과
- [ ] 다른 키 / TTL 만료 후 → 정상 처리
- [ ] Order 테이블에 컬럼 추가됨, 기존 행은 NULL OK

### 검증

```python
import asyncio
async def slow_op():
    await asyncio.sleep(2)
    return {"ok": True}

# 두 번 동시 호출
await asyncio.gather(
    with_idempotency("test1", 60, slow_op),
    with_idempotency("test1", 60, slow_op),
)
# 한쪽은 결과, 한쪽은 HTTPException 409
```

---

## 🟦 INF-04 — WebhookEvent 모델 (외부 webhook 멱등성)

**Owner**: backend-reliability
**Priority**: 🔴 P0
**Depends on**: 없음
**Blocks**: PAY-01

### 배경

Stripe / PayPay / Square webhook은 **재시도가 잦다**. 같은 이벤트를 두 번 처리하면 중복 결제/환불.

### 허용 파일

- `backend/models.py` (`WebhookEvent` 모델 append)
- `backend/database.py` (인덱스 마이그레이션 1줄)

### 구현 요구사항

#### 모델

```python
class WebhookEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    provider: str = Field(max_length=32, index=True)  # stripe | paypay | square
    event_id: str = Field(max_length=128, index=True, unique=True)
    received_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    signature_valid: bool = Field(default=False)
    processed: bool = Field(default=False)
    payload_raw: Optional[str] = Field(default=None, sa_column=Column(Text))
```

#### 마이그레이션

```python
# [2026-05-09] WebhookEvent 조회용 복합 인덱스
"CREATE INDEX IF NOT EXISTS idx_webhookevent_provider_received ON webhookevent(provider, received_at)",
```

### 수용 기준

- [ ] 같은 `event_id` 두 번 INSERT 시 UNIQUE 위반 → 호출자가 catch 후 "이미 처리됨" 판단 가능
- [ ] `payload_raw`는 webhook 원문 그대로 저장 (디버깅/감사용)

---

## 🟦 INF-05 — 헬스체크 엔드포인트

**Owner**: backend-reliability
**Priority**: 🟡 P2
**Depends on**: INF-01

### 허용 파일

- `backend/main.py` (2개 엔드포인트 추가, 라우터에 두지 않고 main에 직접 — 인프라 성격)

### 구현 요구사항

```python
@app.get("/api/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/api/readyz")
async def readyz(session: AsyncSession = Depends(get_session)):
    try:
        await session.execute(text("SELECT 1"))
        redis = await get_redis()
        await redis.ping()
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="not ready")
```

### 수용 기준

- [ ] `GET /api/healthz` 항상 200
- [ ] `GET /api/readyz` DB·Redis 연결 OK 시 200, 실패 시 503

---

## 🟦 PAY-01 — PayPay Webhook 엔드포인트

**Owner**: backend-reliability
**Priority**: 🔴 P0
**Depends on**: INF-01, INF-02, INF-04
**참고**: [`docs/payment-rules.md`](../docs/payment-rules.md) §3.2

### 배경

손님이 PayPay 콜백 페이지를 닫으면 주문 미생성. webhook이 안전망 역할.

### 허용 파일

- `backend/routers/webhooks.py` (이미 존재 — PayPay 분기 추가)
- `backend/services/pos/adapters/paypay_direct_adapter.py` (서명 검증 헬퍼 추가, 1 함수 이내)
- `backend/.env.example` (`PAYPAY_WEBHOOK_SECRET` 추가)

### 금지

- `paypay.py` 라우터 수정 (콜백 처리는 그대로 둠 — webhook은 별도 안전망)
- 새 라우터 파일 생성 금지 (`webhooks.py`에 추가)

### 구현 요구사항

#### 엔드포인트 (`webhooks.py`)

```python
@router.post("/api/webhooks/paypay")
async def paypay_webhook(
    request: Request,
    x_signature: str = Header(...),
    session: AsyncSession = Depends(get_session),
):
    raw = await request.body()
    if not verify_paypay_signature(raw, x_signature):
        raise HTTPException(status_code=401, detail="invalid signature")

    payload = json.loads(raw)
    notification_id = payload["notification_id"]
    merchant_payment_id = payload["merchant_payment_id"]

    # 멱등성: WebhookEvent UNIQUE
    event = WebhookEvent(
        provider="paypay",
        event_id=notification_id,
        signature_valid=True,
        payload_raw=raw.decode(),
    )
    session.add(event)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        return {"status": "duplicate"}

    state = payload.get("state")
    if state == "COMPLETED":
        # 보류 결제 → Order 생성 (또는 기존 Order 업데이트)
        order = await find_or_create_order_from_paypay(session, merchant_payment_id, payload)
        await log_event(session, store_id=order.store_id,
                        actor_type="webhook", action="payment.completed",
                        target_type="order", target_id=order.id,
                        external_payload_raw=raw.decode())
    elif state in ("CANCELED", "FAILED"):
        await log_event(session, store_id=...,  # 보류 결제에서 store_id 추출
                        actor_type="webhook", action="payment.failed",
                        external_payload_raw=raw.decode())

    event.processed = True
    await session.commit()

    if state == "COMPLETED" and order:
        await emit_payment_completed(order.store_id, order)

    return {"status": "ok"}
```

#### 서명 검증

PayPay 공식 sample 따라 HMAC-SHA256 구현.

#### 보조: merchant_payment_id 로 Order 조회

`Order` 모델에 이미 PayPay 추적 필드가 있는지 확인 (`paypay_merchant_payment_id` 등). 없으면 별도 카드로 추가.

### 수용 기준

- [ ] 잘못된 서명 → 401
- [ ] 같은 notification_id 두 번 → 두 번째는 `{"status": "duplicate"}`, Order 중복 생성 안 됨
- [ ] COMPLETED 시 Order 생성 + EventLog + WebSocket broadcast
- [ ] 콜백 페이지(`PayPayCompleteView`)와 webhook **둘 다** 같은 결제 처리해도 단일 Order만 존재 (멱등성)
- [ ] `.env.example`에 `PAYPAY_WEBHOOK_SECRET` 추가

### 운영자 액션

- PayPay 콘솔에 webhook URL 등록: `https://qraku.com/api/webhooks/paypay` (OPR-06)

---

## 🟦 PAY-02 — 환불 라우터

**Owner**: backend-reliability
**Priority**: 🔴 P0
**Depends on**: INF-01, INF-02, INF-03
**참고**: [`docs/payment-rules.md`](../docs/payment-rules.md) §4

### 허용 파일

- `backend/routers/admin.py` (환불 엔드포인트 추가) — 또는 새 파일 `routers/refunds.py` (architect 결정)
- `backend/utils/refunds.py` (이미 존재 — 필요 시 부분환불 분기 보강만)

> **결정 사항**: 환불은 어드민 인증이 필요하고 `admin.py`의 다른 환불 관련 작업과 묶여야 하므로 **`admin.py`에 추가**. (architect 동의 시)

### 구현 요구사항

```python
@router.post("/api/admin/orders/{order_id}/refund")
async def refund_order(
    order_id: int,
    body: RefundRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await with_idempotency(
        key=f"refund:{admin_store.id}:{idempotency_key}",
        ttl=settings.IDEMPOTENCY_TTL_SECONDS,
        fn=lambda: _do_refund(session, order_id, body, admin_store),
    )

async def _do_refund(session, order_id, body, admin_store):
    order = await session.get(Order, order_id)
    if not order or order.store_id != admin_store.id:
        raise HTTPException(status_code=404, detail="Not found")
    if order.payment_status != "paid":
        raise HTTPException(status_code=400, detail="결제 완료 상태가 아닙니다")

    refund_log = await perform_refund(session, order, amount=body.amount, reason=body.reason)

    if refund_log.amount >= order.total_amount:
        order.payment_status = "refunded"
    else:
        order.payment_status = "partial_refund"

    await log_event(session, store_id=order.store_id,
                    actor_type="admin", actor_id=str(admin_store.id),
                    action="refund.issued",
                    target_type="order", target_id=order.id,
                    payload={"amount": refund_log.amount, "reason": body.reason})
    await session.commit()

    await emit_refund_issued(order.store_id, order, refund_log)
    return {"refund_id": refund_log.id, "amount": refund_log.amount, "status": "ok"}
```

### 수용 기준

- [ ] `Idempotency-Key` 헤더 필수 (없으면 422)
- [ ] 다른 매장 주문 → 404
- [ ] `payment_status != "paid"` → 400
- [ ] 부분환불 → `partial_refund` 상태
- [ ] 전액환불 → `refunded` 상태
- [ ] 합계가 Order 총액 초과 → 400
- [ ] EventLog 기록됨
- [ ] WebSocket broadcast (`emit_refund_issued`)
- [ ] PAY_AT_COUNTER 거부 (자동 환불 미지원)

---

## 🟦 PAY-03 — 결제 영역 에러 메시지 정제

**Owner**: backend-reliability
**Priority**: 🟡 P2
**Depends on**: 없음
**참고**: [`docs/coding-rules.md`](../docs/coding-rules.md) 규칙 7

### 배경

`paypay.py`, `orders.py`, `pos.py`, `square_oauth.py`에서 `raise HTTPException(detail=str(e))` 패턴이 있을 가능성.
외부 결제사 raw 메시지가 응답에 노출되면 정보 누출.

### 허용 파일

- `backend/routers/paypay.py`
- `backend/routers/orders.py`
- `backend/routers/pos.py`
- `backend/routers/square_oauth.py`

### 작업 절차

1. `Grep "str(e)" backend/routers/`로 사이트 산출
2. 각 사이트에서:
   - `logger.exception("...", extra={"store_id": ...})` 추가
   - 응답은 일반화된 메시지로 (`"외부 결제사 오류"`, `"요청을 처리할 수 없습니다"` 등)
3. 함수 시그니처는 변경 금지

### 수용 기준

- [ ] grep으로 `str(e)`가 응답 detail에 사용되는 곳 0건
- [ ] 모든 변경 사이트가 `logger`로 내부 로깅 보존
- [ ] 외부 호출 사이트에는 timeout이 명시됨 (없는 곳은 추가 — 단, 기본값만)

---

## 🟦 SEC-01 — 멀티테넌시 감사 (모든 라우터 grep)

**Owner**: backend-reliability
**Priority**: 🔴 P0
**Depends on**: 없음
**참고**: [`docs/coding-rules.md`](../docs/coding-rules.md) 규칙 5

### 배경

ChatGPT의 ⑧번 우려: 모든 query에 `store_id`가 강제되는가? IDOR 누락은 없는가?
이미 일부 적용됐지만 라우터가 30개 가까이 있어 사각지대 가능.

### 작업 절차

1. **인벤토리 작성** — 모든 라우터의 SELECT/UPDATE/DELETE 위치 수집:
   ```
   Grep "session.get\|session.execute\|select(" backend/routers/
   ```
2. 각 사이트에서 검증:
   - [ ] `store_id` 또는 `shop_id` 필터가 있는가?
   - [ ] 응답으로 `password_hash`, `master_pin`, 토큰 등 누설 없음?
   - [ ] 수정/삭제 엔드포인트는 owner 검증 패턴이 있는가?
3. **누락된 곳에 가드 추가** — 단, 응답 형식은 변경하지 않음.
4. 보고서: `tasks/sec-audit-report.md` (신규 — 이 카드 한정 산출물)

### 허용 파일

- `backend/routers/*.py` (가드 추가만)
- `tasks/sec-audit-report.md` (신규)

### 금지

- 라우터 함수 시그니처 변경
- 응답 본문 형식 변경
- "더 일관된 패턴"으로 기존 코드 리팩토링

### 수용 기준

- [ ] 인벤토리 보고서에 라우터별 검증 결과 기록
- [ ] 누락된 가드 모두 추가 (커밋별로 라우터 1개씩)
- [ ] 응답 형식 변경 0건
- [ ] WebSocket 채널도 동일하게 검증 (`store_id` 격리)

### 검증

- 다른 store_id로 어드민 토큰 발급 후 모든 수정 엔드포인트 호출 시 404가 나오는지 (수동 또는 간단 스크립트)
- WebSocket 다른 store_id 메시지 수신 안 되는지

---

## 🟦 FE-01 — Display Toggle URL 가드

**Owner**: (frontend, 별도 에이전트 없음 — 일반 작업자)
**Priority**: 🟡 P2

### 배경

`use_kitchen_page` / `use_register_page` / `use_staff_page` 가 false여도 URL 직접 접속 시 화면이 뜸. 현재는 AdminView UI에서만 숨김.

### 허용 파일

- `frontend-react/src/views/KitchenView.jsx`
- `frontend-react/src/views/StaffView.jsx`
- `frontend-react/src/views/RegisterView.jsx`
- 또는 공통 가드 컴포넌트 1개 신설 (`components/guards/PageEnabledGuard.jsx`)

### 구현 요구사항

매장 설정 fetch 후 해당 toggle이 false면 `/:shop_id/home`으로 리다이렉트 + 토스트.

### 수용 기준

- [ ] 토글 OFF 상태에서 직접 URL 접속 시 즉시 리다이렉트
- [ ] 어드민(`require_admin` 토큰 보유)은 미리보기 목적으로 접근 가능 (예외 분기)

---

# Phase 2 — Realtime Robustness

---

## 🟪 WS-01 — WebSocket 이벤트 헬퍼 (`utils/events.py`)

**Owner**: websocket-specialist
**Priority**: 🟠 P1
**Depends on**: INF-02 (EventLog)
**Blocks**: WS-02

### 배경

라우터마다 `manager.broadcast(json.dumps({...}))`를 직접 호출 중. envelope 형식이 제각각 → 표준화.
[`docs/websocket-rules.md`](../docs/websocket-rules.md) §3 참고.

### 허용 파일

- `backend/utils/events.py` (신규)
- `backend/routers/orders.py`
- `backend/routers/pos.py`
- `backend/routers/tabehoudai.py`
- `backend/routers/admin.py`
- `backend/routers/staff_auth.py` (필요 시)
- 그 외 `manager.broadcast` 호출 사이트

### 구현 요구사항

#### `utils/events.py`

```python
async def _emit(
    session: AsyncSession,
    *,
    store_id: int,
    type: str,
    priority: str,
    data: dict,
    table_number: str | None = None,
) -> None:
    envelope = {
        "type": type,
        "event_id": ulid(),
        "store_id": store_id,
        "ts": datetime.utcnow().isoformat() + "Z",
        "priority": priority,
        "data": data,
    }
    if priority == "critical":
        await log_event(session, store_id=store_id, actor_type="system",
                        action=type, payload=data)
    msg = json.dumps(envelope, ensure_ascii=False)
    if table_number:
        await manager.broadcast_to_customer(msg, store_id, table_number)
    else:
        await manager.broadcast(msg, store_id)

async def emit_order_created(session, store_id, order): ...
async def emit_order_updated(session, store_id, order): ...
async def emit_order_cancelled(session, store_id, order, reason): ...
async def emit_payment_completed(session, store_id, order): ...
async def emit_payment_failed(session, store_id, order, code): ...
async def emit_refund_issued(session, store_id, order, refund_log): ...
async def emit_tabehoudai_session_started(session, store_id, table_number, session_obj): ...
async def emit_tabehoudai_session_ended(session, store_id, table_number, session_obj): ...
async def emit_staff_call(session, store_id, table_number, message): ...
```

#### 라우터 교체

각 라우터의 `manager.broadcast(...)` 호출을 위 헬퍼로 1:1 교체. 함수 시그니처/응답 형식은 변경 금지.

### 수용 기준

- [ ] `manager.broadcast`를 라우터에서 직접 호출하는 곳 0건
- [ ] envelope 형식이 모든 메시지에 적용
- [ ] critical 이벤트는 EventLog에도 기록
- [ ] WebSocket broadcast는 `await session.commit()` 이후에만 호출
- [ ] 클라이언트 호환성 유지 (envelope에 기존 dict가 `data`로 래핑되므로 클라이언트도 같은 사이클에 갱신 필요 — WS-04 카드)

### 주의

- 클라이언트는 현재 `JSON.parse(event.data).order_id` 형태로 파싱 중일 수 있음.
- 호환성을 위해 **WS-01 + WS-04는 같은 배포 단위**로 묶음. 또는 envelope에 legacy 필드를 같이 넣고 단계적 마이그레이션.

---

## 🟪 WS-02 — WebSocket Redis Pub/Sub 어댑터

**Owner**: websocket-specialist
**Priority**: 🟠 P1
**Depends on**: INF-01, WS-01
**참고**: [`docs/websocket-rules.md`](../docs/websocket-rules.md) §2.1

### 허용 파일

- `backend/utils/websocket.py` (Pub/Sub 통합 — 시그니처 보존)

### 구현 요구사항

1. `ConnectionManager.broadcast` 내부에서:
   - 인스턴스 ID 포함 envelope을 Redis `PUBLISH ws:store:{store_id}` 발행
   - 로컬 dict에는 직접 echo (자기 인스턴스가 SUBSCRIBE 콜백에서 수신 시 인스턴스 ID로 중복 필터)
2. 서버 시작 시 SUBSCRIBE 콜백 백그라운드 task 시작 (`asyncio.create_task`)
3. `connect()` 시 처음 보는 store_id면 SUBSCRIBE 채널에 추가 (또는 패턴 SUBSCRIBE `ws:store:*`)

### 수용 기준

- [ ] docker-compose 2 replicas 환경에서 인스턴스 A에 연결한 클라이언트가 B에서 발행한 이벤트 수신
- [ ] 단일 인스턴스에서는 추가 지연 < 50ms
- [ ] 자기 인스턴스가 발행한 메시지를 SUBSCRIBE에서 수신해도 클라이언트에 중복 전달 안 됨

---

## 🟪 WS-03 — WebSocket 인증 토큰

**Owner**: websocket-specialist
**Priority**: 🟠 P1
**Depends on**: INF-01

### 허용 파일

- `backend/routers/ws_token.py` (신규)
- `backend/routers/ws.py` (각 엔드포인트에 토큰 검증 추가)
- `backend/main.py` (라우터 등록 1줄)

### 구현 요구사항

#### `POST /api/ws/token`

요청:
```json
{ "store_id": 123, "audience": "kitchen" }      # 또는 "customer" + table_number
```

처리:
- `audience == "admin"|"kitchen"|"register"`: `require_admin` 또는 마스터PIN 세션 검증
- `audience == "customer"`: 공개 (단, store_id + table_number 검증)
- 랜덤 토큰 생성 → Redis `ws:token:{token}` 에 `{store_id, audience, table_number, exp}` 저장 (TTL = `WS_AUTH_TOKEN_TTL_SECONDS`, 기본 300)

응답: `{ "token": "...", "expires_at": "..." }`

#### `ws.py` 검증

```python
@router.websocket("/ws/kitchen/{store_id}")
async def websocket_endpoint(websocket: WebSocket, store_id: int, token: str = Query(...)):
    info = await validate_ws_token(token, expected_audience="kitchen", expected_store_id=store_id)
    if not info:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, store_id)
    ...
```

### 수용 기준

- [ ] 토큰 없이 연결 시도 → 1008 close
- [ ] 다른 store_id 토큰 → 1008
- [ ] customer 토큰으로 admin 채널 접근 → 1008
- [ ] 만료 토큰 → 1008
- [ ] 정상 토큰 → 연결 성공

---

## 🟪 WS-04 — 클라이언트 훅 통일 (heartbeat / 재연결)

**Owner**: websocket-specialist
**Priority**: 🟡 P2
**Depends on**: WS-01, WS-03

### 허용 파일

- `frontend-react/src/hooks/useWebSocket.js` (신규 또는 통합)
- 사용처: `KitchenView.jsx`, `StaffView.jsx`, `OrderView.jsx`, `RegisterView.jsx`, `AdminView.jsx`

### 구현 요구사항

훅 인터페이스:
```js
const { lastEvent, status, reconnect } = useWebSocket({
  audience: 'kitchen',
  storeId,
  tableNumber,         // customer만
  onEvent: (event) => { ... },
});
```

내부 동작:
1. `POST /api/ws/token` 호출 → 토큰 받기 (만료 30초 전 갱신)
2. `wss://.../ws/{audience}/{storeId}?token=...` 연결
3. 30초마다 `{type:"ping"}` 송신, 60초 무응답 시 재연결
4. 끊김 시 지수 백오프 1s/2s/5s/10s/30s
5. 재연결 시 마지막 `event_id`를 query로 → catch-up
6. envelope의 `store_id !== currentShopId` 메시지는 무시 (이중 가드)

### 수용 기준

- [ ] 끊김 → 자동 재연결
- [ ] heartbeat 정상 동작
- [ ] 재연결 후 누락 이벤트 수신
- [ ] 사용처 모두 훅으로 통일

---

# Phase 3 — Scale-Out Preparation

---

## 🟫 OPS-01 — Dockerfile + docker-compose (개발용)

**Owner**: architect 설계 → backend-reliability 구현
**Priority**: 🟡 P2

### 허용 파일

- `Dockerfile` (백엔드용, 신규 또는 갱신)
- `docker-compose.yml` (개발용, 신규)
- `.dockerignore`

### 구현 요구사항

`docker-compose.yml`:
- `backend` 서비스 (FastAPI, replicas=2 — Pub/Sub 검증용)
- `frontend` 서비스 (Vite dev server)
- `mysql:8`
- `redis:7-alpine`
- `worker` 서비스 (Dramatiq, OPS-02 이후)

### 수용 기준

- [ ] `docker-compose up`만으로 전 시스템 부팅
- [ ] 2 replicas 환경에서 WS-02 검증 가능
- [ ] 운영 배포 스크립트(`deploy.py`)는 변경 안 함 (별도 카드)

---

## 🟫 OPS-02 — Dramatiq + 첫 워커 (번역)

**Owner**: backend-reliability
**Priority**: 🟡 P2
**Depends on**: INF-01, OPS-01

### 허용 파일

- `backend/workers/__init__.py` (신규)
- `backend/workers/broker.py` (신규)
- `backend/workers/translate_tasks.py` (신규)
- `backend/routers/translate.py` (이미 동기 호출 중일 가능성 — 큐 enqueue로 교체)
- `pyproject.toml` (`dramatiq[redis]` 추가)
- `.env.example` (`DRAMATIQ_BROKER_URL` 추가)

### 구현 요구사항

1. Dramatiq Redis 브로커 설정
2. 메뉴 번역 작업을 워커로 이전
3. 라우터에서는 `translate_menu.send(menu_id)` 형태로 enqueue
4. 결과는 별도 폴링 또는 WebSocket 통지

### 수용 기준

- [ ] 메뉴 등록 시 응답 시간 < 200ms (번역은 백그라운드)
- [ ] 워커 프로세스 재시작 시 인플라이트 작업 유실 안 됨
- [ ] 워커 실패 시 재시도 정책 (최대 3회, 지수 백오프)

---

## 🟫 OPS-03 — Alembic 도입 (신규 변경부터)

**Owner**: architect 설계 → backend-reliability 구현
**Priority**: 🟡 P2

### 허용 파일

- `alembic/` (디렉토리 전체, 신규)
- `alembic.ini` (신규)
- `pyproject.toml` (`alembic` 추가)

### 구현 요구사항

- 기존 `database.py`의 인라인 마이그레이션은 **유지** (운영 안정성).
- Alembic은 **신규 스키마 변경부터** 사용.
- `migration_sqls`와 alembic이 충돌하지 않도록 가이드 문서를 `docs/architecture.md`에 추가.

### 수용 기준

- [ ] `alembic upgrade head`가 빈 DB에서 성공
- [ ] 기존 운영 환경에서는 alembic 적용 안 해도 정상 부팅
- [ ] 다음부터의 모델 변경 → alembic 리비전 + 인라인 SQL 둘 다 추가 (이중 안전망 기간)

---

# 의존 관계 그래프

```
INF-01 (Redis)
  ├─→ INF-03 (Idempotency)
  │     ├─→ PAY-02 (Refund)
  │     └─→ PAY-01 (PayPay Webhook)
  ├─→ WS-02 (Pub/Sub)
  ├─→ WS-03 (WS Token)
  ├─→ INF-05 (Healthz)
  └─→ OPS-02 (Dramatiq)

INF-02 (EventLog)
  ├─→ PAY-01, PAY-02
  └─→ WS-01 (Event helper)

INF-04 (WebhookEvent)
  └─→ PAY-01

WS-01 ─→ WS-02 ─→ WS-04
WS-03 ─→ WS-04

OPS-01 (docker-compose) ─→ OPS-02 (워커 검증), WS-02 검증
```

# 추천 작업 순서

1. **INF-01** (Redis) — 모든 후속의 기반
2. **INF-02** (EventLog) — 동시 가능
3. **INF-04** (WebhookEvent) — 동시 가능
4. **INF-03** (Idempotency) — INF-01 후
5. **INF-05** (Healthz) — INF-01 후
6. **PAY-01** (PayPay Webhook) — INF-01,02,04 후
7. **PAY-02** (환불) — INF-01,02,03 후
8. **SEC-01** (멀티테넌시 감사) — 가장 손이 많이 가지만 코드 의존성 없음, 병렬 가능
9. **PAY-03** (에러 메시지) — 마무리
10. **FE-01** (Display Toggle) — 백엔드와 독립
11. (Phase 2) **WS-01 → WS-02 → WS-03 → WS-04**
12. (Phase 3) **OPS-01 → OPS-02 → OPS-03**

---

# 카드 작성 규칙 (이 파일 갱신 시)

새 작업 카드 추가 시 반드시 포함:

1. **ID** (도메인 약자 + 번호)
2. **Owner** (어느 에이전트가 담당)
3. **Priority** (🔴 P0 / 🟠 P1 / 🟡 P2)
4. **Depends on / Blocks**
5. **배경** (왜 하는가)
6. **허용 파일** (File Fence)
7. **금지** (하지 않을 일)
8. **구현 요구사항** (구체 코드 스니펫까지)
9. **수용 기준** (체크박스로)
10. **검증** (어떻게 확인)
11. **참고 문서**

작업 완료 시:
1. 진행 보드 상태를 `TODO` → `✅ DONE`으로 갱신
2. [`tasks/work-log.md`](./work-log.md)에 완료 기록 append (이 파일 상단의 템플릿 사용)
3. 헤더의 "사이클 목표"에 영향이 있으면 [`docs/architecture.md`](../docs/architecture.md)도 갱신
