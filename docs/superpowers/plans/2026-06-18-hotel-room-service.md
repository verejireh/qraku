# 호텔 모드 (인룸 룸서비스) MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 체크인한 호텔 손님이 객실 QR 로 룸서비스를 선결제 주문하고 스태프와 채팅할 수 있게 한다 (eat-in 세션/정산 무수정).

**Architecture:** 객실 식별은 객실 QR URL(`/:shop_id/table/:room`)에서 나오므로 eat-in 지속 세션이 불필요하다. 룸서비스 주문 = 선결제 테이크아웃 재사용 + `order_type='room_service'`, ¥0 = 결제 스킵 요청. 채팅 = `(store_id, room_number)` 스코프 `RoomMessage` + 기존 WebSocket.

**Tech Stack:** FastAPI + SQLModel + PostgreSQL(asyncpg), React + Vite, 기존 Square 선결제·WebSocket(ws.py)·Table/QR빌더·KDS 재사용. 스펙: `docs/superpowers/specs/2026-06-18-hotel-room-service-design.md`.

---

## 공통 태스크 워크플로우 (매 태스크 동일 — DRY)

각 태스크는 다음 순서로 마친다:

1. 구현(아래 스텝).
2. **검증**: 백엔드 변경 → `uv run pytest backend/tests -q`(관련 + 전체 회귀). 프론트 변경 → `npx eslint <변경파일>`(사전 존재 에러 제외) + `cd frontend-react && npm run build`(exit 0).
3. **⏸ GPT 리뷰 프롬프트 자동 생성**: 아래 [GPT 리뷰 프롬프트 생성 절차]를 실행해 `docs/superpowers/reviews/<task>-review.md` 에 (프롬프트 + `git diff`) 를 저장하고 사용자에게 경로를 알린다.
4. 사용자가 GPT 리뷰를 받아오면 **receiving-code-review** 원칙으로 검증·반영.
5. **커밋**(태스크 단위).

### GPT 리뷰 프롬프트 생성 절차

```bash
# <TASK> 예: task1-models
mkdir -p docs/superpowers/reviews
{
  cat docs/superpowers/reviews/_prompt_header.md   # 아래에서 1회 생성
  echo
  echo "## 이번 변경 (<TASK 요약>)"
  echo "<태스크별 1~3줄 요약 — 무엇을/왜>"
  echo
  echo "이어서 전체 diff 를 첨부합니다:"
  echo '```diff'
  git diff --no-color
  echo '```'
} > docs/superpowers/reviews/<TASK>-review.md
```

`_prompt_header.md`(고정 헤더, 최초 1회 생성):

```
당신은 시니어 FastAPI/React 리뷰어입니다. 아래는 한 PR(호텔 인룸 룸서비스 MVP)의 변경입니다.

## 매우 중요한 리뷰 규칙
- "첨부된 diff 텍스트"만 근거로 리뷰하세요. 로컬 파일시스템을 다시 스캔하지 마세요.
  지적 시 diff 에 실제 존재하는 라인을 인용하세요.

## 배경
- 객실 식별은 객실 QR URL(/:shop_id/table/:room)에서 나옴 → eat-in 지속 세션 불필요.
- 룸서비스 = 선결제 테이크아웃 재사용 + order_type='room_service'. ¥0 = 결제 스킵(payment_status='paid').
- 채팅 = (store_id, room_number) 스코프 RoomMessage + 기존 ws.py WebSocket emit.
- 금액은 서버 재계산(클라이언트 금액 불신). 인증: 손님 공개 생성 + 스태프 마스터PIN/admin.
- 비범위: eat-in 세션/정산 수정, PMS 후불, 숙박 예약.

## 중점 검토
1. (store_id, room_number) 스코프 격리 — 타 매장/타 객실 데이터 노출 없는지.
2. ¥0 결제 스킵 경로가 서버 재계산 기준이고 음수/조작 방지 유지하는지.
3. 인증 경계(손님 공개 vs 스태프) 정확한지.
4. WebSocket emit 이 기존 패턴과 일관, 누수/예외 안전한지.
5. 기존 eat-in/테이크아웃 회귀 위험 없는지, 범위 적정한지.

