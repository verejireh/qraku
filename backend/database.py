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

# DBM-08b fix: PG 비번에 ! ~ # 등 특수문자가 있을 때 SQLAlchemy URL string
# 파서가 인증 실패를 일으키는 버그 회피. DB_USER + DB_PASS env 가 둘 다 있으면
# URL.create() 로 안전 조립하여 raw password 를 그대로 asyncpg 에 전달.
# 없으면 DATABASE_URL 그대로 사용 (MySQL 경로는 영향 없음).
_db_user = os.getenv("DB_USER")
_db_pass = os.getenv("DB_PASS")
if _db_user and _db_pass:
    from sqlalchemy.engine import URL
    DATABASE_URL = URL.create(
        drivername=os.getenv("DB_DRIVER", "postgresql+asyncpg"),
        username=_db_user,
        password=_db_pass,
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "qraku"),
    )

if not DATABASE_URL:
    print("CRITICAL ERROR: DATABASE_URL 환경변수가 설정되지 않았습니다.", file=sys.stderr)
    sys.exit(1)

_url_str = str(DATABASE_URL)
if "sqlite" in _url_str.lower():
    print("CRITICAL ERROR: SQLite는 허용되지 않습니다.", file=sys.stderr)
    sys.exit(1)

# MySQL / PostgreSQL 호환 엔진 (pool_pre_ping으로 끊긴 연결 자동 복구)
# DBM-12 컷오버 후 PG 단일화 예정.
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

async def _ensure_ansi_quotes(conn):
    """MySQL 세션에서 ANSI_QUOTES 모드 활성화 (마이그레이션 루프 전용).
    PG 에서는 no-op. migration_sqls 의 큰따옴표 식별자가 MySQL 에서도 동작하도록 보장."""
    if "mysql" in _url_str.lower():
        await conn.execute(text(
            "SET SESSION sql_mode = 'ANSI_QUOTES,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'"
        ))


