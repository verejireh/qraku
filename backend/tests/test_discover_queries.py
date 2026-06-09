"""discover 집계 쿼리 회귀 가드 — DB 없이 statement 생성만으로 컬럼 오참조를 탐지.

존재하지 않는 컬럼(예: 과거 버그의 Order.store_id, OrderItem.menu_id)을 참조하면
select(...) 구성 시점에 AttributeError 가 발생하므로, 컴파일까지 시키면 회귀를 잡는다.
DB/Redis 통합 테스트 인프라(conftest)는 현재 없으므로 이 가드로 실행경로 일부를 보증한다.
"""
from sqlmodel import select, func
from sqlalchemy import Integer

from models import Order, OrderItem, Menu, Table


def _compiles(stmt) -> str:
    # 컴파일 시 모든 컬럼/표현식이 해석된다 — 잘못된 컬럼이면 여기서 실패.
    return str(stmt.compile(compile_kwargs={"literal_binds": False}))


def test_order_uses_shop_id_not_store_id():
    # Order ↔ Store 연결키는 shop_id 뿐. store_id 는 존재하지 않아야 한다(버그 재발 가드).
    assert hasattr(Order, "shop_id")
    assert not hasattr(Order, "store_id")


def test_orderitem_uses_menu_item_id_not_menu_id():
    assert hasattr(OrderItem, "menu_item_id")
    assert not hasattr(OrderItem, "menu_id")


def test_store_order_stats_query_compiles():
    stmt = (
        select(Order.shop_id, func.count(Order.id).label("order_count"))
        .where(Order.shop_id.in_(["1", "slug"]))
        .group_by(Order.shop_id)
    )
    assert "shop_id" in _compiles(stmt)


def test_menu_order_aggregation_query_compiles():
    # /menus 의 메뉴별 주문 집계 — cast(int) 조인 + 소유권 제한 (Crit 회귀 가드)
    stmt = (
        select(Menu.id.label("menu_id"), func.sum(OrderItem.quantity).label("qty"))
        .join(OrderItem, OrderItem.menu_item_id.cast(Integer) == Menu.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Menu.store_id.in_([1, 2]))
        .where(Order.shop_id.in_(["1", "slug"]))
        .group_by(Menu.id)
    )
    sql = _compiles(stmt)
    assert "menu" in sql and "order" in sql


def test_table_count_query_uses_real_fk():
    # Table.store_id 는 실제 FK — 그대로 사용 가능해야 한다.
    stmt = select(Table.store_id, func.count(Table.id)).group_by(Table.store_id)
    assert _compiles(stmt)
