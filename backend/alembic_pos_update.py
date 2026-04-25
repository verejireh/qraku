import asyncio
from database import engine
from models import PaymentSettings
from sqlmodel import SQLModel

async def upgrade_db():
    async with engine.begin() as conn:
        print("Running SQLModel.metadata.create_all to ensure PaymentSettings exists...")
        await conn.run_sync(SQLModel.metadata.create_all)
        print("Done.")

if __name__ == "__main__":
    asyncio.run(upgrade_db())
