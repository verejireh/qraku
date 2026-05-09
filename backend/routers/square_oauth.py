"""
Square OAuth 2.0 Router

흐름:
  1. 프론트엔드에서 사장님이 [Square 계정 연동하기] 버튼 클릭 -> /api/square/authorize?shop_id={id} 호출
  2. 백엔드에서 Square 승인 페이지(sqaureup.com/oauth2/authorize)로 state에 shop_id를 담아 리다이렉트
  3. 사장님이 로그인 & 권한 승인 시 /api/square/callback 으로 리다이렉트
  4. 백엔드에서 code를 access_token, refresh_token 등으로 교환 후 DB (Store 모델)에 저장
  5. 연동 성공 시 프론트엔드 관리자 화면으로 리다이렉트
"""

import os
import logging
import httpx
import hmac
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import Store
from utils.jwt import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/square", tags=["square-oauth"])

SQUARE_CLIENT_ID = os.getenv("SQUARE_CLIENT_ID", "")
SQUARE_CLIENT_SECRET = os.getenv("SQUARE_CLIENT_SECRET", "")
SQUARE_ENVIRONMENT = os.getenv("SQUARE_ENVIRONMENT", "sandbox") # "sandbox" or "production"

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")

def get_square_base_url():
    if SQUARE_ENVIRONMENT == "production":
        return "https://connect.squareup.com"
    return "https://connect.squareupsandbox.com"

def get_square_oauth_url():
    return f"{get_square_base_url()}/oauth2/authorize"

def get_square_token_url():
    return f"{get_square_base_url()}/oauth2/token"

# --- CSRF Protection (State Verification) ---
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret-key-change-in-production")

def generate_signed_state(shop_id: str) -> str:
    """shop_id 조작을 방지하기 위해 HMAC 서명을 포함한 state 생성"""
    signature = hmac.new(SECRET_KEY.encode(), shop_id.encode(), hashlib.sha256).hexdigest()
    return f"{shop_id}:{signature}"

def verify_signed_state(state: str) -> str:
    """state에 포함된 서명을 검증하고 안전한 shop_id 반환, 실패 시 None"""
    parts = state.split(":", 1)
    if len(parts) != 2:
        return None
    shop_id, signature = parts
    expected = hmac.new(SECRET_KEY.encode(), shop_id.encode(), hashlib.sha256).hexdigest()
    if hmac.compare_digest(signature, expected):
        return shop_id
    return None


@router.get("/authorize")
async def authorize_square(shop_id: str):
    """Square 앱 승인 페이지로 리다이렉트합니다."""
    if not SQUARE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="SQUARE_CLIENT_ID 환경변수가 설정되지 않았습니다.")
    
    # scope: ORDERS_WRITE, PAYMENTS_WRITE, MERCHANT_PROFILE_READ (필요에 따라 추가/수정)
    scope = "ORDERS_WRITE PAYMENTS_WRITE MERCHANT_PROFILE_READ"
    
    # 보안: shop_id를 암호화 서명한 상태 변수(state)로 전달하여 CSRF 위변조 공격 차단
    safe_state = generate_signed_state(str(shop_id))
    params = {
        "client_id": SQUARE_CLIENT_ID,
        "scope": scope,
        "session": "false",
        "state": safe_state,
    }
    
    # URL 쿼리 스트링 조합
    query_string = "&".join([f"{k}={v}" for k, v in params.items()])
    redirect_url = f"{get_square_oauth_url()}?{query_string}"
    
    return RedirectResponse(redirect_url)


