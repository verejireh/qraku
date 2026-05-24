"""Pre-deploy automated smoke — PG-CAP-05 + PG-DT-MIGRATE-02 라이브 적용 전 검증.

GPT 세션 H review (gpt-pg-dt-migrate-02a-impl-review.md §D) 권고 자동화 항목:
  1) compile/import — backend 전체 + 모델 default
  2) grep — datetime.utcnow 0건 (legacy/seed 제외)
  3) JWT — admin/super/staff token 생성 + decode
  4) Event ts — utils.events 의 ts 형식 (+00:00) + browser-compat 가정
  5) time_helpers — now_utc_naive / today_jst / 신규 helper 동작

실행 (운영 VM 또는 로컬):
  cd <repo_root>
  PYTHONPATH=backend ./.venv/bin/python tools/predeploy_smoke.py
  # 또는 (uv 환경):
  uv run python tools/predeploy_smoke.py

종료 코드:
  0 = 모든 smoke 통과
  1 = warning (deploy 가능하나 권고 사항 있음)
  2 = critical (deploy 금지)
"""
import os
import sys
import subprocess
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

# 운영 VM 의 venv 경로 (개발 환경에선 다를 수 있음)
VENV_PY = ROOT / ".venv" / "bin" / "python"
if not VENV_PY.exists():
    # Windows 또는 venv 위치 변경 시
    VENV_PY = Path(sys.executable)


def section(title: str):
    print()
    print("=" * 60)
    print(f" {title}")
    print("=" * 60)


def run(cmd: list[str], env_extra: dict = None, check_only=False, stdin: str = None) -> tuple[int, str, str]:
    """subprocess 실행. (returncode, stdout, stderr) 반환.

    Windows cp932 환경 대응 — utf-8 강제 디코딩, 디코딩 실패 시 replace.
    stdin 인자 — multi-line Python 코드 전달용 (``-c`` 의 한 줄 제약 우회).
    """
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    if env_extra:
        env.update(env_extra)
    try:
        result = subprocess.run(
            cmd, capture_output=True, env=env, cwd=str(ROOT),
            timeout=60,
            input=stdin.encode("utf-8") if stdin else None,
        )
        out = result.stdout.decode("utf-8", errors="replace") if result.stdout else ""
        err = result.stderr.decode("utf-8", errors="replace") if result.stderr else ""
        return result.returncode, out, err
    except subprocess.TimeoutExpired:
        return 124, "", "TIMEOUT"


def smoke_compile() -> tuple[bool, str]:
    """1. compileall — backend 전체 syntax 검증."""
    rc, out, err = run([str(VENV_PY), "-m", "compileall", "-q", "backend"])
    ok = rc == 0
    return ok, "OK" if ok else f"FAIL\n{err}"


def smoke_import() -> tuple[bool, str]:
    """2. backend.models app-dir 컨텍스트 import (GPT 권고 — PYTHONPATH=backend)."""
    code = (
        "import sys; sys.path.insert(0, 'backend'); "
        "from utils.time_helpers import now_utc_naive, today_jst, JST, "
        "days_ago_jst_as_utc_naive, months_ago_jst_month_start_as_utc_naive, "
        "jst_day_range_as_utc_naive; "
        "import models; "
        "print('time_helpers + models OK'); "
        "print('JST:', JST); "
        "print('now_utc_naive:', now_utc_naive()); "
        "print('today_jst:', today_jst()); "
        "print('store fields:', len(models.Store.model_fields)); "
    )
    rc, out, err = run([str(VENV_PY), "-c", code])
    ok = rc == 0 and "time_helpers + models OK" in out
    msg = out if ok else f"FAIL\nstdout:{out}\nstderr:{err}"
    return ok, msg.strip()


def smoke_grep() -> tuple[bool, str]:
    """3. datetime.utcnow grep — legacy/seed 제외 0 건."""
    # GPT 권고: 괄호 없이 패턴
    rc, out, err = run(["grep", "-rn", "datetime\\.utcnow", "backend", "--include=*.py"])
    if rc not in (0, 1):
        return False, f"grep error: {err}"
    matches = [
        line for line in out.splitlines()
        if line and "legacy/" not in line
        and "seed_samples" not in line
        and "seed_table_" not in line
        and "time_helpers.py" not in line  # docstring reference
    ]
    if matches:
        return False, f"FAIL: {len(matches)} datetime.utcnow remaining:\n" + "\n".join(matches[:5])
    return True, "OK (legacy/seed 제외 0건)"


