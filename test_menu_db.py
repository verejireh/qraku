import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv('.env')
DB_URL = os.getenv('DATABASE_URL')

async def check():
    engine = create_async_engine(DB_URL)
    async with AsyncSession(engine) as session:
        res = await session.execute(text('SELECT id, name_jp, name_ko, store_id FROM menu WHERE id IN (8, 13)'))
        print('Menus 8 and 13:', [dict(r) for r in res.mappings().all()])
        
        res2 = await session.execute(text('SELECT id, store_id, name_jp, name_ko FROM menu WHERE store_id IN (SELECT id FROM store WHERE slug = '1234568')'))
        print('Store 1234568 menus:', [dict(r) for r in res2.mappings().all()])

asyncio.run(check())
