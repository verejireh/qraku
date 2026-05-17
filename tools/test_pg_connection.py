"""Cloud SQL Auth Proxy 경유 PG 연결 테스트 (Step 2 검증용)."""
import sys

# 가장 먼저 — 줄이 출력되는지부터 확인.
print("=== Script START ===", flush=True)

import asyncio
import os
import traceback

print(f"Python: {sys.version.split()[0]}", flush=True)
print(f"CWD: {os.getcwd()}", flush=True)

try:
    import asyncpg
    print(f"asyncpg version: {asyncpg.__version__}", flush=True)
except Exception as e:
    print(f"[FAIL] asyncpg import 실패: {e}", flush=True)
    sys.exit(2)


async def test():
    pw = os.environ.get("QRAKU_PW")
    if not pw:
        print("[FAIL] QRAKU_PW 환경변수 미설정", flush=True)
        return 1

    port = int(os.environ.get("PG_PORT", "5433"))
    user = os.environ.get("PG_USER", "qraku")
    db = os.environ.get("PG_DB", "qraku")
    print(f"연결 파라미터: host=127.0.0.1 port={port} db={db} user={user} pw_len={len(pw)}",
          flush=True)

    try:
        conn = await asyncpg.connect(
            host="127.0.0.1",
            port=port,
            user=user,
            password=pw,
            database=db,
            timeout=10,
        )
        version = await conn.fetchval("SELECT version()")
        await conn.close()
        print(f"[OK] 연결 성공: {version[:70]}", flush=True)
        return 0
    except Exception as e:
        print(f"[FAIL] {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    try:
        rc = asyncio.run(test())
    except Exception as e:
        print(f"[FATAL] asyncio.run 자체 실패: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        rc = 3
    print(f"=== Script END (exit={rc}) ===", flush=True)
    sys.exit(rc)
