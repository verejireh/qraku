import asyncio
from sqlmodel import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine
from models import Store, Menu, StoreCategory, KitchenColorMode, SubscriptionType, SubscriptionStatus

async def run_seed():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        print("Starting seed process...")
        
        categories = ["메인메뉴", "서브메뉴", "드링크"]
        shops = []
        
        for i in range(1, 4):
            # 1. Create or Find Store
            slug = f"test-store-{i}"
            stmt = select(Store).where(Store.slug == slug)
            result = await session.execute(stmt)
            shop = result.scalar_one_or_none()
            
            if not shop:
                shop = Store(
                    name=f"테스트 식당 {i}",
                    owner_id="admin_test",
                    category=StoreCategory.RESTAURANT,
                    theme="sakura",
                    slug=slug,
                    subscription_type=SubscriptionType.FREE,
                    subscription_status=SubscriptionStatus.ACTIVE,
                    kitchen_color_mode=KitchenColorMode.CATEGORY
                )
                session.add(shop)
                await session.commit()
                await session.refresh(shop)
                print(f"Created Store: {shop.name} (ID: {shop.id})")
            else:
                print(f"Store already exists: {shop.name} (ID: {shop.id})")
            
            shops.append(shop)
            
            # 2. Create Menus
            for cat in categories:
                stmt = select(Menu).where(Menu.store_id == shop.id, Menu.category == cat)
                result = await session.execute(stmt)
                existing_menus = result.scalars().all()
                
                if len(existing_menus) == 0:
                    for j in range(1, 4):
                        menu = Menu(
                            store_id=shop.id,
                            name_ko=f"[{cat}] 맛있는 메뉴 {j}",
                            name_jp=f"[{cat}] おいしいメニュー {j}",
                            name_en=f"[{cat}] Delicious Menu {j}",
                            price=1500 * j,
                            category=cat,
                            is_active=True,
                            is_available=True,
                            sort_order=j
                        )
                        session.add(menu)
                    print(f"  Added 3 menus for category: {cat}")
                else:
                    print(f"  Menus already exist for category: {cat}")
            
            await session.commit()
            
        print("Seeding complete.")

if __name__ == "__main__":
    asyncio.run(run_seed())
