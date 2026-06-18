import pytest
from sqlmodel import select

from models import StoreCategory, RoomMessage, RoomMessageSenderType


def test_hotel_category_exists():
    assert StoreCategory.HOTEL == "HOTEL"


@pytest.mark.asyncio
async def test_room_message_scoped_by_store_and_room(db):
    db.add_all([
        RoomMessage(store_id=1, room_number="301",
                    sender_type=RoomMessageSenderType.GUEST, content="타월 주세요"),
        RoomMessage(store_id=1, room_number="302",
                    sender_type=RoomMessageSenderType.GUEST, content="물 주세요"),
        RoomMessage(store_id=2, room_number="301",
                    sender_type=RoomMessageSenderType.GUEST, content="다른 매장"),
    ])
    await db.commit()

    rows = (await db.execute(
        select(RoomMessage).where(
            RoomMessage.store_id == 1,
            RoomMessage.room_number == "301",
        )
    )).scalars().all()

    assert len(rows) == 1
    assert rows[0].content == "타월 주세요"
    assert rows[0].sender_type == RoomMessageSenderType.GUEST


# ── Task 2: 객실 채팅 라우터 ──────────────────────────────────────
import types
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_guest_post_and_list(db):
    from routers import room_service as rs
    posted = await rs.guest_post(1, "301", rs.ChatIn(content="타월 부탁해요"), session=db)
    assert posted["sender_type"] == RoomMessageSenderType.GUEST
    assert posted["content"] == "타월 부탁해요"

    msgs = await rs.list_room_chat(1, "301", session=db)
    assert len(msgs) == 1 and msgs[0]["content"] == "타월 부탁해요"


@pytest.mark.asyncio
async def test_chat_scoped_by_store_and_room(db):
    from routers import room_service as rs
    await rs.guest_post(1, "301", rs.ChatIn(content="A"), session=db)
    await rs.guest_post(1, "302", rs.ChatIn(content="B"), session=db)
    await rs.guest_post(2, "301", rs.ChatIn(content="C"), session=db)
    msgs = await rs.list_room_chat(1, "301", session=db)
    assert [m["content"] for m in msgs] == ["A"]


@pytest.mark.asyncio
async def test_staff_reply_rejects_wrong_store(db):
    from routers import room_service as rs
    fake_auth = types.SimpleNamespace(id=999)  # 다른 매장 인증
    with pytest.raises(HTTPException) as ei:
        await rs.staff_reply(1, "301", rs.ChatIn(content="hi"), session=db, auth_store=fake_auth)
    assert ei.value.status_code == 403


@pytest.mark.asyncio
async def test_staff_reply_and_mark_read(db):
    from routers import room_service as rs
    await rs.guest_post(1, "301", rs.ChatIn(content="물 주세요"), session=db)
    auth = types.SimpleNamespace(id=1)
    reply = await rs.staff_reply(1, "301", rs.ChatIn(content="네 갑니다"), session=db, auth_store=auth)
    assert reply["sender_type"] == RoomMessageSenderType.STAFF

    await rs.mark_read(1, "301", session=db, auth_store=auth)
    msgs = await rs.list_room_chat(1, "301", session=db)
    guest_msgs = [m for m in msgs if m["sender_type"] == RoomMessageSenderType.GUEST]
    assert guest_msgs and all(m["is_read"] for m in guest_msgs)


@pytest.mark.asyncio
async def test_empty_content_rejected(db):
    from routers import room_service as rs
    with pytest.raises(HTTPException) as ei:
        await rs.guest_post(1, "301", rs.ChatIn(content="   "), session=db)
    assert ei.value.status_code == 400


def test_staff_active_route_is_collision_free():
    # 스태프 active 스레드 경로가 2세그먼트 공개 조회(/{store_id}/{room_number})에
    # 가려지지 않는 distinct literal 경로여야 한다 (인증 우회 회귀 방지).
    from routers import room_service as rs
    paths = {r.path for r in rs.router.routes}
    assert "/room-chat/staff/{store_id}/active" in paths
    assert "/room-chat/{store_id}/{room_number}" in paths
    assert "/room-chat/{store_id}/active" not in paths   # 옛 충돌 경로 금지
