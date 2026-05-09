# SEC-01 멀티테넌시 감사 보고서
**날짜**: 2026-05-10
**감사자**: backend-reliability (sonnet)
**커밋**: (sec-01 커밋)

---

## 감사 범위

`backend/routers/` 하위 전체 파일 (인증·데모·슈퍼어드민 제외):
admin, orders, pos, register, tables, menus, staff_auth, billing, reviews,
guests, tabehoudai, menu_groups, sessions, takeout, messaging, loyalty_analytics,
stats, stores, ws, translate, discover, webhooks, paypay, square_oauth

---

## 결과 요약

| 파일 | 함수 | 심각도 | 상태 | 비고 |
|---|---|---|---|---|
| `stats.py` | 전체 9개 엔드포인트 | 🔴 CRITICAL | ✅ 수정 완료 | `shop_id` 소유 검증 누락 |
| `billing.py` | `get_subscription_status` | 🔴 CRITICAL | ✅ 수정 완료 | store 소유 검증 누락 |
| `billing.py` | `create_checkout_session` | 🔴 CRITICAL | ✅ 수정 완료 | store 소유 검증 누락 |
| `loyalty_analytics.py` | `get_loyalty_roi` | 🔴 CRITICAL | ✅ 수정 완료 | 인증 없음 + 소유 검증 누락 |
| `takeout.py` | `staff_respond` | 🟠 HIGH | ⚠️ 미수정 | 아래 비고 참조 |
| `takeout.py` | `list_pending_queries` | 🟠 HIGH | ⚠️ 미수정 | 아래 비고 참조 |
| `ws.py` | 전체 WS 엔드포인트 | 🟠 HIGH | ⚠️ WS-03 카드 | WS 인증 토큰 구현 예정 |
| `tables.py` | `transfer_table` | 🟡 MEDIUM | ⚠️ 확인 필요 | 아래 비고 참조 |
| 나머지 모든 파일 | - | ✅ PASS | - | store_id 필터 확인됨 |

---

## 수정 내용 (이번 커밋)

### stats.py — 9개 엔드포인트 전부

**취약점**: `admin_store: Store = Depends(require_admin)` 의존성은 있으나
`shop_id` 쿼리 파라미터를 검증 없이 사용 → 다른 매장의 통계 조회 가능.

**수정**: `_assert_store_access(admin_store, shop_id)` 헬퍼 추가 후 각 함수 첫 줄에 호출.
적용 함수: `get_summary`, `get_daily_sales`, `get_hourly_orders`, `get_top_menus`,
`get_sales_by_category`, `get_sales_by_menu`, `get_hourly_guests`, `get_monthly_sales`, `get_weekly_sales`

### billing.py — 2개 엔드포인트

**취약점**: `_get_store_by_id_or_slug()` 결과에 소유권 검증 없음.

**수정**: 두 함수에 `if store.id != admin_store.id: raise HTTPException(403)` 추가.
- `get_subscription_status`
- `create_checkout_session`

### loyalty_analytics.py — get_loyalty_roi

**취약점**: `require_admin` 의존성 없음 → 완전히 무인증 엔드포인트.

**수정**: `admin_store: Store = Depends(require_admin)` 파라미터 추가 + `if store_id != admin_store.id: raise HTTPException(403)` 추가.

---

## 미수정 항목 및 이유

### takeout.py — staff_respond / list_pending_queries

**취약점**:
- `staff_respond(query_id, ...)`: 인증 없이 `session.get(TakeoutTimeQuery, query_id)` → 순차 ID 추측으로 다른 매장 문의에 응답 가능
- `list_pending_queries(shop_id, ...)`: 인증 없이 임의 `shop_id` 조회 가능

**미수정 이유**: 현재 프론트엔드(StaffView)가 인증 없이 이 엔드포인트를 호출하고 있음.
`require_admin` 또는 마스터PIN 인증 추가 시 프론트엔드 수정 필요.
**권고**: 프론트엔드 팀 협의 후 WS-03 카드 (스태프 인증 토큰)와 함께 수정.

### ws.py — WebSocket 엔드포인트들

**취약점**: WebSocket 채널(`/ws/kitchen/{store_id}`, `/ws/register/{store_id}` 등)이
인증 없이 임의 store_id로 연결 가능.

**미수정 이유**: **WS-03 카드** (`WebSocket 인증 토큰 엔드포인트`)에서 해결 예정.
WS-03 구현 후 `ws.py`에 `validate_ws_token()` 호출 추가.

### tables.py — transfer_table

**취약점 여부 재검토**: Order 조회 시 `Order.shop_id == str(source.store_id)` 사용.
`source`는 인증된 admin의 테이블이므로 `source.store_id`는 올바른 store ID.
단, `Order.shop_id`가 문자열 slug로 저장된 경우 매칭 실패 가능성 있음 (데이터 정합성 문제이며 타 매장 접근은 아님).
**결론**: IDOR 위험 없음 (오탐). 데이터 정합성은 별도 검토 권고.

---

## 웹소켓 격리 확인

`utils/websocket.py`의 `ConnectionManager`:
- `connect(websocket, store_id)`: 연결을 `store_id`별로 분리 저장
- `broadcast(message, store_id)`: 해당 store_id의 연결에만 전송

→ **PASS** — 메시지 격리는 올바르게 구현됨. 단, 인증 없이 연결 수락이 WS-03로 해결 예정.

---

## 민감 필드 누출 검사

| 필드 | 결과 |
|---|---|
| `password_hash` | ✅ 응답에 미포함 (stores.py에서 제거됨) |
| `master_pin` | ✅ 마스킹 처리됨 (`admin.py`) |
| `square_access_token` / `square_refresh_token` | ✅ admin 응답에 미포함 |
| `paypay_api_key` / `paypay_api_secret` | ✅ `has_credentials` 불리언만 반환 |

---

## 검증 방법 (권고)

```bash
# 매장 A의 admin JWT로 매장 B의 stats 조회 시도 → 403 응답 확인
curl -H "Authorization: Bearer {store_A_token}" \
  "http://localhost:8003/api/stats/summary?shop_id={store_B_id}"

# loyalty-analytics 미인증 접근 시도 → 401 응답 확인
curl "http://localhost:8003/api/loyalty-analytics/roi/1"

# billing 교차 접근 시도 → 403 응답 확인
curl -H "Authorization: Bearer {store_A_token}" \
  "http://localhost:8003/api/billing/subscription-status/{store_B_id}"
```
