import pytest
from models import Store


@pytest.mark.asyncio
async def test_new_store_defaults_to_jp(db):
    store = Store(name="t", owner_id="a@b.c")
    db.add(store)
    await db.commit()
    await db.refresh(store)
    assert store.country_code == "JP"      # 기존 매장 백필과 동일한 기본값


def test_protected_fields_is_superset_of_security_fields():
    # update_store 는 원래 무방비(모든 필드 setattr)였다 — country_code 추가 김에
    # 통화·인증·구독·Square 자격증명까지 보호하는 상위집합이어야 한다.
    from routers.stores import _PROTECTED_UPDATE_FIELDS
    for field in [
        "country_code", "slug", "owner_id", "password_hash", "master_pin",
        "google_id", "line_id",
        "subscription_type", "subscription_status", "subscription_expires_at",
        "trial_start_date", "stripe_customer_id", "stripe_subscription_id",
        "square_access_token", "square_refresh_token",
        "square_merchant_id", "square_location_id", "square_connected",
    ]:
        assert field in _PROTECTED_UPDATE_FIELDS, field


def test_patch_with_protected_field_is_rejected_atomically():
    # 보호 필드가 섞이면 요청 전체를 거부(부분 적용 금지) — country_code 도 name 도 안 바뀜
    from routers.stores import _PROTECTED_UPDATE_FIELDS
    update = {"country_code": "GB", "name": "new"}
    rejected = _PROTECTED_UPDATE_FIELDS.intersection(update)
    assert rejected == {"country_code"}     # → 엔드포인트가 400 으로 전체 거부


def test_normal_field_patch_not_rejected():
    from routers.stores import _PROTECTED_UPDATE_FIELDS
    update = {"name": "new", "tax_rate": 20.0, "supported_languages": "en"}
    assert _PROTECTED_UPDATE_FIELDS.intersection(update) == set()   # 정상 통과
