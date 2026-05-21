"""
데모용 샘플 데이터 리셋 스크립트
- 1234568: Tonton Katsu (돈카츠 전문점)
- 나머지 모두 삭제
"""
import asyncio, uuid
from sqlmodel import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine
from models import Store, Table, Menu, TableStatus, StoreCategory

# 남길 매장 ID
KEEP_STORE_IDS = [1234568]

# ──────────────────────────────────────────────────────────────
# 1234568: Tonton Katsu
# ──────────────────────────────────────────────────────────────
STORE_INFO = {
    "id": 1234568,
    "name": "Tonton Katsu",
    "slug": "test-store-1",
    "category": StoreCategory.RESTAURANT,
    "theme": "sakura",
}

MENUS = [
    # ── カテゴリ1: Signature Tonkatsu (메인 메뉴) ──────────────
    {"name_jp": "ロースカツ", "name_ko": "로스카츠 (등심)", "name_en": "Rosu-Katsu (Loin)", "name_zh": "里脊猪排",
     "price": 1650, "category": "Signature Tonkatsu",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuCBLiPH7xaEVsyqOF-M_p_QCVkQGSooz72Egzn35xtg-NcSWllir93guP_hJcdx8PdDATP8opljfl7zcF5MRFHVpGmmi7xh660M7sQZb6WldXi5-FJ127_i-lKhdS2EWlzJ7RniptYNJDpyLE3S9Fx5p2A_zGi8lhwVh6_103fbWRstYbnee-AyBOgbdiSpx6V9YKwyaTFcNl8AqjBSIuP0uWPNdcC5CTuN64n5rQ9tJpGxVAcoASpWS7fsb4NoM0WoBW6YaNG6f-_R",
     "description_jp": "当店自慢の豚ロースカツ。肉とサシの絶妙なバランスが特徴。一枚一枚、生パン粉で手付けし、黄金色にカリッと揚げました。自家製秘伝のソースでどうぞ。",
     "description_ko": "저희 가게의 시그니처 돈카츠. 고기와 마블링의 완벽한 균형이 특징입니다. 신선한 빵가루로 하나하나 수작업으로 입혀 황금빛으로 바삭하게 튀겨냈습니다. 자체 비법 소스와 함께 드세요.",
     "description_en": "Our signature pork loin cutlet, featuring a perfect balance of meat and marbling. Each piece is hand-breaded in fresh panko and deep-fried to a golden, crispy perfection. Served with our house-made secret sauce.",
     "description_zh": "招牌猪排，肉质与油花完美平衡。每片均以新鲜面包糠手工裹粉，炸至金黄酥脆。搭配自制秘传酱汁享用。"},
    {"name_jp": "ヒレカツ", "name_ko": "히레카츠 (안심)", "name_en": "Hire-Katsu (Tenderloin)", "name_zh": "嫩里脊猪排",
     "price": 1800, "category": "Signature Tonkatsu",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuCSq7VunZdwe9S5GK7S9ugd0x8WPEQ1G2JbTAyBWHtirzWNFioDFvOhghxo1zu8X2rjmrrCgGyKYDhbfYdpLdSEZlnaN_f4Tbfe7f3hY_NZEBwUUIS4zI8NGIYIC704Rt8VAIgRVSRTycXor0ASIGsUpBPVMmcea3Rn1yciRI9cMnKt9H1shbSE0_o1_zS3GNGcygHBr34yKcJGDimznEtvB2HNqJxS0t5U1Ij7YIux0GNMuy4qUw4T54w5z-qt4odvtICwHmkoMNQY",
     "description_jp": "最も脂肪が少なく柔らかいヒレ肉を使用。ジューシーで繊細な口当たりは、脂を控えたい方にぴったりの上品な一品です。",
     "description_ko": "가장 기름기가 적고 부드러운 안심 부위를 사용. 육즙이 풍부하고 섬세한 식감으로, 기름기 없이 깔끔한 맛을 선호하시는 분께 추천하는 고급 메뉴입니다.",
     "description_en": "The leanest, most tender cut of pork fillet. Juicy and delicate, this is the choice for those who prefer a refined, melting texture without any heavy fats.",
     "description_zh": "选用最精瘦、最嫩的猪里脊肉。多汁细腻，适合偏好清爽口感、不喜油腻的食客。"},
    {"name_jp": "チーズトンカツ", "name_ko": "치즈 돈카츠", "name_en": "Cheese Tonkatsu", "name_zh": "芝士猪排",
     "price": 1750, "category": "Signature Tonkatsu",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuAwRoALC00WZDGcgHaPx4uz62JkPTGy6SbH4wsRVzqQxCBQ1RIDsR-iewvzHRiQBLEHH2claOr-wAZ6vZU-kEVHHbz8zJPPRxshkPYSPhzLMj4830p-ztNhyY1pubPwx_EjlYmZpN_Dq30hlXnI9qA21ctyn-R_PgPUulEaRP8CwJxkTTtF5FaJSNhmAlHFj0hqiRT5UrxZlx3yOxlFLXbtlEjxVCPYPRDtj5L3v59DKCJ658yFeSgWvxprXaPAxZ9kL_654L0ObwIY",
     "description_jp": "クラシックを贅沢にアレンジ。薄切り豚ヒレ肉でプレミアムモッツァレラチーズを包み込みました。とろ〜りチーズが伸びる、SNS映え間違いなしの一品。",
     "description_ko": "클래식에 럭셔리한 변화를 더한 메뉴. 얇게 썬 안심에 프리미엄 모차렐라 치즈를 감싸 튀겨냈습니다. 쭉 늘어나는 치즈가 매력적인 인기 메뉴.",
     "description_en": "A decadent twist on the classic. Thinly sliced pork tenderloin wrapped around premium molten mozzarella cheese. A cheese pull that's made for your feed.",
     "description_zh": "经典猪排的华丽升级。薄切猪里脊包裹优质马苏里拉芝士，芝士拉丝令人惊叹，颜值与美味兼具。"},
    # ── カテゴリ2: Combo & Specials ──────────────────────────────
    {"name_jp": "トンカツカレー", "name_ko": "돈카츠 카레", "name_en": "Tonkatsu Curry", "name_zh": "猪排咖喱饭",
     "price": 1650, "category": "Combo & Specials",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuCZcMnJWFzmu3F9-9JtwU7u3KENVDMVB48sgpiRvP8pQ_Rux9xiwLzI-14ubjELSh5aAHQn05owVQjQwPMlClw1byssdCuxSq6o2W1KZwSWZ-461biaCnsRXaTFX7CLxfJ5KKtL5Qcw_BqBKrRBVlUMzcDq1AQgLyTUyXgHOi0P17YngnxJeQpR4uQacyg0RiWXzn3-DWsQtOQHRt9kkp5GAbixDEKcqNZOmK61Q9ychuKxDkfhRYaKVM54QrtWmRCozpPo66UsBkyb",
     "description_jp": "48時間煮込んだ当店自慢の濃厚カレーに、厚切りパン粉でサクサクに揚げた豚カツをのせ、炊きたてのプレミアム短粒米とともに。",
     "description_ko": "48시간 푹 끓인 당점 자랑의 진한 일본식 카레에, 두꺼운 빵가루로 바삭하게 튀긴 돈카츠를 얹어 갓 지은 프리미엄 쌀밥과 함께 제공합니다.",
     "description_en": "Our signature rich Japanese curry simmered for 48 hours, served with a thick, crispy panko-breaded pork cutlet and steamed premium short-grain rice.",
     "description_zh": "招牌浓郁日式咖喱慢炖48小时，搭配厚切酥脆面包糠猪排与优质短粒米饭。"},
    {"name_jp": "エビフライ", "name_ko": "에비후라이 (새우튀김)", "name_en": "Ebi-Fry (Fried Shrimp)", "name_zh": "炸大虾",
     "price": 1400, "category": "Combo & Specials",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuBWHtpzMFQQpFervX8zfSvP5xXPk9jXdbbv_fex53YDdstfagYUM1m4-IphlL1J0_4yfmDgGgpQ3U4wS10uXaEIZFvjYxDaKzvlONAsu5mYLYyZYze5fPD7bB0DJlwbwcyEF_0juIyXc36Dkwdfgtl88LG3vikJp2FS_Q0RRy6hgElJ36HSCCrvScTIxsjR9fjwy1sRCMD2K7yw-1aTo4jPiLBHmijMxP9IvVlk-TTXKXkjw36rWPlulwcpvgvco0gPoXHtHtU81jqM",
     "description_jp": "大ぶりのエビ3本を生パン粉で軽やかにサクッと揚げました。自家製タルタルソースと千切りキャベツ添え。",
     "description_ko": "대형 새우 3마리를 신선한 빵가루로 가볍고 바삭하게 튀겨냈습니다. 자체 제조 타르타르 소스와 채썬 양배추를 곁들여 제공합니다.",
     "description_en": "Three golden jumbo fried shrimp, breaded in fresh panko for a delicate crunch. Served with our house-made zesty tartar sauce and shredded cabbage.",
     "description_zh": "三只金黄大虾，以新鲜面包糠裹粉炸至酥脆。搭配自制爽口塔塔酱与切丝卷心菜。"},
    {"name_jp": "冷やしそばセット", "name_ko": "냉소바 세트", "name_en": "Cold Soba Set", "name_zh": "冷�的麦面套餐",
     "price": 1250, "category": "Combo & Specials",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuAMYc3VsG8Ldhm0Jf0WgcL4gbQXhSddKuJoyxEvzYENNLlsD85F2CZZgJIewYFrISWoycBFTxDxOS1iNek-YtF9kBDD8CCDkBNeilVl-eI0SGYXPEUIo4PvIYy5LC785eOlzbxrCgati2-5UY1SfeO5bn9gLa3gOga_3CTQd7PotGWDGWLo95ujhHYB8C5P6uj9VY0M6ENbKs4PmtrinNq1oq-VrJimaajDWvFAm2ibpZ-vAH3cudKRYXLoawJ0sZQHgRNTS0MpHVeY",
     "description_jp": "さっぱり爽やかな冷たいそばセット。冷やし出汁つゆ、すりおろしたてのわさび、刻みネギを添えて。",
     "description_ko": "깔끔하고 상쾌한 냉소바 세트. 차갑게 식힌 다시 간장 소스, 갓 간 와사비, 파를 곁들여 제공합니다.",
     "description_en": "The perfect refreshing meal: cold buckwheat noodles served with a chilled dashi dipping sauce, fresh grated wasabi, and spring onions.",
     "description_zh": "清爽冷荞麦面套餐，配冷�的高汤蘸汁、现磨山葵与葱花，消暑解腻。"},
    # ── カテゴリ3: Drinks & Sides ────────────────────────────────
    {"name_jp": "プレミアム生ビール", "name_ko": "프리미엄 생맥주", "name_en": "Premium Draft Beer", "name_zh": "精酿生啤",
     "price": 650, "category": "Drinks & Sides",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuDxf24LwTVG4VBE7GrIaJnzaPWxcYqNvnulWpIu2Ci0IwtNQVRCL3NL9zg_M_0pUi_-rBibyJvIR-CI61ndgP4voWckD2LPq6urmeAQzyPAT0G9CJFd1DzC0YaAgwm_Zb70rUdXlX_DYIhW_L3IkZGPgMT3UYznXcfPcQcgxfZzm9L2m3AmbhrwOkmN00izL7kxt1r42HW2fKxFOa9w_aCApkVa-YSn3Qxw4bLp_hsPIqELsaKHcVmxg0SW2YUVWtGvFIzWsfBdRwHj",
     "description_jp": "キンキンに冷えたグラスで提供する、滑らかな泡立ちの爽快な日本のラガービール。",
     "description_ko": "차갑게 냉각된 글라스에 제공되는, 부드러운 거품이 일품인 시원하고 청량한 일본 라거 맥주.",
     "description_en": "Crisp, ice-cold Japanese lager with a smooth, velvety head.",
     "description_zh": "冰镇玻璃杯盛装的清爽日式拉格啤酒，泡沫细腻顺滑。"},
    {"name_jp": "ラムネソーダ", "name_ko": "라무네 소다", "name_en": "Ramune Soda", "name_zh": "弹珠汽水",
     "price": 350, "category": "Drinks & Sides",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuAKjxnFJb1RImOEcATShXyEfF4N4x2zZrW9_0b425KeTLIeq_SvSBKq7qmRoklYrEspC3dhK2UEA0QKwRndwFf-q4PUeLGiBpW5rTZoKQRIBLenaqJrXIqeCWAHlTvaYJio2wrMkYzcK38PvusirON1MiyKwmKpY0o2Kp6c5fQArdrjV76KkvR8NbCKetUMKJcuIVM2XhI-eV5EZsYdyFvXqLOvy1RmKrXKa7WWy8Jga0DK9NeTTBkEdjsBYQvFat-0sZP7NqdH1Eex",
     "description_jp": "懐かしいビー玉入りソーダ。レモンライムの爽やかな炭酸。",
     "description_ko": "클래식 구슬 소다. 레몬라임의 상쾌한 탄산음료.",
     "description_en": "Traditional marble-pop soda with a nostalgic lemon-lime fizz.",
     "description_zh": "经典弹珠汽水，柠檬青柠风味，清爽怀旧。"},
    {"name_jp": "ゆずハイボール", "name_ko": "유즈 하이볼", "name_en": "Yuzu Highball", "name_zh": "柚子威士忌苏打",
     "price": 550, "category": "Drinks & Sides",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuAQHVQjI_cFk6e_WW772Sw9WQe9AjuPh9y8p0j9C7Bid8ZaB-xmFg8jqa6AfvK20Ai3JP7FjKPCssfVPHR2-F0t3OP8vIdSJcG8G8gitPi6g2MW1VwuBgIqV4v5FtA7zTgt_XaEKBhCM_ELiMNyAM9rFzZd1CRb-8yD4VkFzBQEq6d4ql53HSxWam6g0jIM2dQslOnAIyS-LHAnGbLCx6wtDKQa1AFlCIo6xrYwJ37Ub00GyI7HonBmPAF9E7LRW_31_Rh-qTlg14Tg",
     "description_jp": "ジャパニーズウイスキーにスパークリングソーダと香り高いゆずを合わせた一杯。",
     "description_ko": "일본 위스키에 탄산수와 향긋한 유자를 더한 상쾌한 하이볼.",
     "description_en": "Japanese whisky mixed with sparkling soda and aromatic yuzu citrus.",
     "description_zh": "日本威士忌搭配气泡水与清香柚子，清爽宜人。"},
    {"name_jp": "烏龍茶", "name_ko": "우롱차", "name_en": "Oolong Tea", "name_zh": "乌龙茶",
     "price": 300, "category": "Drinks & Sides",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuCfwfdG3ezqh1HS3ryYbCQ6d-Bag6hm_fuHQziqySHE9n3M3peB8nMvVNKVOp09sD8abYaTm_O9rnBoObltX90DDpmB6WRgKBbcSHMghvzYeMIflUh9067KBiZCVJU4YfvExKWlHur2CdPVKETFxuB4-oWYd6pHGa-j6SmxxkS-3EgHzz_7y_y--ejcbKb4eNAlZWze0yJ6A76nEmfb7QOnhVE88rhRQrPKlH_22jhx0vI7nTEq4YfhtZYOQ57inlaMGRsW_6Ivlsea",
     "description_jp": "プレミアム焙煎烏龍茶を冷やして提供。すっきり爽やかな口当たり。",
     "description_ko": "프리미엄 배전 우롱차를 차갑게 제공. 깔끔하고 상쾌한 맛.",
     "description_en": "Premium roasted oolong tea served chilled for a refreshing finish.",
     "description_zh": "优质焙火乌龙茶，冰镇供应，口感清爽回甘。"},
    {"name_jp": "カルピス", "name_ko": "칼피스", "name_en": "Calpico", "name_zh": "可尔必思",
     "price": 400, "category": "Drinks & Sides",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuDv49d1xqrf63TE5150Nxy49g7lnTBo1HD_uZcVcQqalouGFENrcV-bbPY_DWhLEg8Sh-6CP0orVAPC9yXqtyC1GdosZ34EK1uMpp9fPmbXfAMQ_0avJf-0dKhgsAe4YxLH7pY3QQQNq1sDAnsKcwGvApOrLUjry6kM1_SggXwEm1mKnzMAfnE6hozxOXcnxQsbqZ96a9qJ5fCStpggbPvGehNRBr7izZOURtAHzGs7HEHQGCs9Pnlx7xpwyXKem73_Xfhdq82Z3RU9",
     "description_jp": "爽やかなミルキーホワイトのシトラス風味ソフトドリンク。",
     "description_ko": "상쾌한 밀키 화이트 시트러스 풍미의 일본 소프트드링크.",
     "description_en": "Refreshing milky white citrus-flavored Japanese soft drink.",
     "description_zh": "清爽的乳白色柑橘风味日本软饮。"},
    {"name_jp": "日本酒（冷酒）", "name_ko": "사케 (냉주)", "name_en": "Japanese Sake", "name_zh": "日本清酒",
     "price": 800, "category": "Drinks & Sides",
     "image_url": "https://lh3.googleusercontent.com/aida-public/AB6AXuCp0rLgwtpoUVtdBsCAyo4ckGYLPwL4-KUtRtONlbmlMapLgX75rRsGa6DLmS9v_EZZpg1dr6WJ3w5gq0HD1877KVQF0_CV2Jg3m2Hm1x4-Nbm6f9-IlCw5hXfloN4yqteWrmVdyP24oIswr7nNCPogPPWPLsg0DFr-mXBTFTobQrecX1oZaXvJDHZOYhMvfHVj6qH9Ou9kQnZchpGcHAaSXGJQS-5-65ijyH4cK0PDXxPtm-qWf8PTURCRhT8RWhJ3JwwvehZnNsU8",
     "description_jp": "高品質の純米酒を伝統的な徳利とお猪口セットで冷やして提供。",
     "description_ko": "고급 준마이 사케를 전통 도쿠리와 오초코 세트로 차갑게 제공.",
     "description_en": "High-quality junmai sake served chilled in a traditional ceramic set.",
     "description_zh": "优质纯米清酒，以传统陶瓷壶杯套装冰镇供应。"},
]

