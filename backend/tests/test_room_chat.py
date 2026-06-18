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