@router.get("/callback")
async def square_callback(request: Request, session: AsyncSession = Depends(get_session)):
    """Square 로그인 시도 후 리다이렉트되는 콜백 엔드포인트"""
    
    # Square에서 주는 파라미터들
    code = request.query_params.get("code")
    state = request.query_params.get("state")       # authorize에서 넘겨준 서명된 state
    error = request.query_params.get("error")
    error_desc = request.query_params.get("error_description")

    # state가 없거나 위변조된 경우 (CSRF 공격 방어)
    if not state:
        raise HTTPException(status_code=400, detail="State parameter is missing.")
    
    shop_id = verify_signed_state(state)
    if not shop_id:
        print("[Square OAuth Security] Invalid or tampered state parameter received.")
        raise HTTPException(status_code=403, detail="Invalid state parameter. CSRF attack blocked.")

    # 사용자가 승인을 거절했거나 에러가 발생한 경우 프론트엔드로 돌아감 (에러 파라미터 포함 등)
    if error:
        print(f"[Square OAuth Error] {error}: {error_desc}")
        # 임시로 프론트엔드 관리자 뷰로 돌려보냄 (프론트 변경 가능)
        return RedirectResponse(f"{FRONTEND_BASE_URL}/{shop_id}/admin?error=square_auth_failed")

    if not code:
        raise HTTPException(status_code=400, detail="Authorization code is missing.")

    # Authorization Code를 토큰으로 교환
    async with httpx.AsyncClient() as client:
        token_data = {
            "client_id": SQUARE_CLIENT_ID,
            "client_secret": SQUARE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code"
        }
        res = await client.post(get_square_token_url(), json=token_data)
        
        if res.status_code != 200:
            print(f"[Square OAuth Token Error] Status: {res.status_code}, Body: {res.text}")
            return RedirectResponse(f"{FRONTEND_BASE_URL}/{shop_id}/admin?error=square_token_failed")
            
        token_info = res.json()
    
    access_token = token_info.get("access_token")
    refresh_token = token_info.get("refresh_token")
    merchant_id = token_info.get("merchant_id")
    
    # 매장(Store) 정보 조회
    store = None
    if shop_id.isdigit():
        store = await session.get(Store, int(shop_id))
    else:
        from sqlmodel import select
        result = await session.execute(select(Store).where(Store.slug == shop_id))
        store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=404, detail=f"Store '{shop_id}' not found.")
    
    # [새로운 구조 적용] PaymentSettings 조회 혹은 생성
    from models import PaymentSettings
    ps_result = await session.execute(select(PaymentSettings).where(PaymentSettings.store_id == store.id))
    payment_settings = ps_result.scalar_one_or_none()
    
    if not payment_settings:
        payment_settings = PaymentSettings(store_id=store.id)
        session.add(payment_settings)
        await session.commit()
        await session.refresh(payment_settings)

    # 기본 토큰 정보 저장 (Access/Refresh 토큰은 DB 저장 시 암호화)
    from utils.crypto import encrypt_secret
    payment_settings.square_access_token = encrypt_secret(access_token) or access_token
    payment_settings.square_refresh_token = encrypt_secret(refresh_token) or refresh_token
    payment_settings.square_merchant_id = merchant_id
    
    # 기존 레거시 호환 및 Store 기본 설정 업데이트
    store.square_connected = True
    session.add(store)

    # v2/locations API 자동 호출하여 첫 번째 Location ID 가져오기
    location_id = None
    location_url = f"{get_square_base_url()}/v2/locations"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Square-Version": "2024-02-21"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            loc_res = await client.get(location_url, headers=headers)
            if loc_res.status_code == 200:
                loc_data = loc_res.json()
                locations = loc_data.get("locations", [])
                if locations:
                    # 보통 활성화된 제일 첫 번쨰 매장이 메인입니다. Status가 ACTIVE인 것을 우선합니다.
                    active_locations = [l for l in locations if l.get("status") == "ACTIVE"]
                    if active_locations:
                        location_id = active_locations[0].get("id")
                    else:
                        location_id = locations[0].get("id")
            else:
                print(f"[Square OAuth] Location fetch error: {loc_res.status_code} - {loc_res.text}")
    except Exception:
        logger.exception("[Square OAuth] Exception during location fetch")
        
    if location_id:
        payment_settings.square_location_id = location_id

    session.add(payment_settings)
    await session.commit()
    
    # 성공적으로 연동되었으면 관리자 페이지로 리다이렉트
    return RedirectResponse(f"{FRONTEND_BASE_URL}/{shop_id}/admin?square_connected=success")

@router.delete("/disconnect/{shop_id}")
async def disconnect_square(shop_id: str, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    """Square 앱 연동을 해제합니다. 프론트엔드 연동 전용 API."""
    # 교차 매장 접근 방지
    if shop_id.isdigit():
        if int(shop_id) != admin_store.id:
            raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    elif shop_id != admin_store.slug:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    store = None
    if shop_id.isdigit():
        store = await session.get(Store, int(shop_id))
    else:
        from sqlmodel import select
        result = await session.execute(select(Store).where(Store.slug == shop_id))
        store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=404, detail="Store not found.")
    
    from models import PaymentSettings
    ps_result = await session.execute(select(PaymentSettings).where(PaymentSettings.store_id == store.id))
    payment_settings = ps_result.scalar_one_or_none()

    if payment_settings:
        payment_settings.square_access_token = None
        payment_settings.square_refresh_token = None
        payment_settings.square_merchant_id = None
        payment_settings.square_location_id = None
        session.add(payment_settings)
        
    # 기존 레거시
    setattr(store, 'square_connected', False)
    setattr(store, 'square_access_token', None)    # 레거시 백업 필드도 같이 NULL
    setattr(store, 'square_refresh_token', None)
    setattr(store, 'square_merchant_id', None)
    setattr(store, 'square_location_id', None)
    
    session.add(store)
    await session.commit()
    
    return {"status": "success", "message": "Square disconnected from store"}
