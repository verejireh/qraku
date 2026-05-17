# Payment Rules — QRaku

> 결제는 **돈이 오가는 곳**이고, 잘못되면 즉시 클레임/환불 분쟁으로 이어진다.
> 이 문서는 **3-Track 결제 시스템(Square / PAY_AT_COUNTER / PayPay Direct)**과
> Stripe(구독) 처리에 적용되는 모든 규칙을 정의한다.

---

## 1. 결제 트랙 개요

| 트랙 | 사용처 | 결제 시점 | 관리자 설정 위치 |
|---|---|---|---|
| **Square 결제** | 테이크아웃 카드/PayPay (Square 통합) | 주문 시 즉시 | `/admin/payment` Track 1 |
| **PAY_AT_COUNTER** | EatIn (계산대 결제) | 식사 후 | 기본값 |
| **PayPay Direct** | 테이크아웃 / EatIn 둘 다 | 주문 시 또는 정산 시 | `/admin/payment` Track 3 |

> **Stripe**는 위 3-Track과 별개로 **매장 운영자용 SaaS 구독** 결제 (`billing.py`). 손님 결제와 무관.

### 1.1 어댑터 패턴

```
backend/services/pos/
├─ base.py                          ← BasePaymentAdapter, BasePOSAdapter
├─ adapters/
│  ├─ square_adapter.py             ✅ 동작
│  ├─ paypay_direct_adapter.py      ✅ 동작
│  ├─ smaregi_adapter.py            ❌ placeholder
│  └─ airregi_adapter.py            ❌ placeholder
└─ factory.py                       ← get_payment_adapter(), get_pos_adapter()
```

**새 결제 수단 추가 시**: 어댑터 1개 추가 + factory 분기 추가. 라우터는 건드리지 않는다.

---

## 2. 멱등성 (Idempotency) 규칙 — 핵심

> 결제는 **멱등하지 않으면 즉시 이중 청구**가 발생한다. 모든 결제 경로는 다음을 만족해야 한다.

### 2.1 멱등성 키의 3계층

| 계층 | 키 | 저장 위치 | TTL |
|---|---|---|---|
| **클라이언트 → 서버** | `Idempotency-Key` HTTP 헤더 (UUID v4 권장) | Redis (`idem:{key}`) | 24h (`IDEMPOTENCY_TTL_SECONDS`) |
| **서버 → 외부 결제사** | 결제사별 키 (Square `idempotency_key`, PayPay `merchant_payment_id`, Stripe `Idempotency-Key`) | DB (Order/PaymentLog 컬럼) | 영구 |
| **DB UNIQUE 제약** | `Order.square_payment_id` UNIQUE, `Order.idempotency_key` UNIQUE | MySQL | 영구 |

### 2.2 클라이언트 → 서버 (Idempotency-Key 헤더)

**적용 대상 엔드포인트**:
- `POST /api/orders/...` (주문 생성)
- `POST /api/paypay/create-payment`
- `POST /api/admin/orders/{id}/refund` (환불)

**처리 패턴** (`utils/idempotency.py`에 헬퍼로):

```python
async def with_idempotency(key: str, ttl: int, fn):
    # 1) Redis에 SETNX
    if await redis.set(f"idem:{key}:lock", "1", ex=60, nx=True):
        # 첫 요청 — 실제 작업 수행
        try:
            result = await fn()
            await redis.set(f"idem:{key}:result", json.dumps(result), ex=ttl)
            return result
        except Exception:
            await redis.delete(f"idem:{key}:lock")
            raise
    else:
        # 중복 요청 — 결과 대기 / 반환
        cached = await redis.get(f"idem:{key}:result")
        if cached:
            return json.loads(cached)
        # 진행 중이면 409 반환 (또는 짧은 폴링)
        raise HTTPException(status_code=409, detail="요청 처리 중입니다.")
```

> 클라이언트 헤더가 없으면? 서버가 즉시 거부하지 않고, **요청 본문 해시**(주문 내용 SHA256)를 fallback 키로 사용 (단기 5분 TTL). 단, 결제 엔드포인트에서는 헤더를 **필수**로 한다.

