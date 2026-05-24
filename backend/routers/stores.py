import os
import re
import time
import logging
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive
from database import get_session
from models import Store, Table, PhotoReview, RewardCoupon
from sqlalchemy.orm import selectinload
from utils.auth import get_password_hash
from utils.jwt import create_admin_token, require_admin, require_staff_or_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stores", tags=["stores"])


# ── Photo Review 어뷰즈 방지 rate limiter (메모리 기반) ─────────────────────
_review_rate_window = 86400  # 24시간
_review_rate_max_per_uuid = 3  # guest_uuid 별 24시간 3장
_review_rate_max_per_ip = 10   # IP 별 24시간 10장
_review_rate_uuid: dict[str, list[float]] = defaultdict(list)
_review_rate_ip: dict[str, list[float]] = defaultdict(list)


def _check_review_rate_limit(guest_uuid: str, client_ip: str):
    now = time.time()
    win = now - _review_rate_window
    _review_rate_uuid[guest_uuid] = [t for t in _review_rate_uuid[guest_uuid] if t > win]
    _review_rate_ip[client_ip] = [t for t in _review_rate_ip[client_ip] if t > win]
    if len(_review_rate_uuid[guest_uuid]) >= _review_rate_max_per_uuid:
        raise HTTPException(status_code=429, detail="本日の投稿上限に達しました（1日3件まで）")
    if len(_review_rate_ip[client_ip]) >= _review_rate_max_per_ip:
        raise HTTPException(status_code=429, detail="投稿が多すぎます。しばらくお待ちください")
    _review_rate_uuid[guest_uuid].append(now)
    _review_rate_ip[client_ip].append(now)


def _strip_image_metadata(file_bytes: bytes) -> bytes:
    """EXIF/위치 정보 제거 → JPEG 재인코딩."""
    try:
        from PIL import Image
        from io import BytesIO
        img = Image.open(BytesIO(file_bytes))
        # EXIF 제거를 위해 픽셀만 새 이미지로 복사
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        # 가로 최대 1600px 리사이즈
        if img.width > 1600:
            ratio = 1600 / img.width
            img = img.resize((1600, int(img.height * ratio)), Image.LANCZOS)
        out = BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue()
    except Exception as e:
        logger.warning("EXIF 제거 실패, 원본 사용: %s", e)
        return file_bytes


