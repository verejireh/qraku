"""DBM-08 — PG 빈 인스턴스에 schema 생성 + migration_sqls 실행 검증.

backend 전체 부팅(Redis 등) 없이, database.py:init_db() 만 직접 호출.
실행 후 PG 에 생성된 테이블 목록 + ALTER 결과를 출력.

사용 (Cloud Shell 에서):
    cd ~/orderservice
    export DATABASE_URL='postgresql+asyncpg://ilhae:비번@127.0.0.1:5432/qraku'
    uv run python -u tools/init_pg_schema.py
"""
import asyncio
import os
import sys
from pathlib import Path

print("=== Script START ===", flush=True)

# backend 모듈을 import 할 수 있도록 sys.path 보강
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))


async def main():
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("[FAIL] DATABASE_URL 환경변수 필요", flush=True)
        return 1
    if "postgresql" not in url:
        print(f"[FAIL] PG URL 만 허용 (현재: {url[:30]}...)", flush=True)
        return 1
    print(f"대상 DB: {url.split('@')[-1]}", flush=True)

    # init_db 실행
    print("\n[1/3] backend.database.init_db() 호출 — metadata.create_all + migration_sqls", flush=True)
    from database import init_db, engine
    await init_db()
    print("[1/3] init_db 완료", flush=True)

    # 테이블 목록 조회
    print("\n[2/3] public 스키마 테이블 목록", flush=True)
    from sqlalchemy import text
    async with engine.begin() as conn:
        rows = await conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
        ))
        tables = [r[0] for r in rows.all()]
    print(f"  총 {len(tables)} 개 테이블 생성됨:", flush=True)
    for t in tables:
        print(f"    - {t}", flush=True)

    # 핵심 컬럼 sample 검증
    print("\n[3/3] 핵심 컬럼 존재 확인", flush=True)
    checks = [
        ('"order"', "guest_uuid"),
        ('"order"', "order_type"),
        ('"order"', "idempotency_key"),
        ("orderitem", "is_tabehoudai"),
        ("store", "stamp_active"),
        ("menu", "options"),
        ("menu", "is_takeout_available"),
        ('"table"', "guest_count"),
        ("staffmember", "clock_in_at"),
        ("eventlog", "action"),
    ]
    async with engine.begin() as conn:
        for tbl, col in checks:
            # information_schema 는 인용 없이 lowercase 식별자로 조회
            tbl_unquoted = tbl.replace('"', '')
            sql = (
                "SELECT 1 FROM information_schema.columns "
                f"WHERE table_schema='public' AND table_name='{tbl_unquoted}' "
                f"AND column_name='{col}'"
            )
            result = await conn.execute(text(sql))
            exists = result.scalar() is not None
            marker = "[OK]  " if exists else "[FAIL]"
            print(f"  {marker} {tbl}.{col}", flush=True)

    await engine.dispose()
    print("\n[OK] DBM-08 schema 검증 완료", flush=True)
    return 0


if __name__ == "__main__":
    try:
        rc = asyncio.run(main())
    except Exception as e:
        import traceback
        print(f"\n[FATAL] {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        rc = 1
    print(f"\n=== Script END (exit={rc}) ===", flush=True)
    sys.exit(rc)
