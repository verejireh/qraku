"""menu_groups 코스 생성/수정 서버 검증 (#8) — 순수 Pydantic, DB 불필요."""
import pytest
from pydantic import ValidationError

from routers.menu_groups import MenuGroupCreate, MenuGroupUpdate


def test_create_rejects_negative_price():
    with pytest.raises(ValidationError):
        MenuGroupCreate(name="C", price_per_person=-1)


def test_create_rejects_non_positive_duration():
    with pytest.raises(ValidationError):
        MenuGroupCreate(name="C", duration_minutes=0)


def test_create_rejects_last_order_ge_duration():
    with pytest.raises(ValidationError):
        MenuGroupCreate(name="C", duration_minutes=60, last_order_minutes=60)


def test_create_rejects_invalid_course_type():
    with pytest.raises(ValidationError):
        MenuGroupCreate(name="C", course_type="buffet")


@pytest.mark.parametrize("course_type", ["food", "drink", "both", None])
def test_create_accepts_valid(course_type):
    g = MenuGroupCreate(
        name="C", price_per_person=1500,
        duration_minutes=90, last_order_minutes=10, course_type=course_type,
    )
    assert g.price_per_person == 1500


def test_update_partial_rejects_inconsistent_pair():
    # 같은 PATCH 에 둘 다 들어오면 스키마 단계에서 차단
    with pytest.raises(ValidationError):
        MenuGroupUpdate(duration_minutes=30, last_order_minutes=40)


def test_update_single_field_passes_schema():
    # 한쪽만 오면 스키마는 통과(엔드포인트에서 병합 후 교차검증) — 음수만 막힘
    assert MenuGroupUpdate(last_order_minutes=15).last_order_minutes == 15
    with pytest.raises(ValidationError):
        MenuGroupUpdate(price_per_person=-5)
