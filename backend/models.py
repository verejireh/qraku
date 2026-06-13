from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, Text
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive
import uuid

# --- Models ---

from enum import Enum

class KitchenColorMode(str, Enum):
    CATEGORY = "CATEGORY"
    MENU = "MENU"
    TABLE = "TABLE"

class KitchenMode(str, Enum):
    # [2026-05-24] PG-AUDIT-KITCHEN-SQUARE: SQUARE value 대문자 통일.
    # 이전: SQUARE="square" → SQLAlchemy Enum hydration name(SQUARE) 기준
    # lookup 과 잠재 mismatch. 매장이 Square 모드 활성화 + database.py 에
    # 소문자 정규화 UPDATE 추가 시 폭발. PaymentOptions/TableStatus 패턴.
    KDS = "KDS"       # 내부 KiosPad 태블릿 KDS 모드 (기본값)
    SQUARE = "SQUARE" # Square POS / 프린터 연동 모드

class StoreCategory(str, Enum):
    # [2026-05-24] PG-AUDIT-ENUM-CONSISTENCY: name == value 통일.
    RESTAURANT = "RESTAURANT"
    CAFE = "CAFE"
    BAR = "BAR"
    OTHER = "OTHER"

class SubscriptionType(str, Enum):
    FREE = "FREE"
    MONTHLY = "MONTHLY"
    SIXMONTH = "SIXMONTH"
    YEARLY = "YEARLY"

class SubscriptionStatus(str, Enum):
    TRIAL = "TRIAL"
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"

class PointAccrualType(str, Enum):
    PERCENT = "PERCENT" # Percentage of total price
    FIXED = "FIXED"   # Fixed points per order

class PaymentOptions(str, Enum):
    # [2026-05-24] PG-AUDIT-PAYMENT-OPT: value 를 멤버 name 과 일치시켜
    # SQLAlchemy Enum 컬럼의 name-기반 lookup 과 DB 값을 정합화.
    # 9cd70de 가 DB 데이터만 소문자로 정규화했지만 Python enum value 는 그대로
    # 두어 admin login (oauth.py:128 Store SELECT) 에서 LookupError 발생.
    # KitchenMode "kds"→"KDS" 와 동일 패턴.
    CASH_ONLY = "CASH_ONLY"
    CARD_AND_CASH = "CARD_AND_CASH"

