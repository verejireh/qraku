# PayPay webhook auto Order cross-review

Review target: `84d0288` + `9e6cf84`
Date: 2026-05-26 JST

## Executive summary

Webhook fallback 자체는 필요한 변경입니다. 다만 현재 구현은 결제 완료 후 주문 생성이라는 critical path에서 아래 4개를 우선 보완해야 합니다.

1. **P0 - 트랜잭션 경계**: `_auto_create_order_from_pending()`의 `session.rollback()`이 이미 flush 된 `WebhookEvent`와 `EventLog`까지 같은 트랜잭션에서 되돌릴 수 있습니다.
2. **P0 - 빈/부분 Order**: 메뉴가 삭제되었거나 snapshot이 깨진 경우 Order만 생성되고 OrderItem이 0건 또는 부분 생성될 수 있습니다.
3. **P1 - 할인 금액 누락**: `Order.total_amount`는 할인 후 결제액인데 `discount_amount=0`으로 남아 정상 경로와 회계/표시 의미가 달라집니다.
4. **P1 - pickup_code 누락**: takeout 주문인데 자동 생성 경로는 `pickup_code=None`이라 영수증/스태프/KDS UX가 정상 경로와 달라집니다.

운영 배포 후라면 우선 revert보다는 작은 hotfix가 낫습니다. 단, `WebhookEvent` unique 충돌 또는 빈 주문이 이미 관측되면 즉시 revert 후보입니다.

## A. 트랜잭션 경계 + IntegrityError 처리

판정: **실제 발생 가능. P0.**

근거:

- `paypay_webhook()`은 `WebhookEvent`를 `session.add()` 후 `flush()`합니다. (`backend/routers/webhooks.py:259`, `:267`)
- 이후 `_auto_create_order_from_pending()`이 같은 `AsyncSession`에서 `Order`를 `flush()`하고, `IntegrityError` 시 `session.rollback()`을 호출합니다. (`backend/routers/webhooks.py:172`, `:175`)
- 이 rollback은 `_auto_create_order_from_pending()` 내부의 Order insert만 되돌리는 것이 아니라 같은 DB transaction 안의 `WebhookEvent` insert, 앞서 기록된 `EventLog` 후보, pending 변경까지 모두 되돌립니다.

발생 가능한 경로:

- 프론트 폴링 경로가 `/api/orders/`로 Order를 먼저 생성하고, 거의 동시에 webhook fallback이 같은 `paypay_payment_id`로 `Order` insert를 시도하면 `Order.square_payment_id` unique index에서 `IntegrityError`가 납니다.
- 동일 `notification_id`의 중복 webhook만으로는 두 번째 요청이 상단 `WebhookEvent.event_id` unique에서 duplicate로 빠질 가능성이 큽니다. 하지만 첫 번째 요청이 내부 rollback 후 `WebhookEvent` 기록을 잃거나 재삽입/업데이트 상태가 꼬이면, 이후 중복 webhook 처리 의미가 불안정해집니다.
- SQLAlchemy rollback 후 flush 된 객체의 세션 상태는 구현 세부에 의존하기 쉬워서, “outer에서 `event.processed=True; commit()` 하면 안전하게 WebhookEvent가 남는다”는 보장을 두면 안 됩니다. 최악은 duplicate 500, 차악은 WebhookEvent 누락입니다.

권장 패턴:

1. `Order` speculative insert는 **nested savepoint** 안에 넣습니다.

```python
try:
    async with session.begin_nested():
        session.add(order)
        await session.flush()
except IntegrityError:
    res = await session.execute(
        select(Order).where(Order.square_payment_id == paypay_payment_id).limit(1)
    )
    return res.scalar_one_or_none()
```

2. `PendingPayPayOrder` 조회는 가능하면 `FOR UPDATE`로 잠급니다. PostgreSQL 기준:

