import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

async def check_db(db_path):
    print(f"\n--- Checking {db_path} ---")
    if not os.path.exists(db_path):
        print("File does not exist.")
        return
        
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.connect() as conn:
        try:
            result = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table';"))
            tables = result.fetchall()
            print(f"Tables: {[t[0] for t in tables]}")
            
            for table in tables:
                t_name = table[0]
                # Quote table name for reserved words
                count = await conn.execute(text(f'SELECT COUNT(*) FROM "{t_name}";'))
                c = count.scalar()
                print(f"Table {t_name} count: {c}")
                
                if t_name == "store" and c > 0:
                    rows = await conn.execute(text(f'SELECT * FROM "{t_name}";'))
                    print(f"Store rows: {rows.fetchall()}")
        except Exception as e:
            print(f"Error checking {db_path}: {e}")

async def main():
    base_path = "f:/myproject/orderservice/backend/"
    dbs = ["qr_v7.db", "qr_v8.db", "qr_v9.db"]
    for db in dbs:
        await check_db(os.path.join(base_path, db))

if __name__ == "__main__":
    asyncio.run(main())