class Store(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    owner_id: str  # Authentication/User ID placeholder (email or provider_id)
    owner_name: Optional[str] = None  # Display name from OAuth or signup form
    category: StoreCategory = Field(default=StoreCategory.OTHER)
    theme: str = Field(default="sakura")
    slug: Optional[str] = Field(default=None, index=True)
    password_hash: Optional[str] = None
    # Social Login
    google_id: Optional[str] = Field(default=None, index=True)
    line_id: Optional[str] = Field(default=None, index=True)
    
    # Subscription Fields
    subscription_type: SubscriptionType = Field(default=SubscriptionType.FREE)
    subscription_status: SubscriptionStatus = Field(default=SubscriptionStatus.TRIAL)
    subscription_expires_at: Optional[datetime] = Field(default_factory=lambda: now_utc_naive() + timedelta(days=60))
    trial_start_date: Optional[datetime] = Field(default_factory=now_utc_naive)
    # Data Open Consent: 메뉴/사진/주소 익명 집계 공개 동의 (월 ¥1,000 할인)
    data_open_consent: bool = Field(default=False)
    # Stripe Integration
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    
    # Security/Geofence Fields
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geofence_enabled: bool = Field(default=False)
    
    # Loyalty Settings (Advanced)
    points_enabled: bool = Field(default=False)
    point_accrual_type: PointAccrualType = Field(default=PointAccrualType.PERCENT)
    point_rate: float = Field(default=1.0) # Points per 100 Yen (for PERCENT)
    point_fixed_amount: int = Field(default=0) # For FIXED
    point_review_bonus: int = Field(default=100)
    
    # Redemption Constraints
    min_redemption_points: int = Field(default=0)
    max_redemption_per_order: Optional[int] = None
    point_expiry_months: int = Field(default=12)
    
    # Kitchen Display Settings
    kitchen_color_mode: KitchenColorMode = Field(default=KitchenColorMode.CATEGORY)
    
    # Kitchen Order Processing Mode (Two-Track Switch)
    kitchen_mode: KitchenMode = Field(default=KitchenMode.KDS)
    
    # Square POS Integration (used only when kitchen_mode = 'square')
    square_access_token: Optional[str] = None
    square_refresh_token: Optional[str] = None
    square_merchant_id: Optional[str] = None
    square_location_id: Optional[str] = None
    square_connected: bool = Field(default=False)

    # POS Mode & View Toggles
    pos_mode: str = Field(default="basic")            # 'basic' or 'square'
    use_register_view: bool = Field(default=True)     # 스태프 핸디 카운터 화면
    use_kitchen_view: bool = Field(default=True)      # KDS 주방 화면

    # Language Settings
    supported_languages: str = Field(default="ja,en,ko,zh") # Comma separated: ja,en,ko,zh,vi,etc
    
    # Billing Settings
    payment_options: PaymentOptions = Field(default=PaymentOptions.CASH_ONLY)
    
    # Payment and POS configuration (New Two-Track Architecture)
    payment_settings: Optional["PaymentSettings"] = Relationship(back_populates="store")
    
    # Display Settings (Decoupled from payment)
    display_settings: Optional["StoreDisplaySettings"] = Relationship(back_populates="store")

    # Public Discovery Listing
    allow_public_listing: bool = Field(default=False)  # 홍보 페이지 노출 동의
    prefecture: Optional[str] = Field(default=None, max_length=100)  # 도도부현 (예: 東京都)
    city: Optional[str] = Field(default=None, max_length=100)        # 시구정촌 (예: 渋谷区)

    # ── My Home Page 추가 컨텐츠 (qraku.com/{shop_id} 에 노출) ─────────────
    about_description: Optional[str] = Field(default=None, max_length=2000)   # 매장 소개글
    specialty: Optional[str] = Field(default=None, max_length=1000)            # 자랑거리 / 추천 포인트
    interior_photos: Optional[str] = Field(default=None, max_length=4000)     # JSON 배열: ["url1", "url2", ...]
    exterior_photos: Optional[str] = Field(default=None, max_length=4000)     # JSON 배열
    nearby_attractions: Optional[str] = Field(default=None, max_length=4000)  # JSON 배열: [{name, description, image_url}]

    # Basic Info (owner fills in after signup)
    address: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=50)

    # Customer-facing LINE Official Account add-friend URL (e.g., https://lin.ee/xxxxx)
    line_friend_url: Optional[str] = Field(default=None, max_length=500)

    # Staff Auth — 마스터 PIN (6자리+ 숫자, register/staff/kitchen/setting 전체 접근)
    master_pin: Optional[str] = Field(default=None, max_length=20)

    # Business Hours (JSON string: {"mon":{"open":"11:00","close":"22:00"},...})
    business_hours: Optional[str] = Field(default=None, max_length=2000)
    is_open: bool = Field(default=True)  # 영업중 토글

    # Tax Settings
    tax_rate: float = Field(default=10.0)        # 세율 (%)
    tax_included: bool = Field(default=True)     # True=税込 / False=税別

    # Takeout Settings
    takeout_enabled: bool = Field(default=False)
    takeout_default_wait_minutes: int = Field(default=15)

    # Receipt Customization
    receipt_footer_message: Optional[str] = Field(default=None, max_length=500)
    receipt_logo_url: Optional[str] = Field(default=None, max_length=1000)

    # Daily Specials section toggle
    show_daily_specials: bool = Field(default=True)

    # ── Job Board (알바 모집) ──────────────────────────────────────────────────
    job_board_active: bool = Field(default=False)
    job_board_text: Optional[str] = Field(default=None, max_length=1000)

    # ── Food Rescue (타임 세일) ────────────────────────────────────────────────
    food_rescue_active: bool = Field(default=False)
    food_rescue_msg: Optional[str] = Field(default=None, max_length=500)
    food_rescue_mode: str = Field(default="manual")            # 'auto' | 'manual'
    food_rescue_auto_minutes: int = Field(default=60)          # 자동 모드: 영업종료 N분 전
    food_rescue_manual_active: bool = Field(default=False)     # 수동 모드: Register에서 ON/OFF

    # ── LINE Digital Stamp & CRM ──────────────────────────────────────────
    stamp_active: bool = Field(default=False)
    stamp_target: int = Field(default=10)
    stamp_reward_msg: Optional[str] = Field(default=None, max_length=500)
    stamp_reward_discount: int = Field(default=0)  # 적용할 할인 금액 (Yen)

    # ── Photo Review Contest & SEO ────────────────────────────────────────
    photo_contest_active: bool = Field(default=False)
    photo_contest_reward_amount: int = Field(default=500)  # 이달의 사진 선정 시 지급할 쿠폰 금액

    created_at: datetime = Field(default_factory=now_utc_naive)
    tables: List["Table"] = Relationship(back_populates="store")
    menus: List["Menu"] = Relationship(back_populates="store")
    staff_members: List["StaffMember"] = Relationship(back_populates="store")