```python
select(PendingPayPayOrder)
  .where(PendingPayPayOrder.merchant_payment_id == merchant_payment_id)
  .with_for_update()
```

3. 더 단순하고 안전한 구조는 `WebhookEvent` idempotency를 PostgreSQL `INSERT ... ON CONFLICT DO NOTHING RETURNING id`로 처리하는 것입니다. insert 실패면 duplicate 반환, 성공이면 같은 transaction에서 처리하고 마지막에 `processed`를 확정합니다.

4. `autoflush=False`만으로는 해결책이 아닙니다. 문제는 flush 타이밍이 아니라 rollback 범위입니다.

## B. Order vs OrderItem partial 생성

판정: **현재 구현은 빈/부분 Order를 만들 수 있음. P0.**

근거:

- 자동 생성 경로는 먼저 `Order`를 add/flush한 뒤 cart loop에서 메뉴를 못 찾으면 `continue`합니다. (`backend/routers/webhooks.py:160`-`:228`)
- 모든 메뉴가 삭제되면 `OrderItem` 0건인 paid takeout Order가 생깁니다.
- 일부 메뉴만 삭제되면 결제액은 전체 cart 기준인데 KDS/스태프에는 일부 품목만 보입니다.
- 정상 경로는 `items_data`가 비면 400으로 거부합니다. (`backend/routers/orders.py:251`)

권장:

- 자동 생성 전에 snapshot 전체를 검증하고, 하나라도 invalid이면 Order 생성하지 말고 `payment.completed.order_missing` 또는 새 action `payment.completed.auto_create_rejected`로 남기는 편이 안전합니다.
- 메뉴 삭제/가격 변경에 강하게 만들려면 `PendingPayPayOrder.cart_snapshot`에 결제 시점의 `menu_name`, `unit_price`, `option_extra_price`를 저장해야 합니다. 지금처럼 DB Menu를 다시 읽으면 결제 시점 cart 재현이 아닙니다.
- 단기 hotfix는 “valid item 수가 snapshot item 수와 다르면 자동 생성 거부”입니다. 빈 Order를 KDS에 내보내는 것보다 수동 처리 로그가 낫습니다.

## C. total_amount vs OrderItem 합계 불일치

판정: **정상 경로와 의미가 달라짐. P1.**

정상 경로:

- `OrderItem.unit_price`는 메뉴 원가 + 옵션가를 보존합니다.
- stamp/coupon 할인은 `total_amount`에서 차감하고 `discount_amount`에 누적합니다. (`backend/routers/orders.py:256`, `:275`-`:338`, `:481`)

자동 생성 경로:

- `order.total_amount = pending.amount`입니다. 이는 PayPay 결제액, 즉 할인 후 금액입니다.
- `OrderItem.unit_price`는 현재 DB 메뉴가 기준이며 할인 미반영입니다.
- `discount_amount`를 세팅하지 않으므로 기본값 0으로 남습니다.

권장:

- 자동 생성 시 검증된 item subtotal을 계산하고 `discount_amount = max(0, item_subtotal - pending.amount)`로 채우세요.
- `pending.amount > item_subtotal`이면 가격 변경/옵션 재현 실패 가능성이 있으므로 자동 생성 거부 또는 별도 critical log가 맞습니다.
- 더 정확한 장기 해법은 B와 동일하게 snapshot에 결제 시점 line price를 저장하는 것입니다. 현재 DB 가격을 재조회하면 메뉴 가격 변경 후 webhook 지연 도착 시 회계가 흔들립니다.

## D. pickup_code 미설정

판정: **회귀 가능. P1.**

근거:

- 정상 `create_order()`는 takeout일 때 당일 JST 기준 `101`부터 pickup_code를 생성합니다. (`backend/routers/orders.py:439`-`:455`)
- 자동 생성 경로는 `pickup_code`를 세팅하지 않습니다.
- 프론트는 null을 일부 fallback 처리하지만 UX가 달라집니다.
  - `KitchenView`는 `#{o.pickup_code || o.id}`로 fallback합니다.
  - `ReceiptView`, `CamelliaReceiptView`는 pickup_code가 없으면 코드 표시/폴링 흐름 일부를 생략합니다.
  - `StaffView`, `RegisterView`는 코드가 있으면 표시합니다.

