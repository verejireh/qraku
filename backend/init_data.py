import asyncio
from database import init_db, get_session
from models import Store, Table, Menu, StoreCategory
from sqlmodel import select

async def create_initial_data():
    await init_db()
    
    async for session in get_session():
        # Check if store 1 exists
        result = await session.execute(select(Store).where(Store.id == 1))
        store1 = result.scalar_one_or_none()
        
        if not store1:
            print("Creating initial stores...")
            # Store 1: Restaurant (Cosmos Premium)
            store1 = Store(name="Izu Udon House", slug="store123", owner_id="owner_izu_01", category=StoreCategory.RESTAURANT, theme="cosmos")
            session.add(store1)
            
            # Store 2: Cafe (Modern Minimal)
            store2 = Store(name="Seaside Cafe", slug="seaside-cafe", owner_id="owner_cafe_01", category=StoreCategory.CAFE, theme="modern")
            session.add(store2)
            
            await session.commit()
            await session.refresh(store1)
            await session.refresh(store2)
            
            # Create Tables for Store 1
            print("Creating tables for Store 1...")
            for i in range(1, 11): 
                table = Table(store_id=store1.id, table_number=str(i))
                session.add(table)

            # Create Tables for Store 2
            print("Creating tables for Store 2...")
            for i in range(1, 6): 
                table = Table(store_id=store2.id, table_number=str(i))
                session.add(table)
            
            # Create Menus (20 items)
            print("Creating menus...")
            # Image paths assumed in /images/ (Frontend public folder)
            # We will use the generated images mapping
            img_basic = "/images/udon_basic.png"
            img_beef = "/images/udon_beef.png"
            img_tempura = "/images/tempura_assorted.png"
            img_side = "/images/inari_sushi.png"
            img_drink = "/images/drink.png" # Placeholder or generate later

            menus = [
                # --- Udon (Main) ---
                Menu(
                    store_id=store1.id, category="Udon", price=600, image_url=img_basic,
                    name_ko="카케 우동", name_jp="かけうどん", name_en="Kake Udon",
                    description_ko="깔끔한 멸치 육수의 기본 우동",
                    description_jp="シンプルで奥深い、自慢の出汁のうどん",
                    description_en="Classic udon with savory dashi broth"
                ),
                Menu(
                    store_id=store1.id, category="Udon", price=750, image_url=img_basic,
                    name_ko="키츠네 우동", name_jp="きつねうどん", name_en="Kitsune Udon",
                    description_ko="달콤하게 조린 큰 유부가 올라간 우동",
                    description_jp="甘く煮た大きな油揚げがのったうどん",
                    description_en="Udon topped with sweet deep-fried tofu"
                ),
                Menu(
                    store_id=store1.id, category="Udon", price=700, image_url=img_basic,
                    name_ko="타누키 우동", name_jp="たぬきうどん", name_en="Tanuki Udon",
                    description_ko="바삭한 튀김 부스러기(텐카스)가 고소한 우동",
                    description_jp="サクサクの天かすが香ばしいうどん",
                    description_en="Udon topped with crunchy tempura bits"
                ),
                Menu(
                    store_id=store1.id, category="Udon", price=750, image_url=img_basic,
                    name_ko="와카메 우동", name_jp="わかめうどん", name_en="Wakame Udon",
                    description_ko="이즈 바다의 신선한 미역이 듬뿍 들어간 우동",
                    description_jp="伊豆の海の新鮮なわかめがたっぷり",
                    description_en="Udon with fresh seaweed from Izu sea"
                ),
                Menu(
                    store_id=store1.id, category="Udon", price=800, image_url=img_basic,
                    name_ko="츠키미 우동", name_jp="月見うどん", name_en="Tsukimi Udon",
                    description_ko="달처럼 둥근 날달걀이 올라간 부드러운 우동",
                    description_jp="月のような生卵がのったまろやかなうどん",
                    description_en="Udon topped with a raw egg (Moon Viewing)"
                ),
                Menu(
                    store_id=store1.id, category="Udon", price=950, image_url=img_beef,
                    name_ko="니꾸 우동", name_jp="肉うどん", name_en="Beef Udon",
                    description_ko="특제 소스로 조린 소고기가 듬뿍",
                    description_jp="特製ダレで煮込んだ牛肉がたっぷり",
                    description_en="Udon with simmered savory beef"
                ),
                Menu(
                    store_id=store1.id, category="Udon", price=980, image_url=img_beef,
                    name_ko="카레 우동", name_jp="カレーうどん", name_en="Curry Udon",
                    description_ko="진한 카레 국물과 우동면의 조화",
                    description_jp="濃厚なカレーと出汁のハーモニー",
                    description_en="Creamy and spicy curry broth udon"
                ),
                Menu(
                    store_id=store1.id, category="Udon", price=1200, image_url=img_beef,
                    name_ko="나베야키 우동", name_jp="鍋焼きうどん", name_en="Nabeyaki Udon",
                    description_ko="뚝배기에 새우튀김, 버섯 등을 넣고 끓인 우동",
                    description_jp="土鍋で海老天や具材を煮込んだうどん",
                    description_en="Hot pot udon with shrimp tempura and vegetables"
                ),
                Menu(
                    store_id=store1.id, category="Udon (Cold)", price=700, image_url=img_basic,
                    name_ko="자루 우동", name_jp="ざるうどん", name_en="Zaru Udon",
                    description_ko="차가운 면을 츠유에 찍어먹는 우동",
                    description_jp="冷たい麺をつゆにつけて食べるうどん",
                    description_en="Cold noodles served with dipping sauce"
                ),
                Menu(
                    store_id=store1.id, category="Udon (Cold)", price=850, image_url=img_basic,
                    name_ko="붓카케 우동", name_jp="ぶっかけうどん", name_en="Bukkake Udon",
                    description_ko="진한 츠유를 면에 부어 비벼먹는 우동",
                    description_jp="濃いめのつゆをかけて食べるうどん",
                    description_en="Cold udon with sauce poured over"
                ),

                # --- Tempura & Sides ---
                Menu(
                    store_id=store1.id, category="Side Details", price=400, image_url=img_tempura,
                    name_ko="새우 튀김 (2개)", name_jp="海老天 (2尾)", name_en="Shrimp Tempura (2pcs)",
                    description_ko="바삭하고 탱글탱글한 새우 튀김",
                    description_jp="プリプリでサクサクの海老天",
                    description_en="Crispy fried shrimp tempura"
                ),
                Menu(
                    store_id=store1.id, category="Side Details", price=500, image_url=img_tempura,
                    name_ko="야채 튀김 모둠", name_jp="野菜天ぷら盛り合わせ", name_en="Vegetable Tempura",
                    description_ko="계절 야채를 갓 튀겨낸 모둠 튀김",
                    description_jp="季節の野菜を揚げた天ぷら盛り合わせ",
                    description_en="Assorted seasonal vegetable tempura"
                ),
                Menu(
                    store_id=store1.id, category="Side Details", price=250, image_url=img_tempura,
                    name_ko="치쿠와 튀김", name_jp="ちくわ天", name_en="Chikuwa Tempura",
                    description_ko="쫄깃한 어묵 튀김, 우동과 찰떡궁합",
                    description_jp="モチモチのちくわ天、うどんに合う",
                    description_en="Fried fish cake roll tempura"
                ),
                Menu(
                    store_id=store1.id, category="Side Details", price=300, image_url=img_tempura,
                    name_ko="오징어 튀김", name_jp="イカ天", name_en="Squid Tempura",
                    description_ko="부드러운 오징어 몸통 튀김",
                    description_jp="柔らかいイカの天ぷら",
                    description_en="Tender squid tempura"
                ),
                Menu(
                    store_id=store1.id, category="Rice", price=300, image_url=img_side,
                    name_ko="유부초밥 (2개)", name_jp="いなり寿司 (2個)", name_en="Inari Sushi (2pcs)",
                    description_ko="달콤 새콤한 유부초밥",
                    description_jp="甘じょっぱい、懐かしいいなり寿司",
                    description_en="Sushi rice stuffed in seasoned tofu pouches"
                ),
                Menu(
                    store_id=store1.id, category="Rice", price=250, image_url=img_side,
                    name_ko="오니기리 (매실)", name_jp="おにぎり (梅)", name_en="Rice Ball (Plum)",
                    description_ko="직접 담근 매실 장아찌가 들어간 주먹밥",
                    description_jp="自家製梅干しの入ったおにぎり",
                    description_en="Rice ball with pickled plum"
                ),

                # --- Drink ---
                Menu(
                    store_id=store1.id, category="Drink", price=600, image_url=img_drink,
                    name_ko="생맥주 (이즈 에일)", name_jp="生ビール (伊豆エール)", name_en="Draft Beer (Izu Ale)",
                    description_ko="이즈 지역의 시원한 크래프트 맥주",
                    description_jp="伊豆の爽やかなクラフトビール",
                    description_en="Refreshing local craft beer from Izu"
                ),
                Menu(
                    store_id=store1.id, category="Drink", price=500, image_url=img_drink,
                    name_ko="아츠칸 (따뜻한 술)", name_jp="熱燗", name_en="Hot Sake",
                    description_ko="추운 날 몸을 녹여주는 따뜻한 사케",
                    description_jp="寒い日に染みる温かい日本酒",
                    description_en="Traditional hot rice wine"
                ),
                Menu(
                    store_id=store1.id, category="Drink", price=300, image_url=img_drink,
                    name_ko="우롱차", name_jp="ウーロン茶", name_en="Oolong Tea",
                    description_ko="깔끔한 맛의 우롱차",
                    description_jp="さっぱりとしたウーロン茶",
                    description_en="Refreshing Oolong tea"
                ),
                Menu(
                    store_id=store1.id, category="Drink", price=250, image_url=img_drink,
                    name_ko="라무네", name_jp="ラムネ", name_en="Ramune",
                    description_ko="구슬이 들어있는 일본 전통 사이다",
                    description_jp="ビー玉入りの懐かしいサイダー",
                    description_en="Japanese soda with a marble inside"
                )
            ]
            # Add menus to Store 1
            for menu in menus:
                menu.store_id = store1.id # Ensure ID is set (though initialized with store.id before, now store1)
                session.add(menu)
            # Sushi Menu (Cosmos Edition)
            menu1 = Menu(store_id=store1.id, name_ko="네뷸라 장어 롤", name_jp="Nebula Unagi Roll", name_en="Nebula Unagi Roll", description_ko="우주적 풍미의 장어 롤", description_jp="星屑の輝きを纏った特選うなぎロール", description_en="Fresh eel with cosmic plum glaze and gold leaf.", price=2800, category="Celestial Specials", image_url="/images/sushi1.png")
            menu2 = Menu(store_id=store1.id, name_ko="수퍼노바 돈코츠", name_jp="Supernova Tonkotsu", name_en="Supernova Tonkotsu", description_ko="블랙홀 갈릭 오일의 진한 풍미", description_jp="超新星の如き濃厚なコクの豚骨ラーメン", description_en="Rich pork broth with black garlic oil 'black holes'.", price=1800, category="Celestial Specials", image_url="/images/ramen1.png")
            menu3 = Menu(store_id=store1.id, name_ko="스타라이트 덴푸라", name_jp="Starlight Tempura", name_en="Starlight Tempura", description_ko="은하수 소금을 곁들인 바삭한 새우 튀김", description_jp="銀河の塩でいただく、極上の海老天ぷら", description_en="Crispy shrimp with silver sea salt flakes.", price=1500, category="Celestial Specials", image_url="/images/tempura1.png")
            session.add(menu1)
            session.add(menu2)
            session.add(menu3)
            
            # Create Menus for Store 2 (Cafe)
            cafe_menus = [
                Menu(
                    store_id=store2.id, category="Coffee", price=450, image_url="/images/coffee.png",
                    name_ko="아메리카노", name_jp="アメリカーノ", name_en="Americano",
                    description_ko="진한 에스프레소와 물의 조화", 
                    description_jp="エスプレッソと水のハーモニー",
                    description_en="Rich espresso with water"
                ),
                Menu(
                    store_id=store2.id, category="Dessert", price=600, image_url="/images/cake.png",
                    name_ko="치즈 케이크", name_jp="チーズケーキ", name_en="Cheese Cake",
                    description_ko="부드럽고 진한 치즈 케이크",
                    description_jp="濃厚でなめらかなチーズケーキ",
                    description_en="Smooth and rich cheese cake"
                )
            ]
            for menu in cafe_menus:
                session.add(menu)
            
            await session.commit()
            print("Initial data created with 20 items!")
        else:
            print("Store already exists.")

if __name__ == "__main__":
    asyncio.run(create_initial_data())