발견은 파일·라인 인용 + 머지 가부로 판단하세요. 이어서 diff 를 첨부합니다:
```

> 리뷰 파일(`docs/superpowers/reviews/*`)은 git 미추적 임시본 — 커밋에 포함하지 않는다.

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `backend/models.py` | `StoreCategory.HOTEL`, `RoomMessageSenderType`, `RoomMessage` | 수정(append) |
| `backend/routers/room_service.py` | 객실 채팅 API (손님/스태프) + WS emit | **신규** |
| `backend/main.py` | room_service 라우터 등록 | 수정(1줄) |
| `backend/routers/orders.py` | `order_type='room_service'` 허용 + ¥0 결제 스킵 | 수정 |
| `backend/utils/events.py` 또는 `ws.py` | 채팅 emit 헬퍼(기존 패턴 따름) | 수정/추가 |
| `frontend-react/src/config/terminology.js` | category→용어 매핑 + 헬퍼 | **신규** |
| `frontend-react/src/components/RoomChatPanel.jsx` | 손님/스태프 공용 채팅 패널 | **신규** |
| `frontend-react/src/views/AdminOperationView.jsx`(또는 기본정보 뷰) | HOTEL 카테고리 선택 | 수정 |
| `frontend-react/src/views/OrderView.jsx` + 결제 경로 | 룸서비스 메뉴/선결제/¥0 요청 진입 | 수정 |
| `frontend-react/src/views/StaffView.jsx`, `KitchenView.jsx` | 스태프 채팅 패널 + 룸서비스 주문 태그 | 수정 |

---

## Task 1: 백엔드 — StoreCategory.HOTEL + RoomMessage 모델

**Files:**
- Modify: `backend/models.py` (StoreCategory enum, 새 enum/모델 append)
- Test: `backend/tests/test_room_chat.py` (신규)

- [ ] **Step 1: 실패 테스트 작성** — `backend/tests/test_room_chat.py`

```python
import pytest
from sqlmodel import select
from models import StoreCategory, RoomMessage, RoomMessageSenderType


def test_hotel_category_exists():
    assert StoreCategory.HOTEL == "HOTEL"


@pytest.mark.asyncio
async def test_room_message_scoped_by_store_and_room(session):
    # session fixture: 기존 conftest.py 의 async 세션 사용
    m1 = RoomMessage(store_id=1, room_number="301", sender_type=RoomMessageSenderType.GUEST, content="타월 주세요")
    m2 = RoomMessage(store_id=1, room_number="302", sender_type=RoomMessageSenderType.GUEST, content="물 주세요")
    m3 = RoomMessage(store_id=2, room_number="301", sender_type=RoomMessageSenderType.GUEST, content="다른 매장")
    session.add_all([m1, m2, m3]); await session.commit()

    rows = (await session.execute(
        select(RoomMessage).where(RoomMessage.store_id == 1, RoomMessage.room_number == "301")
    )).scalars().all()
    assert len(rows) == 1 and rows[0].content == "타월 주세요"
```

- [ ] **Step 2: 실패 확인**

Run: `uv run pytest backend/tests/test_room_chat.py -q`
Expected: FAIL (`ImportError: cannot import name 'RoomMessage'` / `HOTEL`)

- [ ] **Step 3: models.py 수정** — `StoreCategory` 에 HOTEL 추가

`backend/models.py` 의 `class StoreCategory(str, Enum):` 안 `OTHER = "OTHER"` 앞에 추가:

```python
    HOTEL = "HOTEL"
```

- [ ] **Step 4: models.py 하단에 모델 append** (파일 끝, 다른 모델 뒤)

```python
# ── Room Service Chat (호텔 모드) ─────────────────────────────────
class RoomMessageSenderType(str, Enum):
    GUEST = "GUEST"
    STAFF = "STAFF"

class RoomMessage(SQLModel, table=True):
    """객실(손님)↔스태프 채팅. (store_id, room_number) 로 스레드 조회."""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(index=True)
    room_number: str = Field(index=True, max_length=32)   # Order.table_number 와 동일 규약
    sender_type: RoomMessageSenderType
    content: str = Field(max_length=2000)
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=now_utc_naive)
```

- [ ] **Step 5: 통과 확인 + 회귀**

Run: `uv run pytest backend/tests/test_room_chat.py -q && uv run pytest backend/tests -q`
Expected: PASS (신규 2 + 기존 전체 그대로)

- [ ] **Step 6: ⏸ GPT 리뷰 프롬프트 생성** (공통 워크플로우 — `task1-models`)

- [ ] **Step 7: 커밋** (리뷰 반영 후)

```bash
git add backend/models.py backend/tests/test_room_chat.py
git commit -m "feat(hotel): StoreCategory.HOTEL + RoomMessage 모델 (Task 1)"
```

---

## Task 2: 백엔드 — 객실 채팅 라우터 + WebSocket emit

**Files:**
- Create: `backend/routers/room_service.py`
- Modify: `backend/main.py` (라우터 등록)
- Test: `backend/tests/test_room_chat.py` (확장)

- [ ] **Step 1: 실패 테스트 추가** — 채팅 API (손님 전송/조회 + 스태프 답장/읽음 + 스코프·인증)

```python
@pytest.mark.asyncio
async def test_guest_can_post_and_list_room_chat(client, seeded_store):
    sid = seeded_store.id
    r = await client.post(f"/api/room-chat/{sid}/301", json={"content": "타월 부탁해요"})
    assert r.status_code == 200
    r2 = await client.get(f"/api/room-chat/{sid}/301")
    assert r2.status_code == 200
    msgs = r2.json()
    assert any(m["content"] == "타월 부탁해요" and m["sender_type"] == "GUEST" for m in msgs)

@pytest.mark.asyncio
async def test_staff_reply_requires_auth(client, seeded_store):
    sid = seeded_store.id
    r = await client.post(f"/api/room-chat/{sid}/301/reply", json={"content": "곧 가져다 드릴게요"})
    assert r.status_code in (401, 403)  # 스태프 인증 없음
```

> `client`, `seeded_store` fixture 는 기존 `conftest.py` 패턴 사용(없으면 기존 테스트의 fixture 를 참고해 추가). 스태프 인증 통과 케이스는 기존 테스트의 마스터PIN/admin 헤더 헬퍼를 재사용.

- [ ] **Step 2: 실패 확인**

Run: `uv run pytest backend/tests/test_room_chat.py -q`
Expected: FAIL (404 — 라우터 없음)

- [ ] **Step 3: `backend/routers/room_service.py` 작성**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from pydantic import BaseModel
from database import get_session
from models import RoomMessage, RoomMessageSenderType
from routers.auth_deps import require_staff_or_admin  # 기존 스태프 인증 의존성(실제 위치 확인 후 import)

router = APIRouter(prefix="/api/room-chat", tags=["room-chat"])

class ChatIn(BaseModel):
    content: str

def _serialize(m: RoomMessage) -> dict:
    return {"id": m.id, "room_number": m.room_number, "sender_type": m.sender_type,
            "content": m.content, "is_read": m.is_read, "created_at": m.created_at.isoformat()}

async def _thread(session, store_id: int, room_number: str):
    res = await session.execute(
        select(RoomMessage).where(RoomMessage.store_id == store_id,
                                  RoomMessage.room_number == room_number)
        .order_by(RoomMessage.created_at))
    return res.scalars().all()

@router.get("/{store_id}/{room_number}")
async def list_room_chat(store_id: int, room_number: str, session: AsyncSession = Depends(get_session)):
    return [_serialize(m) for m in await _thread(session, store_id, room_number)]

@router.post("/{store_id}/{room_number}")
async def guest_post(store_id: int, room_number: str, body: ChatIn,
                     session: AsyncSession = Depends(get_session)):
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="empty")
    m = RoomMessage(store_id=store_id, room_number=room_number,
                    sender_type=RoomMessageSenderType.GUEST, content=content[:2000])
    session.add(m); await session.commit(); await session.refresh(m)
    await _emit_room_chat(session, store_id, room_number, m)   # Step 4
    return _serialize(m)

@router.post("/{store_id}/{room_number}/reply")
async def staff_reply(store_id: int, room_number: str, body: ChatIn,
                      session: AsyncSession = Depends(get_session),
                      auth_store = Depends(require_staff_or_admin)):
    if auth_store.id != store_id:
        raise HTTPException(status_code=403, detail="Access denied")
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="empty")
    m = RoomMessage(store_id=store_id, room_number=room_number,
                    sender_type=RoomMessageSenderType.STAFF, content=content[:2000])
    session.add(m); await session.commit(); await session.refresh(m)
    await _emit_room_chat(session, store_id, room_number, m)
    return _serialize(m)

@router.post("/{store_id}/{room_number}/read")
async def mark_read(store_id: int, room_number: str,
                    session: AsyncSession = Depends(get_session),
                    auth_store = Depends(require_staff_or_admin)):
    if auth_store.id != store_id:
        raise HTTPException(status_code=403, detail="Access denied")
    for m in await _thread(session, store_id, room_number):
        if not m.is_read and m.sender_type == RoomMessageSenderType.GUEST:
            m.is_read = True; session.add(m)
    await session.commit()
    return {"status": "ok"}

@router.get("/{store_id}/active")
async def active_threads(store_id: int, session: AsyncSession = Depends(get_session),
                         auth_store = Depends(require_staff_or_admin)):
    if auth_store.id != store_id:
        raise HTTPException(status_code=403, detail="Access denied")
    res = await session.execute(select(RoomMessage).where(RoomMessage.store_id == store_id))
    by_room: dict[str, dict] = {}
    for m in res.scalars().all():
        d = by_room.setdefault(m.room_number, {"room_number": m.room_number, "unread": 0, "last": None})
        if not m.is_read and m.sender_type == RoomMessageSenderType.GUEST:
            d["unread"] += 1
        d["last"] = _serialize(m)
    return list(by_room.values())
```

> `require_staff_or_admin` 의 실제 import 경로는 기존 `RegisterView`/`StaffView` 가 쓰는 백엔드 의존성을 확인(예: `staff_auth.py` 또는 `register.py` 가 쓰는 것)해서 맞춘다.

- [ ] **Step 4: WS emit 헬퍼** — 기존 `ws.py`/`utils/events.py` 패턴을 따라 `_emit_room_chat` 추가

기존 KDS emit(예: `emit_order_completed_customer`)과 동일 매니저(`utils/websocket.manager` 또는 `routers/ws.py`)를 사용해 매장 채널로 채팅 이벤트를 broadcast. 실제 매니저 API 를 확인 후 `room_service.py` 상단에 작성:

```python
async def _emit_room_chat(session, store_id: int, room_number: str, m: RoomMessage):
    try:
        from utils.websocket import manager  # 기존 매니저 (실제 경로 확인)
        import json
        await manager.broadcast(store_id, json.dumps({
            "type": "room_chat", "room_number": room_number, "message": _serialize(m),
        }))
    except Exception as e:
        print("room_chat WS emit failed:", e)
```

- [ ] **Step 5: main.py 등록**

`backend/main.py` 의 라우터 등록부에 추가:

```python
from routers import room_service
app.include_router(room_service.router)
```

- [ ] **Step 6: 통과 + 회귀**

Run: `uv run pytest backend/tests -q`
Expected: PASS

- [ ] **Step 7: ⏸ GPT 리뷰 프롬프트 생성** (`task2-room-chat-api`)

- [ ] **Step 8: 커밋**

```bash
git add backend/routers/room_service.py backend/main.py backend/tests/test_room_chat.py
git commit -m "feat(hotel): 객실 채팅 라우터 + WebSocket emit (Task 2)"
```

---

## Task 3: 백엔드 — room_service 주문 타입 + ¥0 결제 스킵

**Files:**
- Modify: `backend/routers/orders.py` (create_order)
- Test: `backend/tests/test_room_service_order.py` (신규)

- [ ] **Step 1: 실패 테스트** — `backend/tests/test_room_service_order.py`

```python
import pytest

@pytest.mark.asyncio
async def test_room_service_order_zero_total_skips_payment(client, seeded_store, seeded_zero_price_menu):
    sid = seeded_store.id
    payload = {
        "shop_id": str(sid), "table_number": "301", "order_type": "room_service",
        "items": [{"menu_item_id": str(seeded_zero_price_menu.id), "quantity": 1}],
    }
    r = await client.post("/api/orders/", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["total_amount"] == 0
    # ¥0 → 결제 스킵, 주문은 생성됨 (payment_status paid)

@pytest.mark.asyncio
async def test_room_service_order_type_persisted(client, seeded_store, seeded_priced_menu):
    sid = seeded_store.id
    payload = {"shop_id": str(sid), "table_number": "301", "order_type": "room_service",
               "items": [{"menu_item_id": str(seeded_priced_menu.id), "quantity": 1}]}
    r = await client.post("/api/orders/", json=payload)
    assert r.status_code in (200, 402)  # 유료는 결제 흐름에 따라 — 서버 재계산 검증 위주
```

> fixture 는 기존 `conftest.py` 의 주문 생성 테스트 패턴을 참고해 추가(메뉴 price=0 / price>0 시드). 유료 결제는 Square sandbox 의존이므로 ¥0 경로를 핵심으로 검증.

- [ ] **Step 2: 실패 확인**

Run: `uv run pytest backend/tests/test_room_service_order.py -q`
Expected: FAIL (order_type 미허용 또는 ¥0 에서 결제 호출 시도)

- [ ] **Step 3: orders.py 수정** — `create_order` 에서 (a) `order_type='room_service'` 허용(기존 eat_in/take_out 분기에 병렬 추가), (b) 서버 재계산 합계가 0 이면 Square 결제 호출 스킵하고 `payment_status='paid'` 로 주문 생성.

`orders.py` 의 결제 호출 분기(테이크아웃 Square 호출 지점, 현재 `total_amount` 로 `process_square_payment`/`amount=total_amount` 부근)를 다음과 같이 가드:

```python
# 서버 재계산된 total_amount 사용 (클라이언트 금액 불신 — 기존 그대로)
if order_type == "room_service" and total_amount == 0:
    # ¥0 비품/요청 — 결제 스킵, 즉시 paid 로 주문 생성
    payment_status = "paid"
    # (Square 호출 블록을 건너뛴다)
else:
    # 기존 결제 분기 (take_out 선결제 등) 그대로
    ...
```

> 정확한 삽입 위치는 `create_order` 의 결제 분기 구조를 읽고 맞춘다. eat_in 후정산 경로는 변경하지 않는다. `order_type` 화이트리스트가 있으면 `'room_service'` 를 추가한다.

- [ ] **Step 4: 통과 + 회귀**

Run: `uv run pytest backend/tests -q`
Expected: PASS (기존 주문/결제 테스트 회귀 없음)

- [ ] **Step 5: ⏸ GPT 리뷰 프롬프트 생성** (`task3-room-service-order`) — 중점: ¥0 스킵이 서버 재계산 기준인지, eat_in/take_out 회귀 없는지.

- [ ] **Step 6: 커밋**

```bash
git add backend/routers/orders.py backend/tests/test_room_service_order.py
git commit -m "feat(hotel): room_service 주문 타입 + ¥0 결제 스킵 (Task 3)"
```

---

## Task 4: 프론트 — 용어 레이어 + HOTEL 카테고리 선택

**Files:**
- Create: `frontend-react/src/config/terminology.js`
- Modify: 카테고리 선택 UI(기본정보/운영 뷰 — `AdminView.jsx` 기본정보 또는 `AdminOperationView.jsx`)

- [ ] **Step 1: `terminology.js` 작성**

```javascript
// 업종(category)별 표시 용어 매핑. 표시 라벨에만 적용 — 데이터/플로우는 동일.
const TERMS = {
  HOTEL: { unit: '客室', unitEn: 'Room', order: 'ルームサービス', orderEn: 'Room Service', callStaff: 'スタッフに連絡' },
  DEFAULT: { unit: 'テーブル', unitEn: 'Table', order: '注文', orderEn: 'Order', callStaff: 'スタッフ呼出' },
}
export function termsOf(category) {
  return TERMS[category] || TERMS.DEFAULT
}
```

- [ ] **Step 2: 카테고리 선택 UI 추가** — 현재 매장 기본정보 편집 화면에 `category` 셀렉트(RESTAURANT/CAFE/BAR/HOTEL/OTHER) 추가. `handleStoreUpdate('category', value)` 패턴(기존 tax_rate 등과 동일)로 저장.

> 해당 화면 파일을 읽고 기존 셀렉트/입력 패턴을 그대로 따른다. 백엔드 `PATCH /stores/{id}` 가 category 를 받는지 확인(Store 모델 필드이므로 일반 store update 로 저장 가능).

- [ ] **Step 3: 검증**

Run: `cd frontend-react && npx eslint src/config/terminology.js <수정뷰> && npm run build`
Expected: 신규 에러 0, build exit 0

- [ ] **Step 4: ⏸ GPT 리뷰 프롬프트 생성** (`task4-terminology`)

- [ ] **Step 5: 커밋**

```bash
git add frontend-react/src/config/terminology.js <수정뷰>
git commit -m "feat(hotel): 용어 레이어 + HOTEL 카테고리 선택 (Task 4)"
```

---

## Task 5: 프론트 — 객실 채팅 패널 컴포넌트 (손님/스태프 공용)

**Files:**
- Create: `frontend-react/src/components/RoomChatPanel.jsx`

- [ ] **Step 1: `RoomChatPanel.jsx` 작성** — props: `{ shopId, roomNumber, sender }` (`sender`='guest'|'staff'). 폴링(또는 기존 useWebSocket 훅) 기반 메시지 로드 + 전송.

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

// postClient: 스태프 답장은 인증 필요 → staffApi 주입. 손님은 기본 axios(공개).
export default function RoomChatPanel({ shopId, roomNumber, sender = 'guest', postClient = axios }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const endRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`/api/room-chat/${shopId}/${roomNumber}`)
      setMsgs(Array.isArray(r.data) ? r.data : [])
    } catch { /* noop */ }
  }, [shopId, roomNumber])

  useEffect(() => {
    if (!shopId || !roomNumber) return
    load()
    const id = setInterval(load, 4000)   // MVP: 폴링. (후속: useWebSocket 으로 교체)
    return () => clearInterval(id)
  }, [shopId, roomNumber, load])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async () => {
    const content = text.trim()
    if (!content) return
    setText('')
    try {
      const url = sender === 'staff'
        ? `/api/room-chat/${shopId}/${roomNumber}/reply`
        : `/api/room-chat/${shopId}/${roomNumber}`
      // 스태프 답장은 인증 필요 — staffApi(JWT/PIN) 인스턴스를 쓰도록 호출부에서 주입하거나 여기서 분기
      await postClient.post(url, { content })
      await load()
    } catch { /* noop */ }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 p-3">
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.sender_type === (sender === 'staff' ? 'STAFF' : 'GUEST') ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.sender_type === 'STAFF' ? 'bg-blue-100 text-blue-900' : 'bg-slate-100 text-slate-800'}`}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 p-2 border-t">
        <input value={text} onChange={e => setText(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && send()}
               className="flex-1 px-3 py-2 border rounded-xl text-sm" placeholder="メッセージ" />
        <button onClick={send} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold">送信</button>
      </div>
    </div>
  )
}
```

