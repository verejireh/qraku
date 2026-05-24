"""
demo.py – デモ専用エンドポイント

- /start: 個人デモ（ユニークテーブル番号で完全分離）
- /start-showcase: ショーケース用（一時ストアを生成し完全分離）
- /info: デモ情報取得
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import Table, TableStatus, Store, Menu, SubscriptionStatus, SubscriptionType, StoreCategory
from datetime import datetime, timedelta
from utils.time_helpers import now_utc_naive
import uuid

router = APIRouter(prefix="/demo", tags=["demo"])

# ── デモ店舗の固定設定 ──────────────────────────────────────────────────
DEMO_STORE_ID = 1234568   # int(store.id)  ← seed で作られた ID
SESSION_LIFE_MINUTES = 60  # デモセッションの有効期間
TEMP_STORE_PREFIX = "demo_tmp_"  # 一時ストアのslugプレフィックス
TEMP_STORE_EXPIRY_HOURS = 2  # 一時ストアの有効期間


# ── デモ用テーブル動的発行 ────────────────────────────────────────────
@router.post("/start")
async def start_demo(session: AsyncSession = Depends(get_session)):
    """
    各ユーザーに専用のデモテーブルを動的に割り当て。
    テーブル番号は D + 4桁ランダム で生成し、他ユーザーと干渉しない。
    """
    # 1. デモ店舗の確認
    store = await session.get(Store, DEMO_STORE_ID)
    if not store:
        raise HTTPException(
            status_code=404,
            detail="Demo store not found. Please run the demo seed script."
        )

    # 2. 期限切れのデモテーブルをクリーンアップ (D で始まるテーブルのみ)
    now = now_utc_naive()
    expired_result = await session.execute(
        select(Table).where(
            Table.store_id == DEMO_STORE_ID,
            Table.table_number.like("D%"),
            Table.join_window_end < now
        )
    )
    for expired_table in expired_result.scalars().all():
        await session.delete(expired_table)

    # 3. このユーザー専用の新規テーブルを作成
    short_id = uuid.uuid4().hex[:4].upper()
    demo_table_number = f"D{short_id}"
    new_token = str(uuid.uuid4())

    table = Table(
        store_id=DEMO_STORE_ID,
        table_number=demo_table_number,
        qr_token=str(uuid.uuid4()),
        status=TableStatus.OCCUPIED,
        session_token=new_token,
        join_window_end=now + timedelta(minutes=SESSION_LIFE_MINUTES),
    )
    session.add(table)
    await session.commit()
    await session.refresh(table)

    return {
        "store_id": store.id,
        "store_slug": store.slug or str(store.id),
        "table_id": table.id,
        "table_number": table.table_number,
        "session_token": new_token,
        "demo": True
    }


@router.post("/start-showcase")
async def start_showcase(session: AsyncSession = Depends(get_session)):
    """
    ショーケース用: ユーザーごとに一時ストアを生成し、
    メニューを複製、テーブル1~4を作成して完全に分離されたデモ環境を提供する。
    同時に古い一時ストアをクリーンアップする。
    """
    import traceback
    try:
        # 1. テンプレートとなるデモ店舗の確認
        template_store = await session.get(Store, DEMO_STORE_ID)
        if not template_store:
            raise HTTPException(status_code=404, detail="Demo store not found.")

        now = now_utc_naive()

        # 2. 古い一時ストアをクリーンアップ（2時間経過したもの）
        await _cleanup_expired_temp_stores(session, now)

        # 3. 新しい一時ストアを作成
        short_id = uuid.uuid4().hex[:6].lower()
        temp_slug = f"{TEMP_STORE_PREFIX}{short_id}"

        temp_store = Store(
            name=f"Demo - {short_id.upper()}",
            owner_id="demo_system",
            owner_name="Demo",
            category=template_store.category,
            theme=template_store.theme,
            slug=temp_slug,
            subscription_type=SubscriptionType.FREE,
            subscription_status=SubscriptionStatus.TRIAL,
            subscription_expires_at=now + timedelta(hours=TEMP_STORE_EXPIRY_HOURS),
            trial_start_date=now,
            kitchen_mode=template_store.kitchen_mode,
            pos_mode=template_store.pos_mode,
            supported_languages=template_store.supported_languages,
            payment_options=template_store.payment_options,
        )
        session.add(temp_store)
        await session.flush()
        await session.refresh(temp_store)

        # 4. テンプレートのメニューを複製
        menu_result = await session.execute(
            select(Menu).where(Menu.store_id == DEMO_STORE_ID)
        )
        template_menus = menu_result.scalars().all()

        for tmenu in template_menus:
            new_menu = Menu(
                store_id=temp_store.id,
                name_ko=tmenu.name_ko,
                name_jp=tmenu.name_jp,
                name_en=tmenu.name_en,
                name_zh=tmenu.name_zh,
                description_ko=tmenu.description_ko,
                description_jp=tmenu.description_jp,
                description_en=tmenu.description_en,
                description_zh=tmenu.description_zh,
                extra_translations=tmenu.extra_translations,
                options=tmenu.options,
                price=tmenu.price,
                category=tmenu.category,
                image_url=tmenu.image_url,
                is_active=tmenu.is_active,
                is_available=tmenu.is_available,
                sort_order=tmenu.sort_order,
            )
            session.add(new_menu)

        # 5. テーブル1~4を作成
        tables_out = []
        for tnum in ["1", "2", "3", "4"]:
            new_token = str(uuid.uuid4())
            table = Table(
                store_id=temp_store.id,
                table_number=tnum,
                qr_token=str(uuid.uuid4()),
                status=TableStatus.OCCUPIED,
                session_token=new_token,
                join_window_end=now + timedelta(hours=TEMP_STORE_EXPIRY_HOURS),
                guest_count=2,
            )
            session.add(table)
            await session.flush()
            await session.refresh(table)
            tables_out.append({
                "table_number": tnum,
                "table_id": table.id,
                "session_token": new_token,
            })

        await session.commit()

        return {
            "store_slug": temp_slug,
            "store_id": temp_store.id,
            "tables": tables_out,
            "expires_at": (now + timedelta(hours=TEMP_STORE_EXPIRY_HOURS)).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[DEMO] start-showcase error: {e}")
        traceback.print_exc()
        # セッションをクリーンな状態に戻す
        try:
            await session.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Demo setup failed: {str(e)}")


async def _cleanup_expired_temp_stores(session: AsyncSession, now: datetime):
    """
    期限切れの一時デモストアとその全関連データを削除する。
    ORM オブジェクト経由ではなく直接 SQL DELETE を使うことで
    セッション状態を汚染せず、FK 制約エラーも確実に回避する。
    """
    import os
    from sqlalchemy import text as _text
    # [DBM-05b] PG 예약어(order/table) 식별자 인용을 양 DB 호환으로:
    # MySQL 기본 sql_mode 는 backtick, PG 는 ANSI 큰따옴표만 허용.
    _is_pg = "postgresql" in os.environ.get("DATABASE_URL", "").lower()
    _q = '"' if _is_pg else "`"
    _order_tbl = f"{_q}order{_q}"
    _table_tbl = f"{_q}table{_q}"
    try:
        # 期限切れの一時ストアIDを取得
        result = await session.execute(
            select(Store).where(
                Store.slug.like(f"{TEMP_STORE_PREFIX}%"),
                Store.subscription_expires_at < now,
            )
        )
        expired_stores = result.scalars().all()

        if not expired_stores:
            return

        for store in expired_stores:
            sid = store.id
            # shop_id として使われうる値（slug + str(id)）
            shop_variants = [str(sid)]
            if store.slug:
                shop_variants.append(store.slug)

            try:
                # 1. OrderItem → Order（shop_id は文字列なので IN で検索）
                placeholders = ",".join(f"'{v}'" for v in shop_variants)
                order_rows = await session.execute(
                    _text(f"SELECT id FROM {_order_tbl} WHERE shop_id IN ({placeholders})")
                )
                order_ids = [row[0] for row in order_rows.all()]
                if order_ids:
                    id_list = ",".join(str(i) for i in order_ids)
                    await session.execute(_text(f"DELETE FROM orderitem WHERE order_id IN ({id_list})"))
                    await session.execute(_text(f"DELETE FROM {_order_tbl} WHERE id IN ({id_list})"))

                # 2. Table（FK あり）
                await session.execute(_text(f"DELETE FROM {_table_tbl} WHERE store_id = {sid}"))

                # 3. Menu（FK あり）
                await session.execute(_text(f"DELETE FROM menu WHERE store_id = {sid}"))

                # 4. GlobalReview（FK あり）
                await session.execute(_text(f"DELETE FROM globalreview WHERE store_id = {sid}"))

                # 5. PointHistory（FK あり）
                await session.execute(_text(f"DELETE FROM pointhistory WHERE store_id = {sid}"))

                # 6. CustomerPoint（FK あり）
                await session.execute(_text(f"DELETE FROM customerpoint WHERE store_id = {sid}"))

                # 7. Store 本体
                await session.execute(_text(f"DELETE FROM store WHERE id = {sid}"))

            except Exception as inner_e:
                print(f"[DEMO] Cleanup error for store {sid}: {inner_e}")
                # この store の削除に失敗しても次の store の処理を続ける

        await session.commit()
        print(f"[DEMO] Cleaned up {len(expired_stores)} expired temp stores")

    except Exception as e:
        print(f"[DEMO] Cleanup warning: {e}")
        # セッションが壊れていた場合は呼び出し元に影響しないようロールバック
        try:
            await session.rollback()
        except Exception:
            pass


@router.get("/orders/{store_slug}")
async def get_demo_orders(store_slug: str, session: AsyncSession = Depends(get_session)):
    """
    데모 쇼케이스용 공개 orders 엔드포인트 (인증 불필요).
    demo_tmp_ 접두사가 붙은 임시 스토어만 허용 — 일반 매장 주문 노출 불가.
    """
    from sqlalchemy.orm import selectinload as _selectinload
    from sqlmodel import select as _select
    from models import Order, OrderItem

    # 보안: demo_tmp_ 접두사 스토어만 허용
    if not store_slug.startswith(TEMP_STORE_PREFIX):
        raise HTTPException(status_code=403, detail="Demo-only endpoint. Not available for regular stores.")

    store_result = await session.execute(
        _select(Store).where(Store.slug == store_slug)
    )
    store = store_result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Demo store not found.")

    # 해당 스토어의 최근 주문 (최대 200개)
    orders_result = await session.execute(
        _select(Order)
        .where(Order.shop_id == store_slug)
        .options(_selectinload(Order.items))
        .order_by(Order.created_at.desc())
        .limit(200)
    )
    orders = orders_result.scalars().all()
    return orders


@router.get("/tables/{store_slug}")
async def get_demo_tables(store_slug: str, session: AsyncSession = Depends(get_session)):
    """
    데모 쇼케이스용 공개 tables 엔드포인트 (인증 불필요).
    demo_tmp_ 접두사가 붙은 임시 스토어만 허용.
    """
    from sqlmodel import select as _select

    if not store_slug.startswith(TEMP_STORE_PREFIX):
        raise HTTPException(status_code=403, detail="Demo-only endpoint. Not available for regular stores.")

    store_result = await session.execute(
        _select(Store).where(Store.slug == store_slug)
    )
    store = store_result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Demo store not found.")

    tables_result = await session.execute(
        _select(Table).where(Table.store_id == store.id)
    )
    tables = tables_result.scalars().all()
    return [
        {
            "id": t.id,
            "table_number": t.table_number,
            "status": (t.status.value if hasattr(t.status, 'value') else str(t.status)).lower(),
            "session_token": t.session_token,
            "guest_count": t.guest_count,
            "join_window_end": t.join_window_end.isoformat() if t.join_window_end else None,
        }
        for t in tables
    ]


@router.get("/info")
async def get_demo_info(session: AsyncSession = Depends(get_session)):
    """ランディングページが QR コードを生成するための情報を返す（公開情報のみ）"""
    store = await session.get(Store, DEMO_STORE_ID)
    if not store:
        return {"available": False}
    return {
        "available": True,
        "store_id": store.id,
        "store_name": store.name,
        "slug": store.slug or str(store.id),
        "theme": store.theme
    }