class TableStatus(str, Enum):
    # [2026-05-24] PG-AUDIT-TABLE-STATUS: PaymentOptions 와 동일 회귀 fix.
    # SQLAlchemy Enum 컬럼 lookup 은 enum.name (대문자) 기준 → DB 값과 통일.
    # 9cd70de + 0cf84ee 가 value 를 소문자로 통일했지만 SQLAlchemy 의 enum
    # hydration 메커니즘과 충돌 → select(Table) 시 LookupError.
    READY = "READY"
    OCCUPIED = "OCCUPIED"
    CHECKOUT_REQUESTED = "CHECKOUT_REQUESTED"

class Table(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id")
    table_number: str
    qr_token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: TableStatus = Field(default=TableStatus.READY)
    session_token: Optional[str] = None
    join_window_end: Optional[datetime] = None
    last_order_id: Optional[int] = None # For review flow
    guest_count: Optional[int] = None  # 테이블 인원수
    call_staff: bool = Field(default=False)  # 손님이 점원 호출 버튼을 눌렀을 때
    checkout_requested_at: Optional[datetime] = None  # checkout 요청 시각 (결제대기 정렬용)

    store: Optional[Store] = Relationship(back_populates="tables")


class Menu(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id")
    name_ko: Optional[str] = None
    name_jp: str
    name_en: Optional[str] = None
    name_zh: Optional[str] = None
    description_ko: Optional[str] = None
    description_jp: Optional[str] = None
    description_en: Optional[str] = None
    description_zh: Optional[str] = None
    
    # For arbitrary extra languages (stored as JSON string: {"vi": "...", "fr": "..."})
    extra_translations: str = Field(default="{}") 
    
    # Store options config as JSON string (e.g., [{"group_name": "Size", "choices": [{"name":"Large", "extra_price":150}]}])
    options: str = Field(default="[]")
    
    price: int
    category: str
    image_url: Optional[str] = None
    is_active: bool = Field(default=True)       # Logical deletion
    is_available: bool = Field(default=True)    # Sold out toggle
    is_takeout_available: bool = Field(default=False)  # テイクアウト可能メニュー
    is_daily_special: bool = Field(default=False)  # Daily Special toggle
    special_price: Optional[int] = Field(default=None)  # Special price (if set, shown instead of regular price)
    sold_out_until: Optional[datetime] = None   # Scheduled availability
    sort_order: int = Field(default=0)          # Drag and drop positioning
    allergens: str = Field(default="[]", max_length=500)  # JSON: ["wheat","egg","dairy",...] (SPC-08)
    stock_today_total: Optional[int] = Field(default=None)  # 今日の仕込み量 (None=無制限) (SPC-09)
    stock_today_sold: int = Field(default=0)                # 今日の販売数 (SPC-09)

    store: Optional[Store] = Relationship(back_populates="menus")


class DeviceSession(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    table_id: int = Field(foreign_key="table.id", index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=now_utc_naive)
    
    table: Optional[Table] = Relationship()

class TranslationCache(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_text_hash: str = Field(index=True) # To optimize search vs long strings
    source_text: str
    target_lang: str = Field(index=True)
    translated_text: str
    created_at: datetime = Field(default_factory=now_utc_naive)

class Customer(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    created_at: datetime = Field(default_factory=now_utc_naive)
    last_visit: datetime = Field(default_factory=now_utc_naive)
    visit_count: int = Field(default=1)

class GuestProfile(SQLModel, table=True):
    guest_uuid: str = Field(primary_key=True)
    visit_count: int = Field(default=0)
    last_visit: Optional[datetime] = None
    prev_last_visit: Optional[datetime] = None  # 직전 방문일 (몇 일만에 방문 계산용)
    preferred_language: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc_naive)

class StampCard(SQLModel, table=True):
    """매장별 고객 스탬프 카드"""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    guest_uuid: str = Field(index=True)
    stamp_count: int = Field(default=0)
    last_stamped_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=now_utc_naive)

class RewardCoupon(SQLModel, table=True):
    """포토 리뷰 콘테스트 등에서 지급되는 테이크아웃 할인권"""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    guest_uuid: str = Field(index=True)
    discount_amount: int = Field(default=0)
    is_used: bool = Field(default=False)
    used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = Field(default=None, index=True)  # 만료일 (기본 90일)
    source: str = Field(default="photo_contest", max_length=50)       # photo_contest 등
    created_at: datetime = Field(default_factory=now_utc_naive)

class PhotoReview(SQLModel, table=True):
    """고객 참여형 포토 리뷰 콘테스트 (미니 홈페이지 노출)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    guest_uuid: str = Field(index=True)
    image_url: str = Field(max_length=1000)
    comment: Optional[str] = Field(default=None, max_length=1000)
    status: str = Field(default="pending")  # pending, approved, best_of_month
    created_at: datetime = Field(default_factory=now_utc_naive)


class BetaApplication(SQLModel, table=True):
    """베타 식당 모집 신청서"""
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_name: str = Field(max_length=100)
    store_name: str = Field(max_length=200)
    prefecture: Optional[str] = Field(default=None, max_length=50)
    city: Optional[str] = Field(default=None, max_length=100)
    email: str = Field(max_length=255, index=True)
    phone: Optional[str] = Field(default=None, max_length=50)
    seats: Optional[int] = None
    current_pos: Optional[str] = Field(default=None, max_length=200)  # 현재 사용중인 POS
    why_join: Optional[str] = Field(default=None, max_length=2000)    # 신청 이유
    status: str = Field(default="pending", max_length=20)              # pending / approved / rejected
    created_at: datetime = Field(default_factory=now_utc_naive)


# [2026-06-02] /owner LP 무료 상담 신청 리드 수집 (MKT-23)
class OwnerLead(SQLModel, table=True):
    """사장님 전환 LP(/owner) 무료 상담 신청 리드"""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_name: str = Field(max_length=200)
    contact_name: str = Field(max_length=100)
    contact: str = Field(max_length=255)                                   # 電話 または メール
    business_type: Optional[str] = Field(default=None, max_length=50)      # カフェ/ベーカリー/飲食店/その他
    message: Optional[str] = Field(default=None, max_length=2000)
    preferred_contact: Optional[str] = Field(default=None, max_length=20)  # 電話/メール/訪問
    utm_source: Optional[str] = Field(default=None, max_length=100)
    utm_medium: Optional[str] = Field(default=None, max_length=100)
    utm_campaign: Optional[str] = Field(default=None, max_length=100)
    referrer: Optional[str] = Field(default=None, max_length=500)
    landing_path: Optional[str] = Field(default=None, max_length=200)
    status: str = Field(default="new", max_length=20)                      # new / contacted / closed
    created_at: datetime = Field(default_factory=now_utc_naive)


class RefundLog(SQLModel, table=True):
    """환불 감사 로그 — 누가 언제 어떤 결제를 환불했는지 추적"""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    order_id: Optional[int] = Field(default=None, foreign_key="order.id", index=True)
    payment_id: Optional[str] = Field(default=None, max_length=255, index=True)  # Square/PayPay payment_id
    payment_method: Optional[str] = Field(default=None, max_length=50)           # square / paypay_direct
    refund_id: Optional[str] = Field(default=None, max_length=255)               # 결제망에서 발급한 refund_id
    amount: float = Field(default=0.0)
    reason: Optional[str] = Field(default=None, max_length=500)
    admin_user_id: Optional[str] = Field(default=None, max_length=255, index=True)  # 환불 실행한 관리자 (owner_id 등)
    status: str = Field(default="ok", max_length=20)                              # ok / failed
    error_message: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=now_utc_naive)


class CustomerPoint(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: str = Field(foreign_key="customer.id", index=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    balance: int = Field(default=0)
    updated_at: datetime = Field(default_factory=now_utc_naive)


class PointTransactionType(str, Enum):
    EARNED = "EARNED"
    USED = "USED"
    EXPIRED = "EXPIRED"

class PointHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: str = Field(foreign_key="customer.id")
    store_id: int = Field(foreign_key="store.id")
    amount: int
    tx_type: PointTransactionType
    description: Optional[str] = None
    related_order_id: Optional[int] = Field(default=None, foreign_key="order.id") # For ROI tracking
    created_at: datetime = Field(default_factory=now_utc_naive)


class GlobalReview(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id")
    order_id: int = Field(foreign_key="order.id")
    customer_id: str = Field(foreign_key="customer.id")
    rating: float = Field(default=5.0)
    tags: str = Field(default="{}") # JSON string
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc_naive)


class OrderType(str, Enum):
    EAT_IN = "eat_in"
    TAKE_OUT = "take_out"

class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # 정규 매장 FK — 매장↔주문 매칭은 반드시 이 컬럼 사용.
    # 실제 FK 제약·NOT NULL 은 database.py 마이그레이션이 소유(fresh/기존 DB 일관, 이중 FK 방지).
    store_id: Optional[int] = Field(default=None, index=True)
    # @deprecated: polymorphic(slug 또는 str(id)). store_id 도입으로 매칭에는 더 이상 쓰지 않으나,
    #   레거시 경로(데모 cleanup·pickup_code 등) 호환을 위해 생성 시 store_id 와 함께 기록(dual-write).
    shop_id: str = Field(index=True)
    table_number: str = Field(default="0")
    session_token: str
    guest_uuid: Optional[str] = Field(default=None, index=True)
    order_type: str = Field(default=OrderType.EAT_IN)  # 'eat_in' or 'take_out'
    payment_method: Optional[str] = Field(default=None)   # cash | card | square
    payment_status: str = Field(default="unpaid")  # 'unpaid' or 'paid'
    square_order_id: Optional[str] = None           # Square POS order ID
    square_payment_id: Optional[str] = None         # Square payment ID (take_out)
    pickup_time: Optional[str] = None               # Take-out pickup time (agreed)
    pickup_code: Optional[str] = Field(default=None, max_length=6)  # 손님 식별 코드 (예: A3F7)
    total_amount: float = Field(default=0.0)
    stamp_reward_used: bool = Field(default=False)
    used_coupon_id: Optional[int] = Field(default=None)  # 포토콘테스트 등 쿠폰 사용 내역
    discount_amount: float = Field(default=0.0)
    status: str = Field(default="pending_payment")
    needs_serving: bool = Field(default=True)  # 새 주문: True → 서빙 완료 시 False
    idempotency_key: Optional[str] = Field(default=None, max_length=64, unique=True)
    created_at: datetime = Field(default_factory=now_utc_naive)

    items: List["OrderItem"] = Relationship(back_populates="order")


class OrderItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: int = Field(foreign_key="order.id")
    menu_item_id: str
    quantity: int = Field(default=1)
    unit_price: float = Field(default=0.0)
    option_details: Optional[str] = None  # JSON string for options
    status: str = Field(default="pending")  # pending | cooking_complete | pickup_ready | served
    is_takeout_item: bool = Field(default=False)  # 이트인 주문 중 테이크아웃으로 요청된 아이템

    # 食べ放題: 활성 세션 대상 메뉴는 unit_price=0으로 저장되며 이 플래그로 식별
    is_tabehoudai: bool = Field(default=False)
    tabehoudai_session_id: Optional[int] = Field(default=None, index=True)

    order: Optional[Order] = Relationship(back_populates="items")


# --- Schemas ---

class ReviewCreate(SQLModel):
    store_id: int
    order_id: int
    customer_id: str
    rating: float
    tags: dict = {}
    comment: Optional[str] = None

class OrderItemCreate(SQLModel):
    menu_item_id: str
    quantity: int = 1
    option_details: Optional[str] = None
    is_takeout_item: bool = False

class OrderCreate(SQLModel):
    shop_id: str
    table_number: str          # "A1", "A2", "0" (takeout) etc.
    session_token: str
    guest_uuid: Optional[str] = None
    order_type: str = "eat_in"          # 'eat_in' or 'take_out'
    payment_method: Optional[str] = None
    source_id: Optional[str] = None     # Square card nonce (take_out only)
    pickup_time: Optional[str] = None   # Take-out pickup time
    use_stamp_reward: bool = False      # 스탬프 할인 사용 여부
    use_coupon_id: Optional[int] = None # 쿠폰 할인 사용 여부
    items: List[OrderItemCreate]

class TakeoutTimeQuery(SQLModel, table=True):
    """테이크아웃 조리 시간 문의 — 손님↔스태프 협의"""
    id: Optional[int] = Field(default=None, primary_key=True)
    shop_id: str = Field(index=True)                    # store slug
    guest_uuid: str = Field(index=True)
    items_snapshot: str = Field(default="[]")           # JSON cart snapshot
    total_amount: float = Field(default=0.0)
    query_type: str = Field(default="ask_available")    # 'ask_available' | 'ask_specific'
    requested_time: Optional[str] = None                # 'ask_specific' 시 손님이 요청한 시간
    status: str = Field(default="pending")              # pending | responded | agreed | declined | expired
    staff_response: Optional[str] = None                # 스태프 응답 메시지
    agreed_time: Optional[str] = None                   # 최종 합의 시간
    created_at: datetime = Field(default_factory=now_utc_naive)


class StaffMember(SQLModel, table=True):
    """Admin에서 등록하는 직원. Setting 페이지에서 출퇴근 관리."""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    name: str = Field(max_length=50)
    pin: str = Field(max_length=10)          # 4자리 숫자
    is_active: bool = Field(default=True)    # admin에서 등록/삭제 관리
    is_on_duty: bool = Field(default=False)  # setting에서 출근/퇴근
    clock_in_at: Optional[datetime] = None   # 최근 출근 시각
    created_at: datetime = Field(default_factory=now_utc_naive)

    store: Optional[Store] = Relationship(back_populates="staff_members")


class StaffAttendance(SQLModel, table=True):
    """스태프 출퇴근 1회 기록. clock_out 시 duration_minutes 자동 계산."""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    staff_id: int = Field(foreign_key="staffmember.id", index=True)
    staff_name: str = Field(max_length=50)          # 스태프 삭제 후에도 이름 보존
    clock_in: datetime
    clock_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None          # clock_out 시 계산 저장
    work_date: str = Field(max_length=10)           # "2026-05-01" (JST 날짜, 집계용)
    created_at: datetime = Field(default_factory=now_utc_naive)


class SystemConfig(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
    updated_at: datetime = Field(default_factory=now_utc_naive)


class PaymentMethodType(str, Enum):
    # [2026-05-24] PG-AUDIT-ENUM-CONSISTENCY: name == value 통일.
    PAY_AT_COUNTER = "PAY_AT_COUNTER"          # 현금/단말기 등 바이패스
    SQUARE_INTEGRATED = "SQUARE_INTEGRATED"    # Square 선결제
    PAYPAY_DIRECT = "PAYPAY_DIRECT"            # PayPay 다이렉트 연동

class StoreDisplaySettings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True, unique=True)
    
    use_kitchen_page: bool = Field(default=True)
    use_register_page: bool = Field(default=True)
    use_staff_page: bool = Field(default=True)
    
    store: Optional[Store] = Relationship(back_populates="display_settings")

class POSType(str, Enum):
    # [2026-05-24] PG-AUDIT-ENUM-CONSISTENCY: name == value 통일.
    SQUARE = "SQUARE"
    SMAREGI = "SMAREGI"
    AIRREGI = "AIRREGI"
    NONE = "NONE"


# ──────────────────────────────────────────────────────────────────
# Menu Group: 점심/저녁/食べ放題 등을 통합한 메뉴 그룹화 모델
# ──────────────────────────────────────────────────────────────────
class MenuGroupType(str, Enum):
    # [2026-05-24] PG-AUDIT-ENUM-CONSISTENCY: name == value 통일.
    TIME_WINDOW = "TIME_WINDOW"  # 시간대 기반 자동 활성화 (ランチ, ディナー)
    COURSE = "COURSE"            # 좌석 코스 (食べ放題/飲み放題)
    MANUAL = "MANUAL"            # 사장님 수동 토글


class MenuGroup(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    name: str = Field(max_length=100)                 # "ランチ", "ディナー", "90分食べ放題"
    group_type: MenuGroupType = Field(default=MenuGroupType.TIME_WINDOW)

    # TIME_WINDOW 전용
    active_from: Optional[str] = Field(default=None, max_length=5)   # "11:00"
    active_to: Optional[str] = Field(default=None, max_length=5)     # "15:00"
    weekdays: Optional[str] = Field(default=None, max_length=50)     # CSV "mon,tue,..." (None=매일)

    # COURSE 전용 (食べ放題/飲み放題)
    price_per_person: int = Field(default=0)
    duration_minutes: int = Field(default=90)
    last_order_minutes: int = Field(default=10)
    course_type: Optional[str] = Field(default=None, max_length=20)  # 'food' | 'drink' | 'both'

    # MANUAL 전용
    is_active: bool = Field(default=True)

    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=now_utc_naive)


class MenuGroupItem(SQLModel, table=True):
    """그룹과 메뉴 m:n 관계"""
    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="menugroup.id", index=True)
    menu_id: int = Field(foreign_key="menu.id", index=True)


class TabehoudaiSession(SQLModel, table=True):
    """식다파다이 진행 중 세션 — group_type=COURSE 그룹을 테이블에서 활성화"""
    id: Optional[int] = Field(default=None, primary_key=True)
    table_id: int = Field(foreign_key="table.id", index=True)
    group_id: int = Field(foreign_key="menugroup.id")
    num_people: int = Field(default=1)
    started_at: datetime = Field(default_factory=now_utc_naive)
    expires_at: datetime
    status: str = Field(default="active")  # active | expired | settled
    settled_at: Optional[datetime] = None
    # 세션을 착석 회차(Table.session_token)에 귀속 — 회전 후 이전 코스가 새 손님에게
    # 적용/청구되지 않도록 주문·정산 시 현재 토큰으로 필터링한다.
    session_token: Optional[str] = Field(default=None, max_length=255, index=True)

class PaymentSettings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True, unique=True)
    
    # 1. Payment Routing
    payment_method_type: PaymentMethodType = Field(default=PaymentMethodType.SQUARE_INTEGRATED)
    
    # 2. Square Credentials
    square_access_token: Optional[str] = None
    square_refresh_token: Optional[str] = None
    square_merchant_id: Optional[str] = None
    square_location_id: Optional[str] = None
    square_terminal_device_id: Optional[str] = Field(default=None, max_length=128)
    square_terminal_device_name: Optional[str] = Field(default=None, max_length=128)
    square_terminal_device_code_id: Optional[str] = Field(default=None, max_length=128)
    square_terminal_device_code: Optional[str] = Field(default=None, max_length=16)
    square_terminal_pairing_status: Optional[str] = Field(default=None, max_length=32)
    square_terminal_pair_by: Optional[datetime] = None
    square_terminal_paired_at: Optional[datetime] = None
    
    # 3. PayPay Credentials (for direct API)
    paypay_api_key: Optional[str] = None
    paypay_api_secret: Optional[str] = None
    paypay_merchant_id: Optional[str] = None
    
    # 4. POS Integration Target
    pos_type: POSType = Field(default=POSType.NONE)
    
    store: Optional[Store] = Relationship(back_populates="payment_settings")


class SquareTerminalCheckout(SQLModel, table=True):
    """One Square Terminal payment attempt for an eat-in table session."""

    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    table_id: int = Field(foreign_key="table.id", index=True)
    session_token: str = Field(max_length=255, index=True)
    idempotency_key: str = Field(max_length=64, unique=True, index=True)
    square_checkout_id: Optional[str] = Field(default=None, max_length=128, unique=True, index=True)
    device_id: str = Field(max_length=128)
    amount: int
    currency: str = Field(default="JPY", max_length=3)
    status: str = Field(default="CREATING", max_length=32, index=True)
    order_ids_json: str = Field(sa_column=Column(Text))
    course_session_ids_json: str = Field(default="[]", sa_column=Column(Text))
    payment_ids_json: str = Field(default="[]", sa_column=Column(Text))
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now_utc_naive, index=True)
    updated_at: datetime = Field(default_factory=now_utc_naive)
    completed_at: Optional[datetime] = None


# ── Messaging System ─────────────────────────────────────────────

class MessageSenderType(str, Enum):
    # [2026-05-24] PG-AUDIT-ENUM-CONSISTENCY: name == value 통일.
    # 9cd70de 류 raw UPDATE 회귀 차단.
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"

class Message(SQLModel, table=True):
    """1:1 messages between store admin and super admin."""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(index=True)  # Which store's conversation
    sender_type: MessageSenderType  # 'admin' or 'super_admin'
    content: str
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=now_utc_naive)

class Announcement(SQLModel, table=True):
    """Global announcements from super admin to all stores."""
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    content: str
    is_important: bool = Field(default=False)
    created_at: datetime = Field(default_factory=now_utc_naive)


# ── INF-02: 감사 로그 ────────────────────────────────────────────────────────

class EventLog(SQLModel, table=True):
    """모든 상태 변경 작업의 감사 로그. 절대 삭제하지 않는다."""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(index=True)
    actor_type: str = Field(max_length=32)   # customer | staff | admin | system | webhook
    actor_id: Optional[str] = Field(default=None, max_length=64)
    action: str = Field(max_length=64, index=True)  # order.created, refund.issued, ...
    target_type: Optional[str] = Field(default=None, max_length=32)
    target_id: Optional[int] = Field(default=None, index=True)
    payload_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    external_payload_raw: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now_utc_naive, index=True)


# ── INF-04: 외부 Webhook 수신 기록 ──────────────────────────────────────────

class WebhookEvent(SQLModel, table=True):
    """외부 결제사(Stripe/PayPay/Square) webhook 수신 기록. 멱등성 키 역할."""
    id: Optional[int] = Field(default=None, primary_key=True)
    provider: str = Field(max_length=32, index=True)   # stripe | paypay | square
    event_id: str = Field(max_length=128, index=True, unique=True)
    received_at: datetime = Field(default_factory=now_utc_naive, index=True)
    signature_valid: bool = Field(default=False)
    processed: bool = Field(default=False)
    payload_raw: Optional[str] = Field(default=None, sa_column=Column(Text))


# ── SPC-10: 친구 추천 Referral ──────────────────────────────────────────────

class ReferralCode(SQLModel, table=True):
    """사장님이 생성한 소개 코드 (1매장 여러 코드 가능)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_store_id: int = Field(index=True)
    code: str = Field(max_length=16, unique=True, index=True)
    reward_message: Optional[str] = Field(default=None, max_length=200)  # 클레임 시 표시 메시지
    max_uses: Optional[int] = Field(default=None)                        # None = 무제한
    uses: int = Field(default=0)
    expires_at: Optional[datetime] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=now_utc_naive)


class ReferralClaim(SQLModel, table=True):
    """손님이 소개 코드를 사용한 기록."""
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(max_length=16, index=True)
    claimer_id: str = Field(max_length=128, index=True)   # guest_uuid or store slug
    reward_status: str = Field(default="pending", max_length=32)  # pending | applied | expired
    created_at: datetime = Field(default_factory=now_utc_naive)


# ── PayPay Webhook 자동 Order 생성용 cart snapshot ──────────────────────────
class PendingPayPayOrder(SQLModel, table=True):
    """PayPay create-payment 시점에 저장하는 cart snapshot.

    손님이 콜백 페이지(/paypay-complete)를 닫거나 폴링 실패한 경우, webhook 이
    state=COMPLETED 수신 시 이 행을 참조해 Order 를 자동 생성한다.

    멱등성:
      - merchant_payment_id UNIQUE — 동일 결제 두 번 저장 불가
      - consumed_at 설정 후엔 재사용 안 함 (webhook + 폴링 양쪽 모두 안전)
      - Order.square_payment_id 도 UNIQUE 라 양쪽 경로 충돌 시 한쪽만 성공

    Cleanup:
      - expires_at 지난 행은 외부 cron (예: food_rescue_scheduler) 으로 주기 삭제
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    merchant_payment_id: str = Field(max_length=128, unique=True, index=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    amount: int                                  # 최종 청구 금액 (스탬프/쿠폰 차감 후)
    cart_snapshot: str = Field(sa_column=Column(Text))  # JSON: [{menu_id, quantity, option_details}]
    order_description: Optional[str] = Field(default=None, max_length=200)
    guest_uuid: Optional[str] = Field(default=None, max_length=128)
    stamp_reward_used: bool = Field(default=False)   # webhook 자동 생성 시 stamp 재차감 안 함
    coupon_id: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=now_utc_naive)
    expires_at: datetime                          # 보통 created_at + 30 분
    consumed_at: Optional[datetime] = Field(default=None, index=True)