async def init_db():
    """서버 시작 시 DB(MySQL 또는 PostgreSQL)에 모든 테이블 생성 + 스키마 마이그레이션"""
    from models import Store, Table, StaffAttendance, PhotoReview, RewardCoupon, RefundLog, BetaApplication, EventLog, WebhookEvent  # 지연 import로 순환 방지
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    # ── 자동 스키마 마이그레이션: 신규 컬럼이 없으면 추가 ──────────────────────
    # SQLModel의 create_all은 기존 테이블 컬럼을 추가하지 않으므로 수동 ALTER
    # [DBM-05] ANSI 호환화: 백틱 제거, IF NOT EXISTS 추가, 트랜잭션 항목별 분리
    # MySQL 8.0.29+ / PG 9.6+ 양 DB 호환. MODIFY COLUMN 4건은 PG에서 skip (metadata.create_all이 처리).
    migration_sqls = [
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS trial_start_date DATETIME NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255) NULL",
        # [DBM-05] JSON DEFAULT ('[]') → TEXT DEFAULT '[]' (양 DB 호환, 코드가 str로 다룸)
        "ALTER TABLE menu ADD COLUMN IF NOT EXISTS options TEXT DEFAULT '[]'",
        # Order-related migrations for new columns
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS guest_uuid VARCHAR(255) NULL',
        "ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS option_details TEXT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS line_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS latitude FLOAT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS longitude FLOAT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS points_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS point_accrual_type VARCHAR(255) DEFAULT 'PERCENT'",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS point_rate FLOAT DEFAULT 1.0",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS point_fixed_amount INT DEFAULT 0",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS point_review_bonus INT DEFAULT 100",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS min_redemption_points INT DEFAULT 0",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS max_redemption_per_order INT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS point_expiry_months INT DEFAULT 12",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS kitchen_color_mode VARCHAR(255) DEFAULT 'CATEGORY'",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS kitchen_mode VARCHAR(255) DEFAULT 'KDS'",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS square_access_token VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS square_refresh_token VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS square_merchant_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS square_location_id VARCHAR(255) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS square_connected BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS supported_languages VARCHAR(255) DEFAULT 'ja,en,ko,zh'",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS payment_options VARCHAR(255) DEFAULT 'CASH_ONLY'",
        # 데이터 복구용 UPDATE 구문 추가
        "UPDATE store SET kitchen_mode = 'KDS' WHERE kitchen_mode = 'kds'",
        "UPDATE store SET payment_options = 'CASH_ONLY' WHERE payment_options = 'cash_only'",
        # POS Mode & View Toggles (new Square architecture)
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS pos_mode VARCHAR(50) DEFAULT 'basic'",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS use_register_view BOOLEAN DEFAULT TRUE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS use_kitchen_view BOOLEAN DEFAULT TRUE",
        # Order: order_type, square tracking, pickup_time
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT \'eat_in\'',
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS square_order_id VARCHAR(255) NULL',
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS square_payment_id VARCHAR(255) NULL',
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS pickup_time VARCHAR(100) NULL',
        # payment_status default was 'pending' → normalise existing rows
        'UPDATE "order" SET payment_status = \'unpaid\' WHERE payment_status = \'pending\'',
        # Table guest count
        'ALTER TABLE "table" ADD COLUMN IF NOT EXISTS guest_count INT NULL',
        # TableStatus migration: VARCHAR → UPDATE → new ENUM (safe for any starting state)
        # Step 1: Convert to VARCHAR so any old value can be updated freely
        # MODIFY COLUMN: MySQL-only. PG skip (metadata.create_all creates correct type).
        'ALTER TABLE "table" MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT \'READY\'',
        # Step 2: Normalize all old values
        'UPDATE "table" SET status = \'READY\' WHERE status IN (\'EMPTY\', \'empty\', \'PAID\', \'paid\')',
        'UPDATE "table" SET status = \'OCCUPIED\' WHERE status IN (\'ORDERING\', \'ordering\')',
        'UPDATE "table" SET status = \'OCCUPIED\' WHERE status IN (\'occupied\')',
        'UPDATE "table" SET status = \'READY\' WHERE status IN (\'ready\')',
        'UPDATE "table" SET status = \'CHECKOUT_REQUESTED\' WHERE status IN (\'checkout_requested\')',
        # Step 3: Convert to final ENUM with only valid values
        # MODIFY COLUMN: MySQL-only. PG skip (metadata.create_all creates VARCHAR as per model).
        "ALTER TABLE \"table\" MODIFY COLUMN status ENUM('READY','OCCUPIED','CHECKOUT_REQUESTED') NOT NULL DEFAULT 'READY'",
        # Staff call + serving tracking
        'ALTER TABLE "table" ADD COLUMN IF NOT EXISTS call_staff BOOLEAN DEFAULT FALSE',
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS needs_serving BOOLEAN DEFAULT TRUE',
        # Per-item status tracking: pending → cooking_complete → served
        "ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'",
        # Register: checkout requested timestamp for sorting
        'ALTER TABLE "table" ADD COLUMN IF NOT EXISTS checkout_requested_at DATETIME DEFAULT NULL',
        # Register: payment_method on Order (cash / card / square)
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NULL',
        # Public Discovery Listing
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS allow_public_listing BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS prefecture VARCHAR(100) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL",
        # Takeout per-menu flag
        "ALTER TABLE menu ADD COLUMN IF NOT EXISTS is_takeout_available BOOLEAN DEFAULT FALSE",
        # Order: pickup code for customer identification
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS pickup_code VARCHAR(6) NULL',
        # OrderItem: takeout flag for eat-in table orders
        "ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS is_takeout_item BOOLEAN DEFAULT FALSE",
        # Staff auth: master PIN on store
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS master_pin VARCHAR(20) NULL",
        # StaffMember: clock_in tracking
        "ALTER TABLE staffmember ADD COLUMN IF NOT EXISTS clock_in_at DATETIME NULL",
        # Store: basic info fields
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS address VARCHAR(500) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS line_friend_url VARCHAR(500) NULL",
        # Business Hours & Open status
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS business_hours TEXT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT TRUE",
        # Tax Settings
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS tax_rate FLOAT DEFAULT 10.0",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS tax_included BOOLEAN DEFAULT TRUE",
        # Takeout Settings
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS takeout_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS takeout_default_wait_minutes INT DEFAULT 15",
        # Receipt Customization
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS receipt_footer_message VARCHAR(500) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS receipt_logo_url VARCHAR(1000) NULL",
        # Order table_number: int → varchar (support A1, A2, etc.)
        # MODIFY COLUMN: MySQL-only. PG skip (metadata.create_all creates VARCHAR as per model).
        'ALTER TABLE "order" MODIFY COLUMN table_number VARCHAR(50) NOT NULL DEFAULT \'0\'',
        # Daily Specials
        "ALTER TABLE menu ADD COLUMN IF NOT EXISTS is_daily_special BOOLEAN DEFAULT FALSE",
        "ALTER TABLE menu ADD COLUMN IF NOT EXISTS special_price INT NULL",
        # Store: toggle daily specials section visibility
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS show_daily_specials BOOLEAN DEFAULT TRUE",
        # Messaging System
        "ALTER TABLE message ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE",
        "ALTER TABLE announcement ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT FALSE",
        # GuestProfile: 직전 방문일 (몇 일만에 방문 계산용)
        "ALTER TABLE guestprofile ADD COLUMN IF NOT EXISTS prev_last_visit DATETIME NULL",
        # Store: 데이터 공개 동의 (월 ¥1,000 할인 플랜)
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS data_open_consent BOOLEAN DEFAULT FALSE",
        # OrderItem: 食べ放題 대상 마킹
        "ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS is_tabehoudai BOOLEAN DEFAULT FALSE",
        "ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS tabehoudai_session_id INT NULL",
        # StaffAttendance 테이블은 SQLModel.metadata.create_all로 자동 생성됨 (신규 테이블)
        # staffmember.clock_in_at 컬럼이 없는 경우 대비 safeguard
        "ALTER TABLE staffmember ADD COLUMN IF NOT EXISTS clock_in_at DATETIME NULL",
        # [2026-05-02] My Home Page — qraku.com/{shop_id} 매장 공개 페이지 컨텐츠
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS about_description TEXT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS specialty VARCHAR(1000) NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS interior_photos TEXT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS exterior_photos TEXT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS nearby_attractions TEXT NULL",
        # [2026-05-03] Micro Job Board & Food Rescue
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS job_board_active BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS job_board_text TEXT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS food_rescue_active BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS food_rescue_msg TEXT NULL",
        # [2026-05-03] LINE Digital Stamp
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS stamp_active BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS stamp_target INT DEFAULT 10",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS stamp_reward_msg TEXT NULL",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS stamp_reward_discount INT DEFAULT 0",
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS stamp_reward_used BOOLEAN DEFAULT FALSE',
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS discount_amount FLOAT DEFAULT 0.0',
        # [2026-05-04] Photo Review Contest
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS photo_contest_active BOOLEAN DEFAULT FALSE",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS photo_contest_reward_amount INT DEFAULT 500",
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS used_coupon_id INT NULL',
        # photoreview / rewardcoupon 테이블은 SQLModel.metadata.create_all 가 자동 생성
        # [2026-05-04] RewardCoupon 보강: 만료일·사용시각·발급출처
        "ALTER TABLE rewardcoupon ADD COLUMN IF NOT EXISTS used_at DATETIME NULL",
        "ALTER TABLE rewardcoupon ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL",
        "ALTER TABLE rewardcoupon ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'photo_contest'",
        # [2026-05-04] 멱등성: 결제 ID 중복 주문 방지 (NULL 은 다중 허용)
        # [DBM-05] ADD UNIQUE INDEX → CREATE UNIQUE INDEX IF NOT EXISTS (MySQL+PG 양 DB 호환)
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_order_square_payment_id ON "order"(square_payment_id)',
        # [2026-05-04] guestprofile.created_at 기본값 — INSERT 실패 방지
        # MODIFY COLUMN: MySQL-only. PG skip (metadata.create_all creates correct default).
        "ALTER TABLE guestprofile MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
        # [2026-05-06] Food Rescue 자동/수동 모드 분리
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS food_rescue_mode VARCHAR(10) DEFAULT 'manual'",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS food_rescue_auto_minutes INT DEFAULT 60",
        "ALTER TABLE store ADD COLUMN IF NOT EXISTS food_rescue_manual_active BOOLEAN DEFAULT FALSE",
        # [2026-05-09] INF-02: EventLog 검색 최적화 복합 인덱스
        "CREATE INDEX IF NOT EXISTS idx_eventlog_store_time ON eventlog(store_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_eventlog_store_action ON eventlog(store_id, action)",
        # [2026-05-09] INF-04: WebhookEvent 수신시각 복합 인덱스
        "CREATE INDEX IF NOT EXISTS idx_webhookevent_provider_received ON webhookevent(provider, received_at)",
        # [2026-05-09] INF-03: Order 클라이언트 Idempotency-Key (중복 주문 차단)
        'ALTER TABLE "order" ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64) NULL',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_order_idem_key ON "order"(idempotency_key)',
        # [2026-05-19] DBM-09 후속: MySQL 이 FK 컬럼에 자동 생성하던 인덱스를
        # SQLModel 가 PG 에서 자동 생성하지 않음 → 검증 도구가 누락 보고. 수동 보강.
        'CREATE INDEX IF NOT EXISTS idx_globalreview_store ON globalreview(store_id)',
        'CREATE INDEX IF NOT EXISTS idx_globalreview_customer ON globalreview(customer_id)',
        'CREATE INDEX IF NOT EXISTS idx_globalreview_order ON globalreview(order_id)',
        'CREATE INDEX IF NOT EXISTS idx_menu_store ON menu(store_id)',
        'CREATE INDEX IF NOT EXISTS idx_orderitem_order ON orderitem(order_id)',
        'CREATE INDEX IF NOT EXISTS idx_pointhistory_related_order ON pointhistory(related_order_id)',
        'CREATE INDEX IF NOT EXISTS idx_pointhistory_store ON pointhistory(store_id)',
        'CREATE INDEX IF NOT EXISTS idx_pointhistory_customer ON pointhistory(customer_id)',
        'CREATE INDEX IF NOT EXISTS idx_tabehoudaisession_group ON tabehoudaisession(group_id)',
        'CREATE INDEX IF NOT EXISTS idx_table_store ON "table"(store_id)',
        # [2026-05-20] SPC-03: PostGIS GIST 함수형 인덱스 (PG 전용, MySQL 에서는 ⚠️ 경고 후 skip)
        "CREATE INDEX IF NOT EXISTS idx_store_geo ON store USING GIST ((ST_MakePoint(longitude, latitude)::geography)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL",
    ]

    # PG 에서 무시할 에러 SQLSTATE 코드 + MySQL 메시지
    IGNORED_MIGRATION_ERRORS = (
        "Duplicate column name",   # MySQL: 컬럼 중복
        "already exists",          # PG: 컬럼/인덱스/테이블 중복 (42701, 42P07)
        "Duplicate key name",      # MySQL: 인덱스 중복
        "1060",                    # MySQL SQLSTATE: duplicate_column
        "42701",                   # PG SQLSTATE: duplicate_column
        "42P07",                   # PG SQLSTATE: duplicate_table/index
    )

    # [DBM-05] 항목별 트랜잭션 분리: PG 에서 단일 항목 실패 시 전체 abort 방지
    for sql in migration_sqls:
        # [DBM-05] PG 에서 MODIFY COLUMN 구문은 syntax error → skip (metadata.create_all이 처리)
        if "postgresql" in _url_str.lower() and " MODIFY COLUMN " in sql.upper():
            continue
        try:
            async with engine.begin() as conn:
                await _ensure_ansi_quotes(conn)
                await conn.execute(text(sql))
                print(f"✅ Migration: {sql[:60]}...")
        except Exception as e:
            err_str = str(e)
            if any(s in err_str for s in IGNORED_MIGRATION_ERRORS):
                pass
            else:
                print(f"⚠️ Migration skipped ({sql[:40]}...): {e}", file=sys.stderr)

    print("✅ MySQL 테이블 초기화 완료 (kiospad DB)")


async_session_maker = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_session() -> AsyncSession:
    async with async_session_maker() as session:
        yield session
