"""
migrate_square_oauth.py – Square OAuth 관련 추가 필드 마이그레이션 스크립트
"""

import asyncio
import os
import sys

# 백엔드 모듈 경로 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./qr_v9.db")

async def run():
    engine = create_async_engine(DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE store ADD COLUMN square_refresh_token VARCHAR"))
            print("✅ square_refresh_token column added")
        except Exception as e:
            print(f"ℹ️  square_refresh_token may already exist: {e}")

        try:
            await conn.execute(text("ALTER TABLE store ADD COLUMN square_merchant_id VARCHAR"))
            print("✅ square_merchant_id column added")
        except Exception as e:
            print(f"ℹ️  square_merchant_id may already exist: {e}")

    await engine.dispose()
    print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(run())
