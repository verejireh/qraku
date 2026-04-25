import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv('.env')
DB_URL = os.getenv('DATABASE_URL')
print('DB_URL:', DB_URL)

async def check():
    engine = create_async_engine(DB_URL)
    async with AsyncSession(engine) as session:
        res = await session.execute(text('SELECT id, shop_id FROM `order` ORDER BY id DESC LIMIT 2'))
        print('Recent Orders:', [dict(r) for r in res.mappings().all()])
        res2 = await session.execute(text('SELECT * FROM orderitem ORDER BY id DESC LIMIT 5'))
        print('Recent Items:', [dict(r) for r in res2.mappings().all()])
        res3 = await session.execute(text('SELECT * FROM `order` WHERE id = 11 OR id=12 OR id=13 OR id=14'))
        print('Orders 11-14:', [dict(r) for r in res3.mappings().all()])

asyncio.run(check())
