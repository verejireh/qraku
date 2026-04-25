import asyncio
from sqlalchemy import text
from database import engine

async def migrate():
    print("Migrating Menu table to add 'options' column...")
    async with engine.begin() as conn:
        try:
            # Check if column exists (MySQL)
            # Actually, standard alter table format. If it errors because it exists, we catch it.
            await conn.execute(text("ALTER TABLE menu ADD COLUMN options JSON DEFAULT ('[]')"))
            print("Successfully added 'options' column.")
        except Exception as e:
            print(f"Column might already exist or error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
