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
