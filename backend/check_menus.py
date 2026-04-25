import asyncio
from sqlmodel import select
from database import engine, init_db
from models import Menu
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

async def check_menus():
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        result = await session.execute(select(Menu))
        menus = result.scalars().all()
        for m in menus:
            print(f"ID: {m.id}, Name: {m.name_ko}, Image: {m.image_url}")

if __name__ == "__main__":
    asyncio.run(check_menus())
