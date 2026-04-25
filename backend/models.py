from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime, timedelta
import uuid

# --- Models ---

from enum import Enum

class KitchenColorMode(str, Enum):
    CATEGORY = "CATEGORY"
    MENU = "MENU"
    TABLE = "TABLE"

class KitchenMode(str, Enum):
    KDS = "kds"       # 내부 KiosPad 태블릿 KDS 모드 (기본값)
    SQUARE = "square" # Square POS / 프린터 연동 모드

class StoreCategory(str, Enum):
    RESTAURANT = "restaurant"
    CAFE = "cafe"
    BAR = "bar"
    OTHER = "other"

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
    CASH_ONLY = "cash_only"
    CARD_AND_CASH = "card_and_cash"

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
    subscription_expires_at: Optional[datetime] = Field(default_factory=lambda: datetime.utcnow() + timedelta(days=60))
    trial_start_date: Optional[datetime] = Field(default_factory=datetime.utcnow)
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

    # Basic Info (owner fills in after signup)
    address: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=50)

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

    created_at: datetime = Field(default_factory=datetime.utcnow)
    tables: List["Table"] = Relationship(back_populates="store")
    menus: List["Menu"] = Relationship(back_populates="store")
    staff_members: List["StaffMember"] = Relationship(back_populates="store")


class TableStatus(str, Enum):
    READY = "ready"
    OCCUPIED = "occupied"
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

    store: Optional[Store] = Relationship(back_populates="menus")


class DeviceSession(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    table_id: int = Field(foreign_key="table.id", index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    table: Optional[Table] = Relationship()

class TranslationCache(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_text_hash: str = Field(index=True) # To optimize search vs long strings
    source_text: str
    target_lang: str = Field(index=True)
    translated_text: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Customer(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_visit: datetime = Field(default_factory=datetime.utcnow)
    visit_count: int = Field(default=1)

class GuestProfile(SQLModel, table=True):
    guest_uuid: str = Field(primary_key=True)
    visit_count: int = Field(default=0)
    last_visit: Optional[datetime] = None
    prev_last_visit: Optional[datetime] = None  # 직전 방문일 (몇 일만에 방문 계산용)
    preferred_language: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CustomerPoint(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    customer_id: str = Field(foreign_key="customer.id", index=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    balance: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


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
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GlobalReview(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id")
    order_id: int = Field(foreign_key="order.id")
    customer_id: str = Field(foreign_key="customer.id")
    rating: float = Field(default=5.0)
    tags: str = Field(default="{}") # JSON string
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OrderType(str, Enum):
    EAT_IN = "eat_in"
    TAKE_OUT = "take_out"

class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
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
    status: str = Field(default="pending_payment")
    needs_serving: bool = Field(default=True)  # 새 주문: True → 서빙 완료 시 False
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StaffMember(SQLModel, table=True):
    """Admin에서 등록하는 직원. Setting 페이지에서 출퇴근 관리."""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True)
    name: str = Field(max_length=50)
    pin: str = Field(max_length=10)          # 4자리 숫자
    is_active: bool = Field(default=True)    # admin에서 등록/삭제 관리
    is_on_duty: bool = Field(default=False)  # setting에서 출근/퇴근
    clock_in_at: Optional[datetime] = None   # 최근 출근 시각
    created_at: datetime = Field(default_factory=datetime.utcnow)

    store: Optional[Store] = Relationship(back_populates="staff_members")


class SystemConfig(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PaymentMethodType(str, Enum):
    PAY_AT_COUNTER = "pay_at_counter"          # 현금/단말기 등 바이패스
    SQUARE_INTEGRATED = "square_integrated"    # Square 선결제
    PAYPAY_DIRECT = "paypay_direct"            # PayPay 다이렉트 연동

class StoreDisplaySettings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(foreign_key="store.id", index=True, unique=True)
    
    use_kitchen_page: bool = Field(default=True)
    use_register_page: bool = Field(default=True)
    use_staff_page: bool = Field(default=True)
    
    store: Optional[Store] = Relationship(back_populates="display_settings")

class POSType(str, Enum):
    SQUARE = "square"
    SMAREGI = "smaregi"
    AIRREGI = "airregi"
    NONE = "none"

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
    
    # 3. PayPay Credentials (for direct API)
    paypay_api_key: Optional[str] = None
    paypay_api_secret: Optional[str] = None
    paypay_merchant_id: Optional[str] = None
    
    # 4. POS Integration Target
    pos_type: POSType = Field(default=POSType.NONE)
    
    store: Optional[Store] = Relationship(back_populates="payment_settings")


# ── Messaging System ─────────────────────────────────────────────

class MessageSenderType(str, Enum):
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"

class Message(SQLModel, table=True):
    """1:1 messages between store admin and super admin."""
    id: Optional[int] = Field(default=None, primary_key=True)
    store_id: int = Field(index=True)  # Which store's conversation
    sender_type: MessageSenderType  # 'admin' or 'super_admin'
    content: str
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Announcement(SQLModel, table=True):
    """Global announcements from super admin to all stores."""
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    content: str
    is_important: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
