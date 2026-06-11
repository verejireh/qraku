# 테이크아웃 미이행 환불 (B-MVP) — 설계 + 계획

> 작성일 2026-06-11 · 브랜치 `claude/naughty-dijkstra-ae5c51`

## 배경 / 문제
테이크아웃 선결제는 Square `autocomplete: True`([square_client.py:163](../backend/utils/square_client.py))로 **즉시 캡처**된다. 그래서 손님이 선결제했는데 가게가 닫혀 있거나 못 만들면 손님이 손해를 본다. → "가게가 이행하지 못하면 환불"(옵션 B)의 첫 단계로, **스태프가 수동으로 '준비 불가 → 전액 환불 + 취소'** 할 수 있게 한다.

## 결정 (사용자 승인)
- 트리거: **수동 버튼만** (시간초과 자동환불 워커는 후속).
- 환불: **전액만** (부분환불 후속).

## 동작
스태프가 테이크아웃 목록에서 「準備不可・返金」 → 확인 → 전액 환불 + 주문 취소 + 손님 실시간 알림. 기존 `perform_refund` 재사용.

## 백엔드 — `backend/routers/register.py` (신규 엔드포인트, `complete_takeout` 옆)
`POST /register/takeout/{order_id}/cancel-refund` · `require_staff_or_admin`
1. 검증: 주문 존재 + `order.store_id == auth_store.id` + `order_type == "take_out"`. 이미 `cancelled`/`refunded` 면 멱등 no-op 반환.
2. 멱등성: `with_idempotency("takeout-refund:{order_id}", ...)` 로 동시 더블클릭/중복환불 차단.
3. 분기:
   - `payment_status == "paid"` → store(payment_settings 로드) + `perform_refund(전액, reason)` → 성공 시 `payment_status="refunded"`, 실패 시 502(주문 paid 유지).
   - 그 외(`unpaid` 등) → 환불 API 없이 취소만.
4. `status = "cancelled"`, commit.
5. `log_event(action="takeout.cancel_refund")` + `emit_order_cancelled(...)`.
6. 반환: `{order_id, status, payment_status, refunded: bool}`.

## 프론트 — `frontend-react/src/views/RegisterView.jsx`
- 테이크아웃 목록 각 행의 "픽업 완료" 옆에 「準備不可・返金」 버튼.
- 확인 다이얼로그(비가역 금전) → 호출 → 성공 시 목록 갱신.

## R3 결제 안전
새 결제 로직 없음 — 기존 `perform_refund` 호출만. 결제 생성/캡처 경로 불변.

## File Fence
- `backend/routers/register.py` (append only)
- `frontend-react/src/views/RegisterView.jsx`
- 재사용·무수정: `perform_refund`, `events.emit_order_cancelled`, `with_idempotency`, `log_event`

## 검증
- 백엔드: 구문/import 스모크 + 멱등·분기 로직 가드. (DB+어댑터 통합 테스트 하네스 부재 → 실환불은 Square sandbox 권장.)
- 프론트: build + 신규 lint 0.

## 제외 (후속)
시간초과 자동환불 워커, 부분환불, 주문 시점 닫힌 가게 차단.

---

## GPT-5.5 코드리뷰 반영 (2026-06-11)

1차 구현이 "기존 perform_refund 재사용 = 안전" 가정 위에 있었으나, 리뷰에서 **Square 환불 레일 자체가 미구현**임이 드러남. 11개 지적을 반영:

- **Crit1 — Square 환불 구현**: `square_client.refund_square_payment`(`POST /v2/refunds`, 주문기준 고정 idempotency_key) 신설 + `SquareAdapter.refund_payment` 실제 구현(기존 "Not implemented" 제거).
- **Crit2/Imp6 — 영속 멱등(이중환불 차단)**: `perform_refund`가 **성공 RefundLog 존재 시 외부 API 재호출 금지**(권위 가드). 외부환불 성공 후 주문 commit 실패해도 재시도가 상태만 복구. PG별 idempotency_key를 주문기준 고정(Square idem-key / PayPay merchantRefundId 안정화). Redis 락은 보조.
- **Imp3 — 원 결제수단 어댑터**: `_adapter_for_order`가 현재 설정이 아니라 `order.payment_method` 기준으로 Square/PayPay 어댑터 선택. (잔여 한계: 자격증명 스냅샷 미보존 — 결제망 완전 교체 시 수동.)
- **Imp4 — 결제ID 없는 자동환불 차단**: 엔드포인트가 `paid` 인데 `square_payment_id` 없으면 409(현금 수동 환불 유도).
- **Imp5/Imp8 — 상태 정책**: `served` 거부(409), `cancelled`/`refunded`/`partial_refund` 멱등 no-op.
- **Imp9 — 손님 통지**: ReceiptView가 테이크아웃을 5초 폴링 → DB `cancelled`/`refunded` 자동 수신. 테마 위임 **전에** 취소·환불 화면 인터셉트(전 테마 공통), 취소 시 폴링 중단.
- **Min10 — 감사 로그 commit**: `log_event` 를 주문 상태와 **같은 commit** 에 포함(유실 방지).
- **Min11 — 프론트**: 요청 중 버튼 잠금(`処理中…`) + 409 메시지 분기. 테이크아웃 목록에서 `cancelled` 제외.

**권한(Imp7) — 의도적 유지**: `require_staff_or_admin`. 점포 미이행 환불은 **카운터 스태프가 현장에서** 처리해야 하는 동작이라 admin 전용은 기능 목적을 훼손. 대신 확인 다이얼로그 + 감사 로그 + 멱등으로 완화. (운영 정책상 admin 전용 원하면 1줄 변경.)

**검증 한계**: Square `/v2/refunds` 는 sandbox 자격증명이 없어 **실결제 환불 E2E 미검증**. 단위검증(어댑터 선택 3테스트)·import·pyflakes·build 통과. **배포 전 Square/PayPay sandbox E2E 필수.**