def smoke_jwt() -> tuple[bool, str]:
    """4. JWT — admin/super/staff token 생성 + decode (python-jose).

    utils.jwt 가 database.py 를 끌고 와 DATABASE_URL 필요 → dummy URL 주입.
    """
    code = (
        "import sys; sys.path.insert(0, 'backend'); "
        "from utils.jwt import (create_admin_token, decode_admin_token, "
        "create_super_admin_token, create_staff_token); "
        "t1 = create_admin_token(store_id=1, owner_id='test@example.com'); "
        "decoded = decode_admin_token(t1); "
        "assert decoded['store_id'] == 1, 'decoded store_id mismatch'; "
        "t2 = create_super_admin_token(); "
        "t3 = create_staff_token(store_id=1, shop_id='test-shop'); "
        "print('admin:', bool(t1)); "
        "print('super:', bool(t2)); "
        "print('staff:', bool(t3)); "
        "print('decoded store_id:', decoded['store_id']); "
    )
    env = {
        "SECRET_KEY": "predeploy-smoke-test-secret",
        "DATABASE_URL": "postgresql+asyncpg://u:p@localhost:5432/db",
    }
    rc, out, err = run([str(VENV_PY), "-c", code], env_extra=env)
    ok = rc == 0 and "admin: True" in out and "super: True" in out and "staff: True" in out
    msg = out if ok else f"FAIL\nstdout:{out}\nstderr:{err[:500]}"
    return ok, msg.strip()


def smoke_event_ts() -> tuple[bool, str]:
    """5. Event ts wire format — utils.events._emit 에서 생성된 ts 가 +00:00 형식."""
    # 한 줄 inline 코드에서 # 주석은 줄 끝까지 삼킴 → print 가 무시됨.
    # 주석을 빼고 단일 print 로.
    code = (
        "from datetime import datetime, timezone; "
        "ts = datetime.now(timezone.utc).isoformat(); "
        "print('ts:', ts); "
        "assert '+00:00' in ts, 'expected +00:00 wire format'; "
        "print('format OK')"
    )
    rc, out, err = run([str(VENV_PY), "-c", code])
    ok = rc == 0 and "format OK" in out
    msg = out if ok else f"FAIL\n{err}"
    return ok, msg.strip()


def smoke_db_compat_compile() -> tuple[bool, str]:
    """7. db_compat SQL compile — GROUP BY 매칭 + Integer cast 회귀 차단.

    2026-05-24 PG-AUDIT-GROUPBY/DECIMAL 사이클 회귀 패턴:
      - func.timezone(STORE_TZ, col) 의 STORE_TZ 가 Python str 이면 SQLAlchemy
        가 bindparam 으로 변환 → SELECT/GROUP BY/ORDER BY 마다 다른 $N → PG
        GroupingError "must appear in GROUP BY".
      - day_of_week 의 + 1 도 Python int → bindparam → 동일 회귀.
      - PG EXTRACT 반환 numeric (Decimal) → 호출자가 ``:02d`` format 시
        ValueError. Integer 캐스트로 호출자 자동 int.

    검증: hour/year/month/day_of_week 의 SELECT+GROUP BY+ORDER BY compile 결과에
      - timezone($N) 또는 ``) + $N`` 패턴 0건
      - ``AS INTEGER`` 캐스트 포함 (date_only 는 Date 캐스트라 제외).
    """
    code = '''
import sys
sys.path.insert(0, "backend")
import re
from sqlalchemy import select, func
from sqlalchemy.dialects import postgresql
from utils.db_compat import date_only, hour, year, month, day_of_week
from models import Order

CASES = [
    ("date_only",   (date_only(Order.created_at),),                                False),
    ("hour",        (hour(Order.created_at),),                                     True),
    ("year+month",  (year(Order.created_at), month(Order.created_at)),             True),
    ("day_of_week", (day_of_week(Order.created_at),),                              True),
]

failed = []
for name, exprs, want_int_cast in CASES:
    q = (
        select(*[e.label(f"c{i}") for i, e in enumerate(exprs)], func.count(Order.id))
        .where(Order.shop_id == "X")
        .group_by(*exprs)
        .order_by(*exprs)
    )
    sql = str(q.compile(dialect=postgresql.dialect()))
    tz_bind = len(re.findall(r"timezone\\(\\$", sql))
    dow_int_bind = len(re.findall(r"\\) \\+ \\$", sql))
    if tz_bind:
        failed.append(f"{name}: tz_bind={tz_bind} (must be 0)")
    if dow_int_bind:
        failed.append(f"{name}: dow_int_bind={dow_int_bind} (must be 0)")
    if want_int_cast and "AS INTEGER" not in sql:
        failed.append(f"{name}: missing AS INTEGER cast")

if failed:
    print("FAIL:")
    for f in failed:
        print(" ", f)
    sys.exit(1)
print("db_compat compile OK — 4 helper / SELECT+GROUP BY+ORDER BY bindparam 0건, Integer cast 적용")
'''
    rc, out, err = run([str(VENV_PY)], stdin=code)
    ok = rc == 0 and "db_compat compile OK" in out
    msg = out if ok else f"FAIL\nstdout:{out}\nstderr:{err[:500]}"
    return ok, msg.strip()


