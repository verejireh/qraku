import asyncio
from database import get_session
from models import Store, Menu
from sqlmodel import select

async def update_themes():
    async for session in get_session():
        # Update Store 1 to Tsubaki (Camellia)
        result = await session.execute(select(Store).where(Store.slug == "store123"))
        store1 = result.scalar_one_or_none()
        if store1:
            store1.theme = "tsubaki"
            session.add(store1)
            print("Store 1 updated to 'tsubaki'")

            # Add Camellia / Bamboo Menus
            menu4 = Menu(store_id=store1.id, name_ko="동백 특선 사시미", name_jp="椿特選刺身盛り合わせ", name_en="Camellia Special Sashimi", description_ko="최상급 참치와 제철 선어", description_jp="厳選された本マグロと旬の鮮魚", description_en="Premium fatty tuna and seasonal catch.", price=4500, category="Chef Specials", image_url="https://images.unsplash.com/photo-1534482421-02686121f271?auto=format&fit=crop&q=80&w=400")
            menu5 = Menu(store_id=store1.id, name_ko="대나무 죽순 야키토리", name_jp="筍の炭火焼き", name_en="Bamboo Shoot Yakitori", description_ko="대나무 숲의 향기를 담은 죽순 구이", description_jp="竹林の香りを楽しむ筍の炭火焼き", description_en="Grilled bamboo shoots with charcoal aroma.", price=1200, category="Bamboo Specials", image_url="https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400")
            session.add(menu4)
            session.add(menu5)
            print("Camellia & Bamboo menus added.")

        await session.commit()

if __name__ == "__main__":
    asyncio.run(update_themes())
