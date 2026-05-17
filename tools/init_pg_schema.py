"""DBM-08 — PG 빈 인스턴스에 schema 생성 + migration_sqls 실행 검증.

backend 전체 부팅(Redis 등) 없이, database.py:init_db() 만 직접 호출.
실행 후 PG 에 생성된 테이블 목록 + ALTER 결과를 출력.

사용 (Cloud Shell 에서):
    cd ~/qraku
    export PG_HOST=127.0.0.1
    export PG_PORT=5432
    export PG_USER=ilhae
    export PG_PASSWORD='실제비번-그대로-URL인코딩-불필요'
    export PG_DB=qraku
    uv run python -u tools/init_pg_schema.py
"""
import asyncio
import os
import sys
import urllib.parse
from pathlib import Path

print("=== Script START ===", flush=True)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))


def build_database_url():
    """원시 비번을 URL-encode 해서 DATABASE_URL 생성."""
    host = os.environ.get("PG_HOST", "127.0.0.1")
    port = os.environ.get("PG_PORT", "5432")
    user = os.environ.get("PG_USER", "qraku")
    pw_raw = os.environ.get("PG_PASSWORD", "")
    db = os.environ.get("PG_DB", "qraku")
    if not pw_raw:
        print("[FAIL] PG_PASSWORD 환경변수 필요", flush=True)
        sys.exit(1)
    pw_enc = urllib.parse.quote(pw_raw, safe="")
    url = f"postgresql+asyncpg://{user}:{pw_enc}@{host}:{port}/{db}"
    # backend/database.py 가 import 시점에 읽음
    os.environ["DATABASE_URL"] = url
    print(f"대상 DB: {host}:{port}/{db} (user={user}, pw 길이={len(pw_raw)})", flush=True)
    return url


async def main():
    build_database_url()

    print("\n[1/3] backend.database.init_db() 호출 — metadata.create_all + migration_sqls", flush=True)
    from database import init_db, engine
    await init_db()
    print("[1/3] init_db 완료", flush=True)

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

    print("\n[3/3] 핵심 컬럼 존재 확인", flush=True)
    checks = [
        ("order", "guest_uuid"),
        ("order", "order_type"),
        ("order", "idempotency_key"),
        ("orderitem", "is_tabehoudai"),
        ("store", "stamp_active"),
        ("menu", "options"),
        ("menu", "is_takeout_available"),
        ("table", "guest_count"),
        ("staffmember", "clock_in_at"),
        ("eventlog", "action"),
    ]
    async with engine.begin() as conn:
        for tbl, col in checks:
            sql = (
                "SELECT 1 FROM information_schema.columns "
                f"WHERE table_schema='public' AND table_name='{tbl}' "
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
