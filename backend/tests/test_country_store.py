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
        # 과금 상태·시스템 타임스탬프·관계 속성
        "data_open_consent", "created_at",
        "payment_settings", "display_settings", "tables", "menus", "staff_members",
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


# ── signup 국가 시드 ───────────────────────────────────────────────────────

def test_build_store_seeds_country_defaults():
    from routers.stores import _build_store_from_signup_fields
    store = _build_store_from_signup_fields(
        name="UK Cafe", owner_id="uk@x.com", owner_name="O",
        password_hash="h", category="cafe", slug="ukcafe",
        address=None, phone=None, country_code="GB",
    )
    assert store.country_code == "GB"
    assert store.tax_rate == 20.0          # 국가 기본 세율 시드
    assert store.tax_included is True
    assert store.supported_languages == "en"


def test_build_store_normalizes_country_case():
    from routers.stores import _build_store_from_signup_fields
    store = _build_store_from_signup_fields(
        name="x", owner_id="x", owner_name="x", password_hash="h",
        category="c", slug="s", address=None, phone=None, country_code="gb",
    )
    assert store.country_code == "GB"


def test_build_store_rejects_invalid_country():
    from routers.stores import _build_store_from_signup_fields
    with pytest.raises(ValueError):       # 쓰기 경계 — 미지원 코드 거부 (조용한 JP 변질 방지)
        _build_store_from_signup_fields(
            name="x", owner_id="x", owner_name="x", password_hash="h",
            category="c", slug="s", address=None, phone=None, country_code="ZZ",
        )


# ── GET 통화 메타 ──────────────────────────────────────────────────────────

def test_currency_meta_for_country():
    from routers.stores import _currency_meta
    assert _currency_meta("GB") == {
        "currency": "GBP", "currency_decimals": 2, "currency_symbol": "£",
        "allowed_payment_methods": ["SQUARE_INTEGRATED", "PAY_AT_COUNTER"],
    }
    jp = _currency_meta("JP")
    assert jp["currency"] == "JPY" and jp["currency_decimals"] == 0
    assert "PAYPAY_DIRECT" in jp["allowed_payment_methods"]