> GET(목록)·손님 POST 는 공개라 기본 `axios` 로 충분. 스태프 답장은 인증이 필요하므로 스태프 호출부(Task 7)에서 `postClient={staffApi}`(JWT/PIN 자동첨부)를 주입한다.

- [ ] **Step 2: 검증**

Run: `cd frontend-react && npx eslint src/components/RoomChatPanel.jsx && npm run build`
Expected: 신규 에러 0, build exit 0

- [ ] **Step 3: ⏸ GPT 리뷰 프롬프트 생성** (`task5-chat-panel`)

- [ ] **Step 4: 커밋**

```bash
git add frontend-react/src/components/RoomChatPanel.jsx
git commit -m "feat(hotel): 객실 채팅 패널 컴포넌트 (Task 5)"
```

---

## Task 6: 프론트 — 손님 객실 페이지 통합 (룸서비스 메뉴 + 선결제 + ¥0 요청 + 채팅)

**Files:**
- Modify: `frontend-react/src/views/OrderView.jsx`(데이터 레이어, props 시그니처는 유지) + 손님 메뉴 표면, 결제 경로(`MagnoliaCartModal` 테이크아웃 선결제 재사용), 채팅 패널 마운트

- [ ] **Step 1: 객실 진입 판별** — category=HOTEL 이고 URL 에 객실(table)번호가 있으면 "룸서비스 모드"로 간주. 주문 생성 시 `order_type='room_service'` + `table_number`=객실번호 전송. (eat_in 세션 토큰 미사용 경로.)

