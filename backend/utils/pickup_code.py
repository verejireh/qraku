"""Order pickup_code 생성 헬퍼.

테이크아웃 주문의 당일 순차 접수번호 (101부터) 를 계산.
JST 자정 기준으로 reset.

[2026-05-22] P1 #7 Bug 3 — UTC 자정 기준이면 JST 09:00 reset 버그.
[2026-05-26] PayPay webhook 자동 Order 생성 경로 (PG-PAYPAY-AUTO-ORDER-HOTFIX) 와 공유
            — orders.py 와 webhooks.py 양쪽에서 호출.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models import Order
from utils.time_helpers import today_start_jst_as_utc_naive


async def next_pickup_code(session: AsyncSession, shop_id: str) -> str:
    """주어진 shop 의 당일 take_out 주문 다음 pickup_code 를 계산.

    동시 take_out 주문은 같은 번호를 뽑을 수 있음 — Order 에 (shop_id, pickup_code)
    UNIQUE 제약이 없어 완전 보장은 아님. 운영상 식별성 보완용.
    강제 보장이 필요하면 counter table 또는 partial UNIQUE 도입 필요.
    """
    today_start = today_start_jst_as_utc_naive()
    codes_res = await session.execute(
        select(Order.pickup_code).where(
            Order.shop_id == shop_id,
            Order.order_type == "take_out",
            Order.created_at >= today_start,
        )
    )
    codes = [c for c in codes_res.scalars().all() if c and c.isdigit()]
    return str(max(int(c) for c in codes) + 1) if codes else "101"
