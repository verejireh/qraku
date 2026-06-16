"""결제수단 국가 강제 — 모든 쓰기 경계 공용 (결제설정 PATCH, Square OAuth 등).

"국가가 가능 결제사를 강제한다"는 불변식을 한 곳에서 보증한다. UI 숨김만으로는
강제가 아니므로, 결제수단을 저장하는 모든 백엔드 경로가 이 helper 를 거쳐야 한다.
"""
from fastapi import HTTPException

from config.countries import normalize_country, allowed_methods


def assert_method_allowed(method_value: str, country_code: str) -> None:
    """결제수단이 매장 국가에서 허용되는지 강제.

    쓰기 경계이므로 미지원/잘못된 country_code 는 fail-closed (JP 폴백하지 않고 422).
    """
    try:
        code = normalize_country(country_code)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"Unsupported country: {country_code}")
    if method_value not in allowed_methods(code):
        raise HTTPException(
            status_code=422,
            detail=f"{method_value} is not available in {code}",
        )