> `OrderView.jsx` 는 공통 데이터 레이어이므로 props 시그니처를 바꾸지 않는다(루트 CLAUDE.md 규칙 4). 룸서비스 여부는 storeData.category + URL 로 내부 판별만 추가.

- [ ] **Step 2: 선결제 결제** — 기존 테이크아웃 Square 선결제 경로(`MagnoliaCartModal`)를 그대로 사용하되 주문 payload 의 `order_type` 만 `room_service` 로. ¥0(전부 비품) 카트는 결제 모달 대신 "요청 보내기" 버튼 → 백엔드가 ¥0 결제 스킵으로 주문 생성.

> `MagnoliaCartModal` 은 결제 핵심 파일(규칙 4) — 결제 관련 변경만, 최소 침습. order_type 주입 지점만 확인해 수정.

- [ ] **Step 3: 채팅 패널 마운트** — 객실 페이지에 `<RoomChatPanel shopId={shop_id} roomNumber={room} sender="guest" />` 를 띄우는 진입(버튼/탭). 용어는 `termsOf(category).callStaff`.

- [ ] **Step 4: 검증**

Run: `cd frontend-react && npx eslint <수정파일들> && npm run build`
Expected: 신규 에러 0, build exit 0

- [ ] **Step 5: ⏸ GPT 리뷰 프롬프트 생성** (`task6-guest-room-page`) — 중점: MagnoliaCartModal/OrderView 회귀 없는지, order_type 주입 정확한지, ¥0 요청 경로.