권장:

- 자동 생성도 정상 경로와 같은 pickup_code 생성 로직을 사용해야 합니다.
- 현재 정상 경로도 동시 주문에서 같은 다음 번호를 뽑을 수 있으므로 완전한 보장은 아닙니다. 그래도 fallback 주문만 null로 두는 것은 운영 식별성을 낮춥니다.
- 가능하면 helper로 추출하고, 나중에 `(shop_id, order_type, business_date, pickup_code)` unique 또는 counter table로 강화하세요.

## E. PendingPayPayOrder TTL race

판정: **30분은 기능적으로는 보수적이나, 운영 fallback 보존 기간으로는 짧을 수 있음. P2.**

근거:

- 생성 시 `expires_at = now + 30 minutes`입니다. (`backend/routers/paypay.py:214`)
- cleanup은 `expires_at < now - 1h`라 물리 삭제는 총 90분 후입니다. (`backend/workers/paypay_cleanup.py:39`, `:45`)
- 하지만 `_auto_create_order_from_pending()`은 `pending.expires_at < now`이면 30분 시점부터 자동 생성을 거부합니다. (`backend/routers/webhooks.py:140`)
- PayPay 공식 문서는 생성된 code/QR의 만료가 `expiryDate`로 관리된다고 설명하고, payment creation timeout은 unknown status로 처리해 query/cancel을 권고합니다. 참고: https://www.paypay.ne.jp/opa/doc/v1.0/webcashier, https://www.paypay.ne.jp/opa/doc/v1.0/dynamicqrcode

권장:

- PayPay create response의 실제 `expiryDate`가 adapter에서 확보 가능하면 `PendingPayPayOrder.expires_at`을 그 값에 맞추세요.
- 확보 불가하면 자동 생성 허용 TTL을 60-90분으로 늘리고, cleanup은 24시간 보존으로 바꾸는 편이 운영 조사에 유리합니다.
- 결제 latency 통계는 로컬 코드만으로 판단할 수 없습니다. `created_at -> consumed_at` 또는 `PayPay acceptedAt -> webhook received_at` histogram을 먼저 쌓아 p99/p999 기준으로 조정하세요.

## F. cleanup 액터 안전성

판정: **현재 규모에서는 큰 위험은 낮지만, 대량 누적 대비 batch delete가 더 안전. P2.**

PostgreSQL lock:

- `DELETE ... WHERE`는 삭제 대상 row에 row-level lock을 잡습니다.
- 새 `INSERT`와는 일반적으로 충돌하지 않습니다.
- 같은 `merchant_payment_id` row를 webhook이 `SELECT/UPDATE` 중이면 해당 row에서 대기할 수 있습니다.

운영 부하:

- 10만 행 정도는 인덱스가 맞으면 감당 가능하지만, 현재 `expires_at`에는 index가 없습니다. `consumed_at`은 index가 있습니다.
- 매시 한 번 대량 삭제하면 autovacuum 부담과 WAL spike가 생길 수 있습니다.

권장:

- index 추가: `PendingPayPayOrder.expires_at`, 가능하면 partial index `consumed_at IS NOT NULL`.
- batch delete: 한 번에 1,000-5,000건씩 삭제하고 반복하거나 cron 주기를 10-15분으로 낮춰 spike를 줄입니다.
- cron 1h는 기능상 가능하지만, 운영 관점에서는 15분 주기 + batch가 더 안정적입니다.

## G. Deploy 후 운영 모니터링

우선순위:

