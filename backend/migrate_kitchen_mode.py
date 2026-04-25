"""
migrate_kitchen_mode.py – kitchen_mode カラムを Store テーブルに追加するマイグレーション
"""

import asyncio
import os
import sys

# バックエンドのパスを追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./qr_v9.db")

async def run():
    engine = create_async_engine(DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        # kitchen_mode カラム追加
        try:
            await conn.execute(text("ALTER TABLE store ADD COLUMN kitchen_mode VARCHAR NOT NULL DEFAULT 'kds'"))
            print("✅ kitchen_mode column added")
        except Exception as e:
            print(f"ℹ️  kitchen_mode column may already exist: {e}")

        # Square 連携カラム追加
        try:
            await conn.execute(text("ALTER TABLE store ADD COLUMN square_access_token VARCHAR"))
            print("✅ square_access_token column added")
        except Exception as e:
            print(f"ℹ️  square_access_token may already exist: {e}")

        try:
            await conn.execute(text("ALTER TABLE store ADD COLUMN square_location_id VARCHAR"))
            print("✅ square_location_id column added")
        except Exception as e:
            print(f"ℹ️  square_location_id may already exist: {e}")

        try:
            await conn.execute(text("ALTER TABLE store ADD COLUMN square_connected BOOLEAN NOT NULL DEFAULT 0"))
            print("✅ square_connected column added")
        except Exception as e:
            print(f"ℹ️  square_connected may already exist: {e}")

    await engine.dispose()
    print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(run())
