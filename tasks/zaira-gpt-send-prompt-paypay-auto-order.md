# 자이라 → GPT 전송 프롬프트 — 세션 J (PAYPAY-AUTO-ORDER 구현 검증)

**작성일**: 2026-05-25
**용도**: 자이라가 GPT-5.5 chat 에 그대로 복붙해서 구현 cross-review 요청
**전제**: PAYPAY-AUTO-ORDER (commit 84d0288) + cleanup 액터 (9e6cf84) 구현 완료 + origin/main push
**미실행**: 운영 VM deploy (다음 세션 첫 작업)

이 GPT review 는 **deploy 전 검증** — 발견 사항을 deploy 와 함께 fix 하거나 deploy 후 별도 사이클로 처리.

---

## 자이라가 GPT 에 보낼 메시지

```text
Claude 가 PayPay webhook 자동 Order 생성 폴백 (commit 84d0288 + cleanup 9e6cf84) 을
구현했습니다. 결제 critical 영역 + 신규 schema + race condition 이 있어 cross-review
부탁드립니다.

배경 / 동기:
- 손님이 PayPay 결제 후 콜백 페이지(/:shop_id/paypay-complete)를 닫거나 폴링 실패하면
  기존에는 webhook 이 payment.completed.order_missing 로그만 남기고 수동 처리 대기.
- 본 변경으로 webhook 이 PendingPayPayOrder snapshot 을 참조해 Order 자동 생성.
- 기존 폴링 경로 (PayPayCompleteView.jsx → POST /api/orders/) 와 race 가능.
  Order.square_payment_id UNIQUE INDEX 가 멱등성 키 역할.

검토 대상 파일 (commit 84d0288 + 9e6cf84, push 완료, deploy 전):

핵심 변경:
- backend/models.py (PendingPayPayOrder 신규 모델, 끝부분)
  · merchant_payment_id UNIQUE + cart_snapshot (JSON Text)
  · amount (스탬프/쿠폰 차감 후 최종) + guest_uuid + stamp_reward_used + coupon_id
  · expires_at (default +30분) + consumed_at — TTL + 멱등성 키
  · 신규 테이블이라 SQLModel.metadata.create_all 자동 생성

- backend/routers/paypay.py (create_paypay_payment, adapter 호출 성공 후)
  · PendingPayPayOrder 행 저장 + commit
  · cart_snapshot = json.dumps([{menu_id, quantity, option_details}])

- backend/routers/webhooks.py
  · _auto_create_order_from_pending() 헬퍼 신규
  · paypay_webhook 의 COMPLETED 분기에서 Order 미발견 + pending 있음 → 자동 생성
  · Order.square_payment_id UNIQUE 충돌 시 IntegrityError → rollback + 기존 Order 반환
  · 자동 생성 시 emit_order_created (KDS) + emit_payment_completed + log_event auto_created

- backend/workers/paypay_cleanup.py (신규)
  · cleanup_pending_paypay_orders 액터
  · 만료 1h 경과 또는 소비 1d 경과 행 삭제
  · cron 등록 권장 (매시 정각)

관련 참조:
- backend/routers/orders.py (정상 경로 create_order, line 99~)
- backend/utils/refunds.py (perform_refund 비교용)
- backend/utils/events.py (emit_order_created / emit_payment_completed)
- frontend-react/src/views/PayPayCompleteView.jsx (폴링 경로)

검증 요청 7 항목:

A. 트랜잭션 경계 + IntegrityError 처리
   _auto_create_order_from_pending 안에서 session.flush() 실패 시 session.rollback()
   을 호출하는데, 이 시점에 같은 session 에서 already-staged WebhookEvent (paypay_webhook
   상단의 멱등성 키) 도 함께 rollback 됨. 그 후 outer paypay_webhook 코드가
   event.processed = True; await session.commit() 을 호출하면 WebhookEvent 가 다시
   삽입되며 UNIQUE 충돌 (event_id) 발생할 수 있음.
   - 실제로 이 경로가 발생 가능한가? (concurrent webhook 이 같은 notification_id 로 두 번 들어오면)
   - 안전한 패턴은? (별도 nested savepoint? autoflush=False? webhook 핸들러를 단일 트랜잭션으로 단순화?)

B. Order vs OrderItem partial 생성
   _auto_create_order_from_pending 에서:
     1. order 를 session.add + flush (UNIQUE 검증)
     2. cart 의 각 item 을 OrderItem 으로 변환하는데 menu 가 삭제됐으면 silently skip
     3. pending.consumed_at 설정
     4. outer 에서 session.commit
   문제 시나리오:
     - 모든 menu 가 삭제된 케이스 → Order 는 생성됐는데 OrderItem 0건 → 빈 Order
     - 일부 menu 만 삭제 → 부분 Order
   현재 정상 경로 (orders.py:251) 는 items_data 빈 경우 raise HTTPException. 자동 생성 경로는
   조용히 빈 Order 만듦.
   - 빈 Order 를 만드는 게 맞는지? (KDS 에 빈 주문 나타남)
   - 차라리 자동 생성 거부 + payment.completed.order_missing 로그가 안전한가?

C. total_amount vs OrderItem 합계 불일치
   order.total_amount = pending.amount (스탬프/쿠폰 차감 후 최종 청구액)
   OrderItem.unit_price = DB Menu.price + 옵션 가산금 (할인 미반영)
   → register/영수증 표시 시 sum(items.unit_price * quantity) ≠ total_amount
   - 현재 정상 경로 (orders.py 의 stamp_reward 처리) 는 어떻게 처리하나?
     (total_amount 는 할인 후, OrderItem unit_price 는 원가 보존, order.discount_amount
      에 차액 기록 — 본 자동 생성 경로는 discount_amount=0)
   - 자동 생성 시 order.discount_amount = sum(items) - pending.amount 계산해 채워야 하나?

D. pickup_code 미설정
   정상 경로 create_order 는 pickup_code 를 생성 (영수증 표시용). 자동 생성 경로는
   pickup_code=None 으로 둠.
   - 영수증/스태프 뷰에서 pickup_code 없을 때 회귀 가능성?
   - 자동 생성도 secrets/uuid 로 pickup_code 채워야 하나?

E. PendingPayPayOrder TTL race
   expires_at = created_at + 30 분. PayPay 결제 자체가 30분 이상 걸리거나 (드물지만 가능)
   webhook 이 지연 도착 시 (PayPay 측 큐 지연), pending 이 만료된 후 Order 자동 생성
   불가 — 현재는 거부 + 로그 경고.
   - 30분 TTL 이 적절한가? PayPay 실 결제 latency 통계 기준 권고?
   - cleanup 액터의 만료 + 1h buffer (총 90분) 이 충분한가?

F. cleanup 액터 안전성
   backend/workers/paypay_cleanup.py 의 DELETE WHERE expires_at < now-1h OR (consumed_at
   IS NOT NULL AND consumed_at < now-1d). 단순 쿼리지만:
   - PostgreSQL 의 LOCK 동작 (DELETE 가 다른 INSERT 와 충돌 가능?)
   - 운영 부하 (10만 행 누적 시 1회 DELETE 시간)?
   - cron 등록 권고 주기 (현재 1h 권장 — 더 적절한 주기?)

G. Deploy 안전성
   신규 테이블 PendingPayPayOrder 는 SQLModel.metadata.create_all 가 첫 부팅 시 자동 생성.
   ALTER TABLE 마이그레이션 없음. 운영 PG (Cloud SQL, advisory_xact_lock 단일 트랜잭션
   패턴 ad19215) 에 안전하게 통합되는지?
   - 첫 deploy 부팅 시 발생 가능한 마이그레이션 에러 케이스?
   - rollback 시나리오 (Order 자동 생성 회귀 발견 → git revert + 재배포) 가 안전한가?
     · PendingPayPayOrder 테이블은 revert 후에도 운영 PG 에 남음 (drop 안 됨, 무해)
     · 이미 자동 생성된 Order 들은 revert 영향 없음

응답을 tasks/gpt-paypay-auto-order-review.md 로 저장 + 커밋해주세요.
응답 즉시 디스크 저장 + 커밋 명시 (이전 회차 교훈).
```

