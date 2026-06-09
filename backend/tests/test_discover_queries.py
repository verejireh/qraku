"""discover/주문 집계 쿼리 회귀 가드 — DB 없이 statement 생성만으로 컬럼 오참조를 탐지.

존재하지 않는 컬럼을 참조하면 select(...) 구성/컴파일 시점에 에러가 나므로 회귀를 잡는다.
2026-06-09: Order.store_id 정규 FK 도입 — 매장↔주문 매칭은 store_id 기준.
"""
from sqlmodel import select, func
from sqlalchemy import Integer

from models import Order, OrderItem, Menu, Table


def _compiles(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": False}))


def test_order_has_canonical_store_id_fk():
    # 정규 매장 FK. 과거 버그(미존재 컬럼 참조)의 회귀 가드.
    assert hasattr(Order, "store_id")
    assert hasattr(Order, "shop_id")  # dual-write 레거시 컬럼 (아직 유지)


def test_orderitem_uses_menu_item_id_not_menu_id():
    assert hasattr(OrderItem, "menu_item_id")
    assert not hasattr(OrderItem, "menu_id")


def test_store_order_stats_query_compiles():
    stmt = (
        select(Order.store_id, func.count(Order.id).label("order_count"))
        .where(Order.store_id.in_([1, 2]))
        .group_by(Order.store_id)
    )
    assert "store_id" in _compiles(stmt)


def test_menu_order_aggregation_query_compiles():
    # /menus 의 메뉴별 주문 집계 — cast(Integer) 조인 + 소유권/매장 제한 (Crit 회귀 가드)
    stmt = (
        select(Menu.id.label("menu_id"), func.sum(OrderItem.quantity).label("qty"))
        .join(OrderItem, OrderItem.menu_item_id.cast(Integer) == Menu.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Menu.store_id.in_([1, 2]))
        .where(Order.store_id.in_([1, 2]))
        .group_by(Menu.id)
    )
    sql = _compiles(stmt)
    assert "menu" in sql and "order" in sql


def test_backlog_query_compiles():
    # 동적 대기 backlog — 정규 store_id 매칭
    stmt = (
        select(Order.store_id, func.count(Order.id).label("cnt"))
        .where(Order.store_id.in_([1, 2]))
        .where(Order.order_type == "take_out")
        .where(Order.payment_status == "paid")
        .where(Order.needs_serving == True)  # noqa: E712
        .group_by(Order.store_id)
    )
    assert "store_id" in _compiles(stmt)


def test_table_count_query_uses_real_fk():
    stmt = select(Table.store_id, func.count(Table.id)).group_by(Table.store_id)
    assert _compiles(stmt)
