"""
PostgreSQL 테스트 데이터 시딩 스크립트
실행: python seed_data.py
"""
import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL이 .env에 없습니다.")

engine = create_async_engine(DATABASE_URL, echo=True, pool_pre_ping=True)

async def seed():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        print("🌸 KiosPad 테스트 데이터 시딩 시작...")

        # ── 1. 매장 upsert (slug='1234567') ─────────────────────────────
        store_result = await session.execute(
            text("SELECT id FROM store WHERE slug = :slug LIMIT 1"),
            {"slug": "1234567"},
        )
        existing_store = store_result.fetchone()
        if existing_store:
            await session.execute(
                text("""
                    UPDATE store
                    SET name = :name,
                        theme = :theme,
                        supported_languages = :supported_languages,
                        is_open = :is_open,
                        points_enabled = :points_enabled,
                        point_accrual_type = :point_accrual_type,
                        point_rate = :point_rate
                    WHERE slug = :slug
                """),
                {
                    "slug": "1234567",
                    "name": "Sakura Café",
                    "theme": "sakura",
                    "supported_languages": "ja,ko,en",
                    "is_open": True,
                    "points_enabled": False,
                    "point_accrual_type": "PERCENT",
                    "point_rate": 1.0,
                },
            )
        else:
            await session.execute(
                text("""
                    INSERT INTO store
                        (slug, name, owner_id, theme, supported_languages, is_open, points_enabled, point_accrual_type, point_rate)
                    VALUES
                        (:slug, :name, :owner_id, :theme, :supported_languages, :is_open, :points_enabled, :point_accrual_type, :point_rate)
                """),
                {
                    "slug": "1234567",
                    "name": "Sakura Café",
                    "owner_id": "seed:1234567",
                    "theme": "sakura",
                    "supported_languages": "ja,ko,en",
                    "is_open": True,
                    "points_enabled": False,
                    "point_accrual_type": "PERCENT",
                    "point_rate": 1.0,
                },
            )
        await session.commit()

        # slug로 store.id 조회
        result = await session.execute(
            text("SELECT id FROM store WHERE slug = '1234567' LIMIT 1")
        )
        row = result.fetchone()
        if not row:
            print("❌ 매장 생성 실패!")
            return
        store_id = row[0]
        print(f"✅ 매장 ID: {store_id} (slug: 1234567)")

        # ── 2. 테이블 8개 upsert ─────────────────────────────────────────
        for i in range(1, 9):
            token = f"test_token_{i:02d}"
            table_result = await session.execute(
                text('SELECT id FROM "table" WHERE store_id = :store_id AND table_number = :table_number LIMIT 1'),
                {"store_id": store_id, "table_number": str(i)},
            )
            existing_table = table_result.fetchone()
            if existing_table:
                await session.execute(
                    text("""
                        UPDATE "table"
                        SET qr_token = :qr_token,
                            status = :status
                        WHERE store_id = :store_id
                          AND table_number = :table_number
                    """),
                    {"store_id": store_id, "table_number": str(i), "qr_token": token, "status": "ready"},
                )
            else:
                await session.execute(
                    text("""
                        INSERT INTO "table"
                            (store_id, table_number, qr_token, status)
                        VALUES
                            (:store_id, :table_number, :qr_token, :status)
                    """),
                    {"store_id": store_id, "table_number": str(i), "qr_token": token, "status": "ready"},
                )

        await session.commit()
        print(f"✅ 테이블 8개 시딩 완료 (store_id={store_id})")

        # ── 3. 결과 확인 ─────────────────────────────────────────────────
        result = await session.execute(
            text('SELECT id, table_number, status FROM "table" WHERE store_id = :sid ORDER BY table_number::int'),
            {"sid": store_id}
        )
        tables = result.fetchall()
        print("\n📋 현재 DB 테이블 목록:")
        for t in tables:
            print(f"   ID={t[0]}, Table #{t[1]}, Status={t[2]}")

        print("\n🎉 시딩 완료! http://35.213.6.149:8003/1234567/admin 에서 확인하세요.")

if __name__ == "__main__":
    asyncio.run(seed())