---

## 응답 수신 후 Claude 처리 흐름

GPT 응답이 도착하면 Claude 는:

1. `tasks/gpt-paypay-auto-order-review.md` 로 저장 + 커밋
2. **A (트랜잭션 경계)** — 필요 시 webhooks.py 의 savepoint/nested transaction 패턴 도입
3. **B (partial Order)** — items 0건 거부 또는 일부 누락 시 경고 로그 + 자동 거부 결정
4. **C (total_amount 불일치)** — order.discount_amount 자동 채움 + register 검증
5. **D (pickup_code)** — 자동 생성 경로에도 pickup_code 생성 추가
6. **E (TTL)** — PayPay sandbox/운영 latency 데이터 기반 expires_at 조정
7. **F (cleanup)** — 운영 부하 측정 후 cron 주기 확정
8. **G (deploy)** — must-fix 없으면 deploy 진행, must-fix 있으면 fix 후 deploy

---

## 후속 작업 (응답과 무관하게 진행 가능)

- 운영 VM deploy (다음 세션 첫 작업, HANDOFF v5 §"v5 첫 우선 작업")
- 자이라 수동 smoke (HANDOFF v5 §"권장 자이라 smoke 시나리오")
- PendingPayPayOrder cleanup cron 등록 (PAYPAY-CLEANUP-CRON)
