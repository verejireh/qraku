import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine
from routers.qr import generate_batch_qr_signs, BatchGenerateRequest

async def test():
    async with AsyncSession(engine, expire_on_commit=False) as session:
        payload = BatchGenerateRequest(range_start=1, range_end=2, format='pdf')
        res = await generate_batch_qr_signs("1", payload, session)
        with open("batch_test.pdf", "wb") as f:
            f.write(res.body)
        print("PDF Success")
        
        payload2 = BatchGenerateRequest(specific_tables=[5, 9], format='jpg')
        res2 = await generate_batch_qr_signs("1", payload2, session)
        with open("batch_test.zip", "wb") as f:
            f.write(res2.body)
        print("JPG Zip Success")

asyncio.run(test())
