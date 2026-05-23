import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import select
from database import engine, init_db
from models import Store, Menu, Table, StoreCategory
import datetime

async def seed_samples():
    await init_db()
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        store_id = 1234567
        # Ensure Store exists
        result = await session.execute(select(Store).where(Store.id == store_id))
        store = result.scalar_one_or_none()
        
        if not store:
            print("Creating Magnolia Palace Store...")
            store = Store(
                id=store_id,
                name="Magnolia Grand Palace",
                owner_id="admin-123",
                category=StoreCategory.RESTAURANT,
                theme="modern", # Magnolia uses modern/default
                slug="magnolia-grand",
                # [2026-05-24] PG-DT-MIGRATE-02c — datetime.utcnow() Py 3.12+ deprecated
                subscription_expires_at=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=365)
            )
            session.add(store)
            await session.commit()
            await session.refresh(store)

        print("Adding sample menus and drinks...")
        samples = [
            # 3 New Main Menus
            Menu(
                store_id=store_id, 
                name_jp="プレミアム握り寿司セット", 
                name_ko="프리미엄 니기리 스시 세트", 
                name_en="Premium Nigiri Sushi Set", 
                price=3200, 
                category="Recommended", 
                image_url="https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&q=80&w=800"
            ),
            Menu(
                store_id=store_id, 
                name_jp="和牛和風丼", 
                name_ko="와규 와풍 돈부리", 
                name_en="Wagyu Japanese Donburi", 
                price=2800, 
                category="Recommended", 
                image_url="https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=800"
            ),
            Menu(
                store_id=store_id, 
                name_jp="海老天ぷらうどん", 
                name_ko="에비 텐푸라 우동", 
                name_en="Shrimp Tempura Udon", 
                price=1600, 
                category="Noodles", 
                image_url="https://images.unsplash.com/photo-1591814468924-cafb1d2273d0?auto=format&fit=crop&q=80&w=800"
            ),
            # 3 New Drinks
            Menu(
                store_id=store_id, 
                name_jp="プレミアム生ビール", 
                name_ko="프리미엄 나마비루", 
                name_en="Premium Draft Beer", 
                price=800, 
                category="Drinks", 
                image_url="https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=800"
            ),
            Menu(
                store_id=store_id, 
                name_jp="サントリー角ハイボール", 
                name_ko="산토리 가쿠 하이볼", 
                name_en="Suntory Kaku Highball", 
                price=700, 
                category="Drinks", 
                image_url="https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&q=80&w=800"
            ),
            Menu(
                store_id=store_id, 
                name_jp="ゆずシトラスエード", 
                name_ko="유자 시트러스 에이드", 
                name_en="Yuzu Citrus Ade", 
                price=650, 
                category="Drinks", 
                image_url="https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=800"
            ),
        ]
        
        for m in samples:
            # Check for duplicates by name
            result = await session.execute(select(Menu).where(Menu.store_id == store_id, Menu.name_en == m.name_en))
            existing = result.scalar_one_or_none()
            if not existing:
                session.add(m)
            else:
                # Update image if it's broken/missing
                existing.image_url = m.image_url
                session.add(existing)
        
        # Also fix some known existing broken ones
        broken_fixes = [
            ("Premium Wagyu Steak", "https://images.unsplash.com/photo-1546241072-48010ad28c2c?auto=format&fit=crop&q=80&w=800"),
            ("Iced Green Tea", "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&q=80&w=800"),
            ("Grand Palace Ramen", "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&q=80&w=800")
        ]
        for name, url in broken_fixes:
            result = await session.execute(select(Menu).where(Menu.store_id == store_id, Menu.name_en == name))
            item = result.scalar_one_or_none()
            if item:
                item.image_url = url
                session.add(item)

        await session.commit()
        print("Sample data added successfully.")

if __name__ == "__main__":
    asyncio.run(seed_samples())