### 2.3 서버 → 외부 결제사

| 결제사 | 멱등 필드 | 비고 |
|---|---|---|
| **Square** | `idempotency_key` (요청 본문) | 이미 `square_client.py`에서 사용 중. **재시도 시 같은 키 유지**. |
| **PayPay Direct** | `merchant_payment_id` | `secrets.token_urlsafe(24)` — Order에 1:1 매핑. |
| **Stripe (구독)** | `Idempotency-Key` 헤더 | `billing.py`에서 적용. |
| **환불** | 자체 `refund_request_id` | RefundLog에 저장. |

### 2.4 DB UNIQUE 제약

이미 적용:
- `Order.square_payment_id` UNIQUE — 같은 Square payment_id로 중복 Order 생성 방지.

**이번 사이클 추가**:
- `Order.idempotency_key VARCHAR(64) NULL UNIQUE` — 클라이언트 키로 중복 차단.
- `WebhookEvent.event_id VARCHAR(128) UNIQUE` — webhook 중복 처리 차단.

### 2.5 중복 요청 시 동작

| 상황 | 응답 |
|---|---|
| 첫 요청 처리 중 (잠금 보유 상태에서 같은 키 재요청) | `409 Conflict` + `{"detail": "요청 처리 중입니다."}` |
| 첫 요청 완료 후 같은 키 재요청 | `200 OK` + 첫 요청 결과 그대로 반환 |
| 다른 키로 같은 주문 내용 | (정책) 짧은 시간 내(60초)에 같은 본문 해시면 1회 fallback 차단 |

---

## 3. Webhook 처리 규칙

### 3.1 공통 원칙

모든 webhook 엔드포인트(`backend/routers/webhooks.py`)는:

1. **서명 검증** — 결제사별 시크릿으로 HMAC 검증. 실패 시 `401`.
2. **멱등성 키 추출** — webhook의 고유 ID (Stripe `event.id`, PayPay `notification_id`, Square `event_id`).
3. **WebhookEvent 테이블에 INSERT** — UNIQUE 제약 위반 시 = 이미 처리됨 → `200`만 반환하고 종료.
4. **본 처리** — Order 상태 업데이트, EventLog 기록.
5. **응답** — 결제사가 재시도하지 않도록 `200 OK`. 처리 실패라도 (서명 OK 한정) `200`을 우선 — 내부 큐에 적재 후 워커에서 재시도.

### 3.2 PayPay Webhook (P0 — 미구현)

`POST /api/paypay/webhook`:

**요청 본문 (PayPay 공식)**:
```json
{
  "notification_id": "...",
  "merchant_payment_id": "...",
  "merchant_order_id": null,
  "state": "COMPLETED" | "CANCELED" | "FAILED",
  "amount": { "amount": 1234, "currency": "JPY" },
  "request_id": "..."
}
```

**처리 순서**:
1. PayPay 서명 검증 (`Authorization: hmac auth`)
2. `WebhookEvent`에 `notification_id` UNIQUE INSERT
3. `merchant_payment_id`로 보류 중인 주문 찾기 (별도 `PendingPayPayPayment` 테이블 또는 Order에 `merchant_payment_id` 컬럼)
4. `state == "COMPLETED"`이면 Order 생성 + `payment_status = "paid"`
5. `state in ("CANCELED", "FAILED")`이면 보류 항목 삭제, 손님에게 안내
6. EventLog 기록 (`payment.completed` 또는 `payment.failed`)
7. WebSocket broadcast (`emit_payment_completed`)

> ⚠️ **현재**: 손님이 PayPay 콜백 페이지를 닫으면 주문 미생성. **webhook이 안전망 역할** — 페이지 닫혀도 주문 생성됨.
> 콜백 페이지(`PayPayCompleteView.jsx`)와 webhook이 **둘 다** 주문을 생성하려 시도할 수 있음 → 멱등성으로 처리: 같은 `merchant_payment_id`로 이미 Order 있으면 그 Order 반환.