async def run():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as s:
        # ── 1. 불필요한 매장 삭제 ──────────────────────────────────────
        all_stores = (await s.execute(select(Store))).scalars().all()
        delete_ids = [st.id for st in all_stores if st.id not in KEEP_STORE_IDS]
        print(f"삭제할 매장 IDs: {delete_ids}")
        for sid in delete_ids:
            await s.execute(text("DELETE FROM menu WHERE store_id = :sid"), {"sid": sid})
            await s.execute(text('DELETE FROM "table" WHERE store_id = :sid'), {"sid": sid})
            await s.execute(text("DELETE FROM store WHERE id = :sid"), {"sid": sid})
            print(f"  ✅ 매장 {sid} 삭제 완료")
        await s.commit()

        # ── 2. Tonton Katsu (1234568) 데이터 초기화 ────────────────
        sid = STORE_INFO["id"]
        await s.execute(text("DELETE FROM menu WHERE store_id = :sid"), {"sid": sid})
        await s.execute(text('DELETE FROM "table" WHERE store_id = :sid'), {"sid": sid})
        print(f"  🗑️  매장 {sid} 기존 메뉴·테이블 초기화")
        await s.commit()

        # ── 3. 매장 정보 업데이트 ─────────────────────────────────────
        store = await s.get(Store, sid)
        store.name = STORE_INFO["name"]
        store.slug = STORE_INFO["slug"]
        store.category = STORE_INFO["category"]
        s.add(store)
        await s.commit()
        print(f"\n✅ 매장 정보 업데이트: {store.name}")

        # 테이블 10개
        for i in range(1, 11):
            s.add(Table(store_id=sid, table_number=str(i), qr_token=str(uuid.uuid4()), status=TableStatus.READY))
        await s.commit()
        print("✅ 테이블 10개 생성")

        # 메뉴
        for idx, m in enumerate(MENUS):
            s.add(Menu(
                store_id=sid,
                name_jp=m["name_jp"], name_ko=m["name_ko"], name_en=m["name_en"], name_zh=m.get("name_zh"),
                price=m["price"], category=m["category"],
                image_url=m.get("image_url"),
                description_jp=m.get("description_jp"),
                description_ko=m.get("description_ko"),
                description_en=m.get("description_en"),
                description_zh=m.get("description_zh"),
                is_active=True, is_available=True, sort_order=idx
            ))
        await s.commit()
        print(f"✅ 메뉴 {len(MENUS)}개 생성")

        print("\n🌸 리셋 및 시딩 완료!")
        print(f"  Tonton Katsu → http://35.213.6.149:8003/{STORE_INFO['slug']}/admin")

asyncio.run(run())

