"""
store 1234567에 테이블 10개와 샘플 메뉴를 시드하는 스크립트
"""
import asyncio
import uuid
from sqlmodel import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine
from models import Store, Table, Menu, TableStatus

STORE_ID = 1234567
NUM_TABLES = 10

SAMPLE_MENUS = [
    {"name_jp": "醤油ラーメン", "name_ko": "간장 라멘", "name_en": "Soy Sauce Ramen", "price": 980, "category": "メインメニュー"},
    {"name_jp": "塩ラーメン", "name_ko": "소금 라멘", "name_en": "Salt Ramen", "price": 920, "category": "メインメニュー"},
    {"name_jp": "から揚げ", "name_ko": "닭튀김", "name_en": "Fried Chicken", "price": 680, "category": "サブメニュー"},
    {"name_jp": "餃子", "name_ko": "만두", "name_en": "Gyoza", "price": 520, "category": "サブメニュー"},
    {"name_jp": "生ビール", "name_ko": "생맥주", "name_en": "Draft Beer", "price": 600, "category": "ドリンク"},
    {"name_jp": "コーラ", "name_ko": "콜라", "name_en": "Cola", "price": 300, "category": "ドリンク"},
]

async def run_seed():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        # 1. 매장 확인
        store = await session.get(Store, STORE_ID)
        if not store:
            print(f"❌ Store ID {STORE_ID} 를 찾을 수 없습니다.")
            return
        print(f"✅ 매장 확인: {store.name} (ID: {store.id})")

        # 2. 테이블 생성
        result = await session.execute(
            select(Table).where(Table.store_id == STORE_ID)
        )
        existing_tables = result.scalars().all()
        if existing_tables:
            print(f"ℹ️  테이블이 이미 {len(existing_tables)}개 존재합니다. 스킵.")
        else:
            for i in range(1, NUM_TABLES + 1):
                table = Table(
                    store_id=STORE_ID,
                    table_number=str(i),
                    qr_token=str(uuid.uuid4()),
                    status=TableStatus.READY,
                )
                session.add(table)
            await session.commit()
            print(f"✅ 테이블 {NUM_TABLES}개 생성 완료")

        # 3. 메뉴 생성
        result = await session.execute(
            select(Menu).where(Menu.store_id == STORE_ID)
        )
        existing_menus = result.scalars().all()
        if existing_menus:
            print(f"ℹ️  메뉴가 이미 {len(existing_menus)}개 존재합니다. 스킵.")
        else:
            for m in SAMPLE_MENUS:
                menu = Menu(
                    store_id=STORE_ID,
                    name_jp=m["name_jp"],
                    name_ko=m["name_ko"],
                    name_en=m["name_en"],
                    price=m["price"],
                    category=m["category"],
                    is_active=True,
                    is_available=True,
                )
                session.add(menu)
            await session.commit()
            print(f"✅ 샘플 메뉴 {len(SAMPLE_MENUS)}개 생성 완료")

        print("\n🌸 시딩 완료!")

if __name__ == "__main__":
    asyncio.run(run_seed())
