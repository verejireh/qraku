"""테이크아웃 선결제 가능 여부 판정 — 단일 진실 공급원.

discover / stores 등 여러 라우터가 동일 기준을 공유하도록 한 곳에 모은다.
토큰 '원문'이 아니라 '존재 여부 불린'만 받아 판정하므로, 공개 API(discover)
공간쿼리에서 암호화 토큰을 SELECT하지 않아도 된다(보안).
"""
from typing import Any, Optional


def _method_value(v: Any) -> Optional[str]:
    """PaymentMethodType enum 또는 문자열 → 문자열 값. None은 그대로 반환."""
    if v is None:
        return None
    return getattr(v, "value", v)


def has_online_payment(
    *,
    has_store_square: bool,
    ps_method_type,
    has_ps_square: bool,
    has_ps_paypay: bool,
) -> bool:
    """온라인 결제수단이 연동되어 있는가 — 선택된 결제방식에 정확히 매칭."""
    method = _method_value(ps_method_type)
    if method == "PAY_AT_COUNTER":
        return False
    if method == "PAYPAY_DIRECT":
        return bool(has_ps_paypay)
    if method == "SQUARE_INTEGRATED":
        return bool(has_ps_square or has_store_square)
    # PaymentSettings 행이 없는 레거시 매장 → Store-level Square
    return bool(has_store_square)


def can_accept_takeout(
    *,
    takeout_enabled: bool,
    has_store_square: bool,
    ps_method_type: Optional[str],
    has_ps_square: bool,
    has_ps_paypay: bool,
) -> bool:
    """테이크아웃 ON + 온라인 결제수단 연동 → 선결제 주문 수신 가능."""
    return bool(
        takeout_enabled
        and has_online_payment(
            has_store_square=has_store_square,
            ps_method_type=ps_method_type,
            has_ps_square=has_ps_square,
            has_ps_paypay=has_ps_paypay,
        )
    )


def _store_flags(store: Any) -> dict:
    """ORM Store(+ payment_settings 로딩됨)에서 판정용 불린 플래그를 뽑는다."""
    ps = getattr(store, "payment_settings", None)
    return dict(
        has_store_square=bool(
            getattr(store, "square_access_token", None)
            and getattr(store, "square_location_id", None)
        ),
        ps_method_type=getattr(ps, "payment_method_type", None) if ps else None,
        has_ps_square=bool(ps and ps.square_access_token and ps.square_location_id),
        has_ps_paypay=bool(ps and ps.paypay_api_key),
    )


def can_accept_takeout_from_store(store: Any) -> bool:
    return can_accept_takeout(
        takeout_enabled=bool(getattr(store, "takeout_enabled", False)),
        **_store_flags(store),
    )


def has_online_payment_from_store(store: Any) -> bool:
    return has_online_payment(**_store_flags(store))
