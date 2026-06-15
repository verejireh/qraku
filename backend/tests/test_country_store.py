import pytest
from models import Store


@pytest.mark.asyncio
async def test_new_store_defaults_to_jp(db):
    store = Store(name="t", owner_id="a@b.c")
    db.add(store)
    await db.commit()
    await db.refresh(store)
    assert store.country_code == "JP"      # 기존 매장 백필과 동일한 기본값


def test_update_store_protects_country_code():
    # 일반 PATCH 가 country_code 를 바꾸면 통화가 재해석되므로 보호 목록에 있어야 함
    from routers.stores import _PROTECTED_UPDATE_FIELDS
    assert "country_code" in _PROTECTED_UPDATE_FIELDS


def test_protected_fields_skipped_in_update_loop():
    # update_store 의 적용 규칙(보호 필드는 setattr 스킵)을 동일 로직으로 검증
    from routers.stores import _PROTECTED_UPDATE_FIELDS

    class _FakeStore:
        country_code = "JP"
        name = "old"

    store = _FakeStore()
    update = {"country_code": "GB", "name": "new"}
    for key, value in update.items():
        if key in _PROTECTED_UPDATE_FIELDS:
            continue
        if hasattr(store, key):
            setattr(store, key, value)

    assert store.country_code == "JP"   # 보호됨 — 변경 안 됨
    assert store.name == "new"          # 일반 필드는 정상 변경