# ── My Home Page 사진 업로드 (외관/내부 등) ─────────────────────────────────
@router.post("/upload-photo")
async def upload_store_photo(
    file: UploadFile = File(...),
    store_id: int = Form(...),
    photo_type: str = Form(...),  # "interior" | "exterior" | "attraction"
    admin_store: Store = Depends(require_admin),
):
    """매장 공개 페이지용 사진 업로드 (GCS). 메뉴 사진 패턴 재사용."""
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    if photo_type not in ("interior", "exterior", "attraction"):
        raise HTTPException(status_code=400, detail="invalid photo_type")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다.")

    MAX_FILE_SIZE = 10 * 1024 * 1024
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기가 10MB를 초과합니다.")

    try:
        from services.gcs_client import upload_image_to_gcs
        public_url = upload_image_to_gcs(
            file_bytes=file_bytes,
            store_id=store_id,
            filename_prefix=f"store-{photo_type}",
        )
        return {"image_url": public_url}
    except ValueError as e:
        logger.warning("Store photo 처리 실패 (store_id=%s): %s", store_id, e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Store photo 업로드 실패 (store_id=%s): %s", store_id, e)
        raise HTTPException(status_code=500, detail="이미지 업로드 중 오류가 발생했습니다.")


def _validate_password(password: str):
    """관리자 로그인 패스워드 정책: 8자 이상, 대문자 1개, 특수문자 1개."""
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="パスワードは8文字以上で入力してください")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="パスワードに大文字を1文字以上含めてください")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?~`]", password):
        raise HTTPException(status_code=400, detail="パスワードに特殊文字を1文字以上含めてください（例: !@#$%）")

@router.post("/", response_model=Store)
async def create_store(store: Store, session: AsyncSession = Depends(get_session)):
    # Auto-grant 60-day Free Trial
    now = now_utc_naive()
    store.subscription_status = "TRIAL"
    store.subscription_type = "FREE"
    store.trial_start_date = now
    store.subscription_expires_at = now + timedelta(days=60)

    session.add(store)
    await session.commit()
    await session.refresh(store)
    return store


class SignupRequest(BaseModel):
    owner_name: str
    email: str
    password: str
    store_name: str
    category: str = "restaurant"
    address: str = ""
    phone: str = ""
    slug: str

@router.post("/signup")
async def signup_with_password(body: SignupRequest, session: AsyncSession = Depends(get_session)):
    """이메일+비밀번호로 회원가입 → Store 생성 + JWT 반환"""
    from utils.slug import validate_and_check_slug

    # 패스워드 정책 검증 (8자+, 대문자+, 특수문자+)
    _validate_password(body.password)

    # shop_id (slug) 형식·중복 검증
    slug_input = (body.slug or "").strip().lower()
    ok, err = await validate_and_check_slug(slug_input, session)
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    # 중복 체크
    existing = await session.execute(select(Store).where(Store.owner_id == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="このメールアドレスは既に登録されています。")

    now = now_utc_naive()
    store = Store(
        name=body.store_name,
        owner_id=body.email,
        owner_name=body.owner_name,
        password_hash=get_password_hash(body.password),
        category=body.category,
        slug=slug_input,
        address=body.address or None,
        phone=body.phone or None,
        subscription_status="TRIAL",
        subscription_type="FREE",
        trial_start_date=now,
        subscription_expires_at=now + timedelta(days=60),
    )
    session.add(store)
    await session.commit()
    await session.refresh(store)

    token = create_admin_token(store.id, store.owner_id, store.slug)
    return {
        "store": store,
        "token": token,
        "slug": store.slug,
    }

@router.get("/{store_id}")
async def read_store(store_id: str, session: AsyncSession = Depends(get_session)):
    if store_id.isdigit():
        result = await session.execute(
            select(Store).options(
                selectinload(Store.display_settings),
                selectinload(Store.payment_settings)
            ).where(Store.id == int(store_id))
        )
        store = result.scalar_one_or_none()
    else:
        result = await session.execute(
            select(Store).options(
                selectinload(Store.display_settings),
                selectinload(Store.payment_settings)
            ).where(Store.slug == store_id)
        )
        store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Inject global Square Application ID (non-sensitive — public client credential)
    data = jsonable_encoder(store)
    data["square_application_id"] = os.getenv("SQUARE_APPLICATION_ID") or ""

    # StoreDisplaySettings가 아직 없는 기존 매장인 경우 방어 코드로 기본 Default True 세팅 내려주기
    if not data.get("display_settings"):
        data["display_settings"] = {
            "use_kitchen_page": True,
            "use_register_page": True,
            "use_staff_page": True
        }

    # ── Credential 은 제거, 안전한 정보만 프론트엔드에 전달 ──
    # Store 레벨 credential 제거
    for secret_key in ["square_access_token", "square_refresh_token", "master_pin"]:
        data.pop(secret_key, None)
    # PaymentSettings 레벨 credential 제거
    ps = data.get("payment_settings")
    if ps:
        for secret_key in [
            "square_access_token", "square_refresh_token",
            "paypay_api_key", "paypay_api_secret",
        ]:
            ps.pop(secret_key, None)

    # ── can_accept_takeout: 프론트에서 테이크아웃 가능 여부 판단용 ──
    # 조건: (1) Admin이 takeout_enabled=true로 켜두었고, (2) 온라인 결제수단이 설정되어 있어야 함
    has_square = bool(store.square_access_token and store.square_location_id)
    ps_obj = store.payment_settings
    has_payment_ps = ps_obj and str(ps_obj.payment_method_type) != "PAY_AT_COUNTER" and (
        (ps_obj.square_access_token and ps_obj.square_location_id) or
        ps_obj.paypay_api_key
    )
    has_online_payment = bool(has_square or has_payment_ps)
    data["has_online_payment"] = has_online_payment
    data["can_accept_takeout"] = bool(store.takeout_enabled and has_online_payment)

    return JSONResponse(content=data)

class StorePublic(BaseModel):
    """GET /stores/ 공개 응답용 — 민감 필드 일절 제외"""
    id: int
    name: str
    slug: str
    category: Optional[str] = None
    theme: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    prefecture: Optional[str] = None
    city: Optional[str] = None
    allow_public_listing: Optional[bool] = False
    is_open: Optional[bool] = True
    job_board_active: Optional[bool] = False
    job_board_text: Optional[str] = None
    food_rescue_active: Optional[bool] = False
    food_rescue_msg: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/", response_model=List[StorePublic])
async def read_stores(session: AsyncSession = Depends(get_session)):
    """공개 디렉터리용 — 공개 게재 동의한 매장만, 민감 필드 제외"""
    result = await session.execute(
        select(Store).where(Store.allow_public_listing == True)  # noqa: E712
    )
    return result.scalars().all()

@router.post("/{store_id}/tables", response_model=Table)
async def create_table(store_id: int, table: Table, session: AsyncSession = Depends(get_session)):
    table.store_id = store_id
    session.add(table)
    await session.commit()
    await session.refresh(table)
    return table

@router.get("/{store_id}/tables", response_model=List[Table])
async def read_tables(store_id: str, session: AsyncSession = Depends(get_session)):
    if store_id.isdigit():
        target_id = int(store_id)
    else:
        result = await session.execute(select(Store).where(Store.slug == store_id))
        store = result.scalar_one_or_none()
        if not store: return []
        target_id = store.id
        
    result = await session.execute(select(Table).where(Table.store_id == target_id))
    return result.scalars().all()

@router.delete("/{store_id}/tables/{table_id}")
async def delete_table(store_id: str, table_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    # 교차 매장 접근 방지
    if store_id.isdigit():
        if int(store_id) != admin_store.id:
            raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    elif store_id != admin_store.slug:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    table = await session.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    await session.delete(table)
    await session.commit()
    return {"status": "ok"}

@router.patch("/{store_id}", response_model=Store)
async def update_store(store_id: str, store_update: dict, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    # 교차 매장 접근 방지
    if store_id.isdigit():
        if int(store_id) != admin_store.id:
            raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    elif store_id != admin_store.slug:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    if store_id.isdigit():
        store = await session.get(Store, int(store_id))
    else:
        result = await session.execute(select(Store).where(Store.slug == store_id))
        store = result.scalar_one_or_none()
        
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    for key, value in store_update.items():
        if hasattr(store, key):
            setattr(store, key, value)
            
    session.add(store)
    await session.commit()
    await session.refresh(store)
    
    from utils.events import emit_config_update
    await emit_config_update(session, store.id)
        
    return store

@router.patch("/{store_id}/business-status")
async def update_business_status(
    store_id: int,
    body: dict,
    auth_store: Store = Depends(require_staff_or_admin),
    session: AsyncSession = Depends(get_session),
):
    """
    Register/Admin 모두 호출 가능한 영업 시작/종료 토글 (staff JWT or admin JWT).
    body: {"is_open": bool}
    """
    if store_id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    is_open = bool(body.get("is_open"))
    auth_store.is_open = is_open
    session.add(auth_store)
    await session.commit()
    return {"status": "ok", "is_open": is_open}


@router.patch("/{store_id}/food-rescue-status")
async def update_food_rescue_status(
    store_id: int,
    body: dict,
    auth_store: Store = Depends(require_staff_or_admin),
    session: AsyncSession = Depends(get_session),
):
    """
    Register에서 フードレスキュー 수동 ON/OFF 토글 (staff JWT or admin JWT).
    body: {"food_rescue_manual_active": bool}
    - food_rescue_active(admin 설정)가 False인 경우 거부
    """
    if store_id != auth_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    if not auth_store.food_rescue_active:
        raise HTTPException(
            status_code=400,
            detail="管理者画面でフードレスキューを有効にしてください"
        )
    manual_active = bool(body.get("food_rescue_manual_active"))
    auth_store.food_rescue_manual_active = manual_active
    session.add(auth_store)
    await session.commit()
    return {"status": "ok", "food_rescue_manual_active": manual_active}


@router.patch("/{store_id}/theme", response_model=Store)
async def update_store_theme(store_id: int, theme: str, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied: store mismatch")
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    store.theme = theme
    session.add(store)
    await session.commit()
    await session.refresh(store)
    return store

# ── Photo Review Contest (SEO & UGC) ──────────────────────────────────────────

@router.get("/{store_id}/photo-reviews/public")
async def get_public_photo_reviews(store_id: str, session: AsyncSession = Depends(get_session)):
    """미니 홈페이지용 승인된/이달의사진 리뷰 목록 조회 (개인정보 제외)"""
    if store_id.isdigit():
        target_id = int(store_id)
    else:
        store = await session.execute(select(Store).where(Store.slug == store_id))
        s = store.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Store not found")
        target_id = s.id

    result = await session.execute(
        select(PhotoReview)
        .where(PhotoReview.store_id == target_id, PhotoReview.status.in_(["approved", "best_of_month"]))
        .order_by(PhotoReview.created_at.desc())
        .limit(60)
    )
    reviews = result.scalars().all()
    # 응답에서 guest_uuid 등 개인정보 제외
    return [
        {
            "id": r.id,
            "image_url": r.image_url,
            "comment": r.comment,
            "status": r.status,
            "created_at": r.created_at,
        }
        for r in reviews
    ]


@router.post("/{store_id}/photo-reviews")
async def upload_photo_review(
    request: Request,
    store_id: int,
    guest_uuid: str = Form(...),
    comment: Optional[str] = Form(None),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    """손님이 직접 올리는 포토 리뷰 (pending 상태). LIFF 로그인 + Rate Limit + EXIF 제거."""
    # ── 1. 매장 활성 여부 ────────────────────────────────────────────────
    store = await session.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    if not store.photo_contest_active:
        raise HTTPException(status_code=400, detail="この店舗ではフォトコンテストは無効です")

    # ── 2. LIFF 로그인 강제 (어뷰즈 방지) ─────────────────────────────────
    # LIFF 로그인 시 OrderView/StorePublicView 가 guest_uuid 를 line:{userId} 로 설정함
    if not guest_uuid or not guest_uuid.startswith("line:"):
        raise HTTPException(
            status_code=401,
            detail="LINEログインが必要です。ページ下部のLINE連携ボタンから登録してください。"
        )

    # ── 3. Rate Limit (IP + guest_uuid 별 24시간) ───────────────────────────
    client_ip = request.client.host if request.client else "unknown"
    _check_review_rate_limit(guest_uuid, client_ip)

    # ── 4. 파일 검증 ────────────────────────────────────────────────────
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다.")
    MAX_FILE_SIZE = 8 * 1024 * 1024  # 8MB
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기가 8MB를 초과합니다.")

    # ── 5. 코멘트 길이 + 위험 문자 차단 ─────────────────────────────────────
    if comment:
        comment = comment.strip()[:500]
        # HTML 태그 차단
        if re.search(r"<\s*(script|iframe|img|svg)", comment, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="不正な入力が含まれています")

    # ── 6. EXIF 제거 + JPEG 재인코딩 (위치정보 유출 방지) ──────────────────
    safe_bytes = _strip_image_metadata(file_bytes)

    # ── 7. (옵션) Vision API SafeSearch — VISION_API_KEY 가 설정된 경우에만 ─
    vision_key = os.getenv("VISION_API_KEY")
    if vision_key:
        try:
            import base64, requests
            payload = {
                "requests": [{
                    "image": {"content": base64.b64encode(safe_bytes).decode()},
                    "features": [{"type": "SAFE_SEARCH_DETECTION"}],
                }]
            }
            r = requests.post(
                f"https://vision.googleapis.com/v1/images:annotate?key={vision_key}",
                json=payload, timeout=8,
            )
            ann = r.json().get("responses", [{}])[0].get("safeSearchAnnotation", {})
            blocked = {"LIKELY", "VERY_LIKELY"}
            if (ann.get("adult") in blocked or ann.get("violence") in blocked or
                    ann.get("racy") in blocked):
                logger.warning("SafeSearch 차단: store=%s uuid=%s annot=%s", store_id, guest_uuid, ann)
                raise HTTPException(status_code=400, detail="不適切な内容が検出されました")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("Vision API 호출 실패, 통과 처리: %s", e)

    # ── 8. GCS 업로드 + DB 저장 ─────────────────────────────────────────
    try:
        from services.gcs_client import upload_image_to_gcs
        public_url = upload_image_to_gcs(
            file_bytes=safe_bytes,
            store_id=store_id,
            filename_prefix="photoreview",
        )
        review = PhotoReview(
            store_id=store_id,
            guest_uuid=guest_uuid,
            image_url=public_url,
            comment=comment,
            status="pending",
        )
        session.add(review)
        await session.commit()
        await session.refresh(review)
        # 응답에서 guest_uuid 제외
        return {
            "id": review.id,
            "image_url": review.image_url,
            "comment": review.comment,
            "status": review.status,
            "created_at": review.created_at,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Photo Review 업로드 실패 (store_id=%s): %s", store_id, e)
        raise HTTPException(status_code=500, detail="이미지 업로드 중 오류가 발생했습니다.")

@router.get("/{store_id}/photo-reviews")
async def get_all_photo_reviews(store_id: int, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    """관리자용 전체 리뷰 조회"""
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await session.execute(
        select(PhotoReview).where(PhotoReview.store_id == store_id).order_by(PhotoReview.created_at.desc())
    )
    return result.scalars().all()

@router.patch("/{store_id}/photo-reviews/{review_id}/status")
async def update_photo_review_status(
    store_id: int,
    review_id: int,
    status_data: dict,
    admin_store: Store = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    """리뷰 상태 변경 및 이달의 사진 선정 시 쿠폰 발급"""
    if store_id != admin_store.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    new_status = status_data.get("status")
    if new_status not in ["pending", "approved", "best_of_month", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    review = await session.get(PhotoReview, review_id)
    if not review or review.store_id != store_id:
        raise HTTPException(status_code=404, detail="Review not found")
        
    # 이미 쿠폰이 발급된 경우 중복 발급 방지
    was_best = (review.status == "best_of_month")

    review.status = new_status
    session.add(review)

    # 이달의 사진 선정 시 (idempotent + 30일 1회 제한)
    if new_status == "best_of_month" and not was_best:
        # 동일 guest 에게 최근 30일 내 photo_contest 쿠폰이 이미 있다면 재발급 안 함
        from datetime import timedelta as _td
        recent_cut = now_utc_naive() - _td(days=30)
        recent_res = await session.execute(
            select(RewardCoupon).where(
                RewardCoupon.store_id == store_id,
                RewardCoupon.guest_uuid == review.guest_uuid,
                RewardCoupon.source == "photo_contest",
                RewardCoupon.created_at >= recent_cut,
            )
        )
        already = recent_res.scalar_one_or_none()
        if already:
            logger.info("Photo contest 쿠폰 이미 30일 내 발급됨: uuid=%s coupon_id=%s",
                        review.guest_uuid, already.id)
        else:
            amount = admin_store.photo_contest_reward_amount or 500
            coupon = RewardCoupon(
                store_id=store_id,
                guest_uuid=review.guest_uuid,
                discount_amount=amount,
                is_used=False,
                source="photo_contest",
                expires_at=now_utc_naive() + timedelta(days=90),
            )
            session.add(coupon)

    await session.commit()
    return {"status": "ok", "new_status": new_status}
