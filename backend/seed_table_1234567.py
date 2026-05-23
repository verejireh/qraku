"""
테스트용 테이블 생성 스크립트
매장 1234567에 테이블 1, 2, 3 번을 생성합니다.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import select
from database import engine, init_db
from models import Store, Table, StoreCategory
import datetime

async def seed_tables():
    await init_db()
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        store_id = 1234567

        # Store 존재 확인
        result = await session.execute(select(Store).where(Store.id == store_id))
        store = result.scalar_one_or_none()
        if not store:
            print(f"Creating store {store_id}...")
            store = Store(
                id=store_id,
                name="Magnolia Grand Palace",
                owner_id="admin-123",
                category=StoreCategory.RESTAURANT,
                theme="modern",
                slug="magnolia-grand",
                # [2026-05-24] PG-DT-MIGRATE-02c — datetime.utcnow() Py 3.12+ deprecated
                subscription_expires_at=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=365)
            )
            session.add(store)
            await session.commit()
            await session.refresh(store)

        # 테이블 1~5 생성
        for table_num in range(1, 6):
            result = await session.execute(
                select(Table).where(Table.store_id == store_id, Table.table_number == str(table_num))
            )
            existing = result.scalar_one_or_none()
            if not existing:
                print(f"Creating Table {table_num} for store {store_id}...")
                new_table = Table(
                    store_id=store_id,
                    table_number=str(table_num),
                    qr_token=f"test-token-{table_num}"
                )
                session.add(new_table)
        
        await session.commit()
        print("Tables created successfully! ✅")
        
        # 확인
        result = await session.execute(select(Table).where(Table.store_id == store_id))
        tables = result.scalars().all()
        print(f"Total tables for store {store_id}: {len(tables)}")
        for t in tables:
            print(f"  - Table {t.table_number} (id={t.id}, token={t.qr_token})")

if __name__ == "__main__":
    asyncio.run(seed_tables())