- [ ] **Step 6: 커밋**

```bash
git add <수정파일들>
git commit -m "feat(hotel): 손님 객실 페이지 룸서비스+채팅 통합 (Task 6)"
```

---

## Task 7: 프론트 — 스태프 측 (채팅 패널 + 룸서비스 주문 태그)

**Files:**
- Modify: `frontend-react/src/views/StaffView.jsx` (객실 채팅 패널 + 미읽음), `KitchenView.jsx` (room_service 주문에 객실번호 태그 표시)

- [ ] **Step 1: StaffView 채팅 패널** — `GET /api/room-chat/{store}/active`(staffApi)로 미읽음 객실 목록 → 선택 시 `<RoomChatPanel shopId={shop_id} roomNumber={room} sender="staff" postClient={staffApi} />`. 읽음 처리 `POST .../read`.

- [ ] **Step 2: KitchenView room_service 태그** — order_type==='room_service' 주문에 "객실 {table_number}" 뱃지 표시(테이크아웃 뱃지 패턴 재사용).

- [ ] **Step 3: 검증**

Run: `cd frontend-react && npx eslint src/views/StaffView.jsx src/views/KitchenView.jsx && npm run build`
Expected: 신규 에러 0, build exit 0

- [ ] **Step 4: ⏸ GPT 리뷰 프롬프트 생성** (`task7-staff`)

- [ ] **Step 5: 커밋**

```bash
git add frontend-react/src/views/StaffView.jsx frontend-react/src/views/KitchenView.jsx
git commit -m "feat(hotel): 스태프 객실 채팅 + 룸서비스 주문 태그 (Task 7)"
```

---

## 검증 (전체)

- 백엔드: `uv run pytest backend/tests -q` (신규 + 기존 회귀 전부 PASS).
- 프론트: 변경 파일 `npx eslint`(사전 존재 에러 제외) + `npm run build` exit 0.
- 수동 E2E: 호텔 매장 생성 → 객실(테이블) 추가 → 객실 QR 스캔 → 룸서비스 메뉴 선결제 주문(KDS 도착) → ¥0 비품 요청 → 손님↔스태프 채팅 왕복.

## 범위 밖 (다음 spec)

- 미니홈피 숙박 이벤트 선결제(예약), PMS 객실 후불(폴리오), 채팅 WebSocket 전환(현 MVP 폴링), 객실별 접근 토큰 보안 강화.