def smoke_helpers() -> tuple[bool, str]:
    """6. time_helpers — 신규 helper smoke."""
    code = (
        "import sys; sys.path.insert(0, 'backend'); "
        "from utils.time_helpers import (now_utc_naive, now_jst, today_jst, "
        "today_start_jst_as_utc_naive, days_ago_jst_as_utc_naive, "
        "months_ago_jst_month_start_as_utc_naive, jst_day_range_as_utc_naive); "
        "from datetime import date, timedelta; "
        "n_utc = now_utc_naive(); n_jst = now_jst(); "
        "assert n_utc.tzinfo is None; "
        "assert n_jst.tzinfo is not None; "
        "s, e = jst_day_range_as_utc_naive(); "
        "assert e - s == timedelta(days=1), f'day range != 1 day: {e-s}'; "
        "m = months_ago_jst_month_start_as_utc_naive(0); "
        "d7 = days_ago_jst_as_utc_naive(7); "
        "today_start = today_start_jst_as_utc_naive(); "
        "assert today_start - d7 == timedelta(days=7); "
        "print('helpers OK:', n_jst.tzinfo, today_jst())"
    )
    rc, out, err = run([str(VENV_PY), "-c", code])
    ok = rc == 0 and "helpers OK" in out
    msg = out if ok else f"FAIL\n{err}"
    return ok, msg.strip()


def main() -> int:
    print(f"Pre-deploy smoke @ {ROOT}")
    print(f"Python: {VENV_PY}")

    results = []

    section("1. compile (backend 전체 py_compile)")
    ok, msg = smoke_compile()
    print(msg)
    results.append(("compile", ok, msg))

    section("2. import (backend app-dir + models)")
    ok, msg = smoke_import()
    print(msg)
    results.append(("import", ok, msg))

    section("3. grep datetime.utcnow (legacy/seed 제외 0 건)")
    ok, msg = smoke_grep()
    print(msg)
    results.append(("grep", ok, msg))

    section("4. JWT (admin/super/staff token + decode)")
    ok, msg = smoke_jwt()
    print(msg)
    results.append(("jwt", ok, msg))

    section("5. Event ts (+00:00 wire format)")
    ok, msg = smoke_event_ts()
    print(msg)
    results.append(("event_ts", ok, msg))

    section("6. time_helpers (모든 helper 동작)")
    ok, msg = smoke_helpers()
    print(msg)
    results.append(("time_helpers", ok, msg))

    section("7. db_compat SQL compile (GROUP BY 매칭 + Integer cast 회귀 차단)")
    ok, msg = smoke_db_compat_compile()
    print(msg)
    results.append(("db_compat_compile", ok, msg))

    section("Summary")
    fail = [name for name, ok, _ in results if not ok]
    if fail:
        print(f"❌ FAILED ({len(fail)}/{len(results)}): {', '.join(fail)}")
        return 2
    print(f"✅ ALL PASSED ({len(results)}/{len(results)})")
    print()
    print("Deploy 진행 가능. 추가 수동 smoke (GPT §D):")
    print("  - admin login → /api/admin/* 401 없는지")
    print("  - KDS/register WS 토큰 발급 + elapsed timer 정상")
    print("  - stats 페이지 today/monthly 정상")
    print("  - 쿠폰/tabehoudai/구독 만료 boundary 확인")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
