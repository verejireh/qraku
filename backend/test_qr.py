import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine
from routers.qr import generate_themed_qr

async def test():
    async with AsyncSession(engine) as session:
        res = await generate_themed_qr(1, session)
        with open("test.png", "wb") as f:
            f.write(res.body)

asyncio.run(test())