1. **Webhook 처리 에러/unique 충돌/500**
   - A 항목이 payment critical path를 직접 깨뜨립니다.
   - 앱 로그에서 `IntegrityError`, `uq_order_square_payment_id`, `webhook`, `WebhookEvent`를 우선 감시하세요.

2. **빈/부분 Order**

```sql
SELECT o.id, o.shop_id, o.square_payment_id, o.total_amount, o.created_at
FROM "order" o
LEFT JOIN orderitem oi ON oi.order_id = o.id
WHERE o.payment_method = 'PAYPAY_DIRECT'
  AND o.payment_status = 'paid'
  AND o.created_at >= now() - interval '24 hours'
GROUP BY o.id
HAVING count(oi.id) = 0;
```

3. **할인 누락/합계 불일치**

```sql
SELECT o.id,
       o.total_amount,
       o.discount_amount,
       COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS item_sum
FROM "order" o
JOIN orderitem oi ON oi.order_id = o.id
WHERE o.payment_method = 'PAYPAY_DIRECT'
  AND o.created_at >= now() - interval '24 hours'
GROUP BY o.id
HAVING o.discount_amount = 0
   AND COALESCE(SUM(oi.unit_price * oi.quantity), 0) <> o.total_amount;
```

4. **auto_created vs order_missing 비율**

```sql
SELECT action, count(*)
FROM eventlog
WHERE action IN ('payment.completed.auto_created', 'payment.completed.order_missing')
  AND created_at >= now() - interval '24 hours'
GROUP BY action;
```

5. **PendingPayPayOrder 누적/cleanup**

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE consumed_at IS NULL AND expires_at < now()) AS expired_unconsumed,
       count(*) FILTER (WHERE consumed_at IS NOT NULL) AS consumed
FROM pendingpaypayorder;
```

revert 판단:

- `git revert 84d0288 9e6cf84` 자체는 schema drop 없이 코드만 되돌리므로 대체로 안전합니다.
- `PendingPayPayOrder` 테이블은 남아도 기존 코드가 참조하지 않으면 무해합니다.
- 이미 자동 생성된 `Order`는 revert로 없어지지 않습니다. 빈/부분 Order가 생성되었으면 별도 운영 보정이 필요합니다.
- 단, 84d0288 revert 후에는 다시 webhook fallback이 없어져 `payment.completed.order_missing` 수동 처리 상태로 돌아갑니다. 즉시 hotfix가 가능하면 revert보다 P0/P1 보완 배포가 더 낫습니다.

## Suggested hotfix order

1. `_auto_create_order_from_pending()`에서 `PendingPayPayOrder`를 `FOR UPDATE`로 잠그고, Order insert `IntegrityError`는 savepoint로 제한합니다.
2. Order 생성 전 cart 전체를 검증하고 subtotal을 계산합니다. invalid/missing menu/invalid quantity가 하나라도 있으면 자동 생성하지 않습니다.
3. `discount_amount`, `pickup_code`를 정상 경로와 동일 의미로 채웁니다.
4. `expires_at` 정책을 PayPay `expiryDate` 또는 운영 관측 p99 기준으로 재조정합니다.
5. cleanup은 index + batch delete로 바꿉니다.

## Test cases to add

- webhook fallback 성공: pending snapshot -> Order + OrderItem + `discount_amount` + `pickup_code` + events.
- race: `/api/orders/`가 먼저 `Order.square_payment_id`를 생성한 뒤 webhook fallback이 들어오면 duplicate가 200/ok로 수렴하고 `WebhookEvent`가 정상 기록됨.
- duplicate webhook: 같은 `notification_id` 두 번 호출 시 두 번째는 duplicate로 반환되고 Order가 추가 생성되지 않음.
- missing menu: snapshot item 중 하나라도 DB에 없으면 Order가 생성되지 않고 `payment.completed.order_missing` 또는 rejected log가 남음.
- expired pending: 30분/변경 TTL 이후 webhook은 자동 생성하지 않고 로그만 남김.