### 3.3 Stripe Webhook

기존 `billing.py`에 있을 가능성 — **변경 시**:
1. 서명 검증은 `stripe.Webhook.construct_event()` 사용.
2. `event.id`를 WebhookEvent에 기록 (현재 미적용이면 추가).
3. `customer.subscription.updated` / `invoice.payment_failed` 등을 분기.

### 3.4 Square Webhook

테이크아웃 결제 후 Square 측 상태 변화 (refund 등) 수신용.
- 등록 URL: PayPay와 같은 `routers/webhooks.py`에 endpoint 추가 (`POST /api/webhooks/square`).
- 서명 헤더: `x-square-hmacsha256-signature`.

---

## 4. 환불 (Refund) 규칙 — P0 미구현

### 4.1 엔드포인트

```
POST /api/admin/orders/{order_id}/refund
  body: { amount: int(부분환불 시), reason: str }
  auth: require_admin + store_id 교차 검증
  Idempotency-Key: 헤더 필수
```

### 4.2 처리 순서

1. `require_admin`으로 어드민 검증.
2. Order 조회 + `order.store_id == admin_store.id` 확인 (없으면 404).
3. `Idempotency-Key`로 Redis 중복 차단.
4. `utils/refunds.perform_refund()` 호출:
   - 결제 트랙(`payment_method_type`)에 따라 어댑터 분기 (Square / PayPay)
   - 외부 환불 API 호출
   - 응답을 `RefundLog`에 자동 기록
5. Order의 `payment_status = "refunded"` (전액) 또는 `"partial_refund"` (부분) 갱신.
6. EventLog 기록 (`refund.issued`).
7. WebSocket broadcast (`emit_refund_issued`).
8. 응답: `{ refund_id, amount, status }`.

### 4.3 부분 환불

- `RefundLog.amount`에 환불 금액 저장.
- 같은 Order에 대해 여러 RefundLog 가능. 합계가 Order 총액 초과 시 거부 (`400`).

### 4.4 환불 가능 조건

- `payment_status in ("paid",)` — 미결제 / 이미 환불 완료된 주문 거부.
- 결제 어댑터가 환불 미지원이면 거부 (PAY_AT_COUNTER는 자동 환불 불가, 수동 처리만 가능 — UI에서 안내).

---

## 5. 금액 검증 규칙

### 5.1 클라이언트 amount 절대 신뢰 금지

이미 적용 (PayPay) — **모든 결제 경로에 동일 원칙**:
- 클라이언트가 보낸 `amount`는 무시.
- 서버에서 `Order.items + 옵션 + 세금 + 食べ放題 코스 가격`으로 재계산.
- 결제사에 보낼 금액은 **재계산된 값만 사용**.

### 5.2 食べ放題 정산

- `is_tabehoudai = true`인 OrderItem은 `unit_price = 0`.
- 코스 가격은 `TabehoudaiSession.group.price_per_person × num_people`.
- Register 화면에서: `items_subtotal + tabehoudai_total = total`.

### 5.3 세금

- `Store.tax_inclusive` (포함/별도)에 따라 표시 분기.
- 외부 결제사에 보낼 금액은 항상 **소비자 최종 지불 금액 (세금 포함)**.

### 5.4 음수 / 0 / 비현실적 금액 거부

- 합계가 ≤ 0이면 결제 시도 자체를 거부 (`400`).
- 단일 OrderItem `quantity ≤ 0` 거부 (이미 적용).
- 이상 상한선 (예: ¥10,000,000) 초과 시 거부 + 알림 (사기 시도 가능성).

---

## 6. 보안 규칙

### 6.1 비밀 정보 암호화

이미 적용:
- `paypay_api_key` / `paypay_api_secret` — Fernet (`enc:v1:` 접두사)
- `square_access_token` / `square_refresh_token` — Fernet

