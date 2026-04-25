import os
import sys
from dotenv import load_dotenv
from sqlmodel import SQLModel, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

# .env 파일에서 환경변수 로드
load_dotenv()

# DATABASE_URL은 반드시 .env에서 가져옴 (SQLite 폴백 절대 없음)
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("CRITICAL ERROR: DATABASE_URL 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.", file=sys.stderr)
    sys.exit(1)

if "sqlite" in DATABASE_URL.lower():
    print("CRITICAL ERROR: SQLite는 허용되지 않습니다. MySQL URL을 설정하세요.", file=sys.stderr)
    sys.exit(1)

# MySQL 전용 엔진 (pool_pre_ping으로 끊긴 연결 자동 복구)
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

async def init_db():
    """서버 시작 시 MySQL에 모든 테이블 생성 + 스키마 마이그레이션"""
    from models import Store, Table  # 지연 import로 순환 방지
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    # ── 자동 스키마 마이그레이션: 신규 컬럼이 없으면 추가 ──────────────────────
    # SQLModel의 create_all은 기존 테이블 컬럼을 추가하지 않으므로 수동 ALTER
    migration_sqls = [
        "ALTER TABLE store ADD COLUMN trial_start_date DATETIME NULL",
        "ALTER TABLE store ADD COLUMN stripe_customer_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN stripe_subscription_id VARCHAR(255) NULL",
        "ALTER TABLE menu ADD COLUMN options JSON DEFAULT ('[]')",
        # Order-related migrations for new columns
        "ALTER TABLE `order` ADD COLUMN guest_uuid VARCHAR(255) NULL",
        "ALTER TABLE orderitem ADD COLUMN option_details TEXT NULL",
        "ALTER TABLE store ADD COLUMN owner_name VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN google_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN line_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN latitude FLOAT NULL",
        "ALTER TABLE store ADD COLUMN longitude FLOAT NULL",
        "ALTER TABLE store ADD COLUMN geofence_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN points_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN point_accrual_type VARCHAR(255) DEFAULT 'PERCENT'",
        "ALTER TABLE store ADD COLUMN point_rate FLOAT DEFAULT 1.0",
        "ALTER TABLE store ADD COLUMN point_fixed_amount INT DEFAULT 0",
        "ALTER TABLE store ADD COLUMN point_review_bonus INT DEFAULT 100",
        "ALTER TABLE store ADD COLUMN min_redemption_points INT DEFAULT 0",
        "ALTER TABLE store ADD COLUMN max_redemption_per_order INT NULL",
        "ALTER TABLE store ADD COLUMN point_expiry_months INT DEFAULT 12",
        "ALTER TABLE store ADD COLUMN kitchen_color_mode VARCHAR(255) DEFAULT 'CATEGORY'",
        "ALTER TABLE store ADD COLUMN kitchen_mode VARCHAR(255) DEFAULT 'KDS'",
        "ALTER TABLE store ADD COLUMN square_access_token VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN square_refresh_token VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN square_merchant_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN square_location_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN square_connected BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN supported_languages VARCHAR(255) DEFAULT 'ja,en,ko,zh'",
        "ALTER TABLE store ADD COLUMN payment_options VARCHAR(255) DEFAULT 'CASH_ONLY'",
        # 데이터 복구용 UPDATE 구문 추가
        "UPDATE store SET kitchen_mode = 'KDS' WHERE kitchen_mode = 'kds'",
        "UPDATE store SET payment_options = 'CASH_ONLY' WHERE payment_options = 'cash_only'",
        # POS Mode & View Toggles (new Square architecture)
        "ALTER TABLE store ADD COLUMN pos_mode VARCHAR(50) DEFAULT 'basic'",
        "ALTER TABLE store ADD COLUMN use_register_view BOOLEAN DEFAULT TRUE",
        "ALTER TABLE store ADD COLUMN use_kitchen_view BOOLEAN DEFAULT TRUE",
        # Order: order_type, square tracking, pickup_time
        "ALTER TABLE `order` ADD COLUMN order_type VARCHAR(50) DEFAULT 'eat_in'",
        "ALTER TABLE `order` ADD COLUMN square_order_id VARCHAR(255) NULL",
        "ALTER TABLE `order` ADD COLUMN square_payment_id VARCHAR(255) NULL",
        "ALTER TABLE `order` ADD COLUMN pickup_time VARCHAR(100) NULL",
        # payment_status default was 'pending' → normalise existing rows
        "UPDATE `order` SET payment_status = 'unpaid' WHERE payment_status = 'pending'",
        # Table guest count
        "ALTER TABLE `table` ADD COLUMN guest_count INT NULL",
        # TableStatus migration: VARCHAR → UPDATE → new ENUM (safe for any starting state)
        # Step 1: Convert to VARCHAR so any old value can be updated freely
        "ALTER TABLE `table` MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'READY'",
        # Step 2: Normalize all old values
        "UPDATE `table` SET status = 'READY' WHERE status IN ('EMPTY', 'empty', 'PAID', 'paid')",
        "UPDATE `table` SET status = 'OCCUPIED' WHERE status IN ('ORDERING', 'ordering')",
        "UPDATE `table` SET status = 'OCCUPIED' WHERE status IN ('occupied')",
        "UPDATE `table` SET status = 'READY' WHERE status IN ('ready')",
        "UPDATE `table` SET status = 'CHECKOUT_REQUESTED' WHERE status IN ('checkout_requested')",
        # Step 3: Convert to final ENUM with only valid values
        "ALTER TABLE `table` MODIFY COLUMN status ENUM('READY','OCCUPIED','CHECKOUT_REQUESTED') NOT NULL DEFAULT 'READY'",
        # Staff call + serving tracking
        "ALTER TABLE `table` ADD COLUMN call_staff BOOLEAN DEFAULT FALSE",
        "ALTER TABLE `order` ADD COLUMN needs_serving BOOLEAN DEFAULT TRUE",
        # Per-item status tracking: pending → cooking_complete → served
        "ALTER TABLE orderitem ADD COLUMN status VARCHAR(50) DEFAULT 'pending'",
        # Register: checkout requested timestamp for sorting
        "ALTER TABLE `table` ADD COLUMN checkout_requested_at DATETIME DEFAULT NULL",
        # Register: payment_method on Order (cash / card / square)
        "ALTER TABLE `order` ADD COLUMN payment_method VARCHAR(50) NULL",
        # Public Discovery Listing
        "ALTER TABLE store ADD COLUMN allow_public_listing BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN prefecture VARCHAR(100) NULL",
        "ALTER TABLE store ADD COLUMN city VARCHAR(100) NULL",
        # Takeout per-menu flag
        "ALTER TABLE menu ADD COLUMN is_takeout_available BOOLEAN DEFAULT FALSE",
        # Order: pickup code for customer identification
        "ALTER TABLE `order` ADD COLUMN pickup_code VARCHAR(6) NULL",
        # OrderItem: takeout flag for eat-in table orders
        "ALTER TABLE orderitem ADD COLUMN is_takeout_item BOOLEAN DEFAULT FALSE",
        # Staff auth: master PIN on store
        "ALTER TABLE store ADD COLUMN master_pin VARCHAR(20) NULL",
        # StaffMember: clock_in tracking
        "ALTER TABLE staffmember ADD COLUMN clock_in_at DATETIME NULL",
        # Store: basic info fields
        "ALTER TABLE store ADD COLUMN address VARCHAR(500) NULL",
        "ALTER TABLE store ADD COLUMN phone VARCHAR(50) NULL",
        # Business Hours & Open status
        "ALTER TABLE store ADD COLUMN business_hours TEXT NULL",
        "ALTER TABLE store ADD COLUMN is_open BOOLEAN DEFAULT TRUE",
        # Tax Settings
        "ALTER TABLE store ADD COLUMN tax_rate FLOAT DEFAULT 10.0",
        "ALTER TABLE store ADD COLUMN tax_included BOOLEAN DEFAULT TRUE",
        # Takeout Settings
        "ALTER TABLE store ADD COLUMN takeout_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN takeout_default_wait_minutes INT DEFAULT 15",
        # Receipt Customization
        "ALTER TABLE store ADD COLUMN receipt_footer_message VARCHAR(500) NULL",
        "ALTER TABLE store ADD COLUMN receipt_logo_url VARCHAR(1000) NULL",
        # Order table_number: int → varchar (support A1, A2, etc.)
        "ALTER TABLE `order` MODIFY COLUMN table_number VARCHAR(50) NOT NULL DEFAULT '0'",
        # Daily Specials
        "ALTER TABLE menu ADD COLUMN is_daily_special BOOLEAN DEFAULT FALSE",
        "ALTER TABLE menu ADD COLUMN special_price INT NULL",
        # Store: toggle daily specials section visibility
        "ALTER TABLE store ADD COLUMN show_daily_specials BOOLEAN DEFAULT TRUE",
        # Messaging System
        "ALTER TABLE message ADD COLUMN is_read BOOLEAN DEFAULT FALSE",
        "ALTER TABLE announcement ADD COLUMN is_important BOOLEAN DEFAULT FALSE",
        # GuestProfile: 직전 방문일 (몇 일만에 방문 계산용)
        "ALTER TABLE guestprofile ADD COLUMN prev_last_visit DATETIME NULL",
        # Store: 데이터 공개 동의 (월 ¥1,000 할인 플랜)
        "ALTER TABLE store ADD COLUMN data_open_consent BOOLEAN DEFAULT FALSE",
    ]
    async with engine.begin() as conn:
        for sql in migration_sqls:
            try:
                await conn.execute(text(sql))
                print(f"✅ Migration: {sql[:60]}...")
            except Exception as e:
                # 이미 컬럼이 있으면 Duplicate column name 에러 → 무시
                if "Duplicate column name" in str(e) or "already exists" in str(e) or "1060" in str(e):
                    pass
                else:
                    print(f"⚠️ Migration skipped ({sql[:40]}...): {e}")

    print("✅ MySQL 테이블 초기화 완료 (kiospad DB)")


async_session_maker = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_session() -> AsyncSession:
    async with async_session_maker() as session:
        yield session
