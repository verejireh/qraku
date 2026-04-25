import asyncio
from database import get_session
from models import Store, Table, Menu, StoreCategory, KitchenColorMode
from sqlmodel import select

async def seed_7digit_store():
    print("Seeding 7-digit Sample Store (1234567)...")
    
    async for session in get_session():
        # Check if exists
        existing = await session.get(Store, 1234567)
        if existing:
            print("Store 1234567 already exists. Skipping.")
            return

        # 1. Create Store
        store = Store(
            id=1234567,
            name="Magnolia Grand Palace",
            slug="magnolia-grand",
            owner_id="7digit_owner",
            category=StoreCategory.RESTAURANT,
            theme="sakura",
            kitchen_color_mode=KitchenColorMode.CATEGORY
        )
        session.add(store)
        
        # 2. Create Tables (1-10)
        for i in range(1, 11):
            session.add(Table(store_id=1234567, table_number=str(i).zfill(2))) # 01, 02...
            
        # 3. Create Basic Menus
        menus = [
            Menu(
                store_id=1234567, category="Main", price=1500, 
                name_jp="特製王宮ラーメン", name_ko="특제 궁전 라멘", name_en="Grand Palace Ramen",
                image_url="/images/samples/miso.png"
            ),
            Menu(
                store_id=1234567, category="Main", price=2500, 
                name_jp="プレミアム和牛ステーキ", name_ko="프리미엄 와규 스테이크", name_en="Premium Wagyu Steak",
                image_url="/images/samples/steak.png"
            ),
            Menu(
                store_id=1234567, category="Drinks", price=500, 
                name_jp="冷たい緑茶", name_ko="시원한 녹차", name_en="Iced Green Tea",
                image_url="/images/samples/matcha.png"
            )
        ]
        for m in menus:
            session.add(m)
            
        await session.commit()
        print(f"Created Store: {store.name} (ID: {store.id}) with 10 tables.")
        break

if __name__ == "__main__":
    asyncio.run(seed_7digit_store())
