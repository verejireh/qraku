import asyncio
from sqlmodel import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine
from models import Store, Table

async def test_lookup():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        # 1. Resolve Store
        shop_id = "1234568"
        store_result = await session.execute(select(Store).where(Store.slug == shop_id))
        store = store_result.scalar_one_or_none()
        print(f"Store: {store.name if store else 'Not found'}")
        
        # 2. Resolve Table
        table_number_int = 1
        table_result = await session.execute(
            select(Table).where(Table.store_id == store.id, Table.table_number == str(table_number_int))
        )
        table = table_result.scalar_one_or_none()
        print(f"Table: {table.id if table else 'Not found'}, target: {str(table_number_int)}, status: {table.status if table else 'NA'}, token: {table.session_token if table else 'NA'}")

asyncio.run(test_lookup())