**규칙**:
- DB에 저장하는 모든 외부 결제사 토큰/키는 `utils/crypto.encrypt_secret()`로 암호화.
- 사용 시점에 `_resolve_*_token()` 류 헬퍼로 복호화.
- **로그에 평문 토큰 출력 절대 금지.** 로깅 전 `mask_secret()`.

### 6.2 PCI 범위 최소화

- 카드 PAN / CVV는 **절대 서버에 도달시키지 않는다** — Square Web Payments SDK가 nonce화.
- 서버는 nonce + 금액만 다룸.
- 영수증 / DB / 로그 어디에도 카드 번호 흔적 남기지 않음.

### 6.3 서명 검증

| Webhook | 검증 방법 |
|---|---|
| Stripe | `stripe.Webhook.construct_event(payload, sig_header, secret)` |
| PayPay | HMAC-SHA256 (PayPay 공식 sample) |
| Square | `x-square-hmacsha256-signature` HMAC |

검증 실패 = `401` + EventLog에 의심 이벤트 기록 (감사 / 알람용).

### 6.4 멀티테넌시 (결제 영역)

- 다른 매장의 PaymentSettings 절대 노출 금지 (특히 토큰).
- 환불 / 결제 조회 엔드포인트는 모두 `order.store_id == admin_store.id` 검증.
- Square OAuth 콜백 — `state` 파라미터에 store_id 포함 + 서명. CSRF 방지.

---

## 7. 에러 메시지 정책 (결제 영역)

| 상황 | 응답 |
|---|---|
| 외부 결제사 거절 | `402 Payment Required` + `{"detail": "결제가 거절되었습니다.", "code": "card_declined"}` |
| 외부 결제사 timeout | `504 Gateway Timeout` + 일반 메시지 |
| 멱등성 충돌 (처리 중) | `409 Conflict` |
| 멱등성 재요청 (이미 완료) | `200 OK` + 기존 결과 |
| 금액 불일치 / 음수 | `400 Bad Request` |
| 토큰 만료 / 권한 부족 | `401` / `403` |

> 외부 결제사의 raw 에러 메시지는 **EventLog에만 기록**, 응답에는 노출하지 않는다 ([`coding-rules.md` 규칙 7](./coding-rules.md#규칙-7--에러-응답-정책)).

---

## 8. 감사 (Audit) 의무

다음 작업은 **반드시 EventLog 기록**:
- `payment.attempted` — 결제 시도 시작
- `payment.completed` — 결제 성공
- `payment.failed` — 결제 실패
- `refund.requested` — 환불 요청 수신
- `refund.issued` — 환불 처리 완료
- `webhook.received` — webhook 도착 (서명 검증 후)
- `webhook.duplicate` — 중복 webhook 차단

각 로그에 `external_payload_raw` (외부 결제사 응답 통째로) 저장 — 클레임 대응 필수.

---

## 9. 변경 시 체크리스트 (결제 코드 수정자용)

- [ ] 클라이언트 amount 신뢰하지 않고 서버에서 재계산하는가?
- [ ] Idempotency-Key 헤더가 멱등성 헬퍼를 거치는가?
- [ ] 외부 결제사 호출 시 결제사별 멱등 키를 동일 재시도에서 유지하는가?
- [ ] 응답에 외부 raw 에러 메시지를 노출하지 않는가?
- [ ] EventLog 기록을 추가했는가?
- [ ] Order의 store_id 교차 검증이 있는가?
- [ ] 토큰/시크릿이 평문 로그에 찍히지 않는가?
- [ ] 환불 가능 조건(`payment_status == "paid"`)을 검사하는가?
- [ ] WebSocket broadcast는 트랜잭션 commit **후**에 호출하는가?
- [ ] 새 환경변수가 있다면 `.env.example`을 갱신했는가?

---

## 10. 참고

- 코딩 규칙: [`coding-rules.md`](./coding-rules.md)
- WebSocket 이벤트 카탈로그: [`websocket-rules.md`](./websocket-rules.md#32-이벤트-카탈로그-초기)
- 작업 카드: [`../tasks/current-tasks.md`](../tasks/current-tasks.md)
