"""
PostgreSQL connection usage 측정 도구.

목적: 매주 1회 peak hour (JST 13:00 이후) 실행해서 connection 예산 사용량 모니터링.
연속 측정 결과를 운영자가 추적해 worker 증설 / pool 조정 / max_connections 상향
의사결정 근거로 활용.

실행:
    PYTHONPATH=. ./.venv/bin/python tools/check_pg_connections.py

    또는 JSON 출력:
    PYTHONPATH=. ./.venv/bin/python tools/check_pg_connections.py --json

P1 #9 capacity 모델 (tasks/p1-capacity-model-analysis.md) 의 일부.
"""
import argparse
import json
import os
import sys
from datetime import datetime

# 프로젝트 루트를 sys.path 에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))


def _database_url():
    if os.getenv("DB_USER") and os.getenv("DB_PASS"):
        drivername = os.getenv("DB_DRIVER", "postgresql+psycopg2")
        if drivername == "postgresql+asyncpg":
            drivername = "postgresql+psycopg2"
        return URL.create(
            drivername=drivername,
            username=os.getenv("DB_USER"),
            password=os.getenv("DB_PASS"),
            host=os.getenv("DB_HOST", "127.0.0.1"),
            port=int(os.getenv("DB_PORT", "5432")),
            database=os.getenv("DB_NAME", "qraku"),
        )
    raise RuntimeError("DB_USER/DB_PASS 환경변수가 필요합니다.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="JSON 출력")
    parser.add_argument("--warn-pct", type=float, default=70.0,
                        help="총 connection 사용률 경고 임계 (기본 70%%)")
    args = parser.parse_args()

    engine = create_engine(_database_url(), pool_pre_ping=True)

    with engine.connect() as conn:
        max_conn = conn.execute(text("SHOW max_connections")).scalar()
        max_conn = int(max_conn)

        rows = conn.execute(text("""
            SELECT state, count(*) AS n
            FROM pg_stat_activity
            WHERE datname = current_database()
            GROUP BY state
        """)).all()
        state_counts = {row.state or "(unknown)": row.n for row in rows}

        # 가장 오래 점유 중인 connection 5개 (wait_event 포함 — GPT capacity review §추가 지적)
        long_rows = conn.execute(text("""
            SELECT pid, usename, application_name, state,
                   wait_event_type, wait_event,
                   EXTRACT(EPOCH FROM (now() - state_change))::int AS state_secs,
                   EXTRACT(EPOCH FROM (now() - query_start))::int AS query_secs,
                   LEFT(query, 100) AS query_preview
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid != pg_backend_pid()
            ORDER BY state_change ASC
            LIMIT 5
        """)).all()

        long_holders = [
            {
                "pid": r.pid,
                "user": r.usename,
                "app": r.application_name,
                "state": r.state,
                "wait_event_type": r.wait_event_type,
                "wait_event": r.wait_event,
                "state_secs": r.state_secs,
                "query_secs": r.query_secs,
                "preview": r.query_preview,
            }
            for r in long_rows
        ]

        # idle in transaction (orphan transaction 감지)
        orphan_count = conn.execute(text("""
            SELECT count(*)
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND state = 'idle in transaction'
              AND now() - state_change > interval '30 seconds'
        """)).scalar() or 0

    total = sum(state_counts.values())
    pct = (total / max_conn) * 100 if max_conn else 0

    result = {
        "measured_at": datetime.now().isoformat(),
        "database": os.getenv("DB_NAME", "qraku"),
        "max_connections": max_conn,
        "total_used": total,
        "usage_pct": round(pct, 1),
        "by_state": state_counts,
        "orphan_idle_in_tx_count": orphan_count,
        "long_holders": long_holders,
    }

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"PG Connection Usage @ {result['measured_at']}")
        print(f"  database         : {result['database']}")
        print(f"  max_connections  : {max_conn}")
        print(f"  total used       : {total}  ({pct:.1f}%)")
        print(f"  by state         : {state_counts}")
        if orphan_count:
            print(f"  ⚠️ orphan idle-in-tx (>30s) : {orphan_count} (transaction leak 의심)")
        if long_holders:
            print(f"  oldest 5 holders:")
            for h in long_holders:
                wait_str = f" wait={h['wait_event_type']}/{h['wait_event']}" if h['wait_event'] else ""
                print(f"    pid={h['pid']} user={h['user']} app={h['app']} "
                      f"state={h['state']}{wait_str} for {h['state_secs']}s — {h['preview']}")

    # 경고/에러 종료 코드
    if pct >= 90:
        print(f"\n🔴 CRITICAL: usage {pct:.1f}% — pool 증설 / max_connections 상향 즉시 검토",
              file=sys.stderr)
        return 2
    elif pct >= args.warn_pct:
        print(f"\n⚠️ WARNING: usage {pct:.1f}% (threshold {args.warn_pct}%)",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(3)
