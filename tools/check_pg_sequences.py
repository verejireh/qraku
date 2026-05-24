"""
PostgreSQL sequence health check.

실행:
    uv run python tools/check_pg_sequences.py

DATABASE_URL 또는 DB_USER/DB_PASS/DB_HOST/DB_PORT/DB_NAME 환경변수를 사용한다.
각 id sequence 의 next value 가 MAX(id)+1 이상인지 확인한다.
"""
import os
import sys

# 프로젝트 루트를 sys.path 에 추가 — `python tools/check_pg_sequences.py` 직접 실행 시
# `from backend.utils.db ...` import 가 작동하도록.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL

from backend.utils.db import to_sync_url


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

    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 또는 DB_USER/DB_PASS 환경변수가 필요합니다.")
    return to_sync_url(url)


def _quote_qualified_name(name: str) -> str:
    return ".".join(f'"{part.replace(chr(34), chr(34) + chr(34))}"' for part in name.split("."))


def main() -> int:
    engine = create_engine(_database_url(), pool_pre_ping=True)
    failures = 0

    with engine.connect() as conn:
        inspector = inspect(conn)
        tables = inspector.get_table_names()
        for table in sorted(tables):
            columns = {col["name"] for col in inspector.get_columns(table)}
            if "id" not in columns:
                continue

            seq_name = conn.execute(
                text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
                {"table_name": table},
            ).scalar()
            if not seq_name:
                continue

            table_ident = '"' + table.replace('"', '""') + '"'
            max_id = conn.execute(text(f"SELECT COALESCE(MAX(id), 0) FROM {table_ident}")).scalar()
            seq_ident = _quote_qualified_name(seq_name)
            seq_state = conn.execute(text(f"SELECT last_value, is_called FROM {seq_ident}")).mappings().one()
            next_value = int(seq_state["last_value"]) + 1 if seq_state["is_called"] else int(seq_state["last_value"])

            expected = int(max_id) + 1
            if int(next_value) < expected:
                failures += 1
                print(f"FAIL {table}: sequence next={next_value}, expected>={expected} ({seq_name})")
            else:
                print(f"OK   {table}: sequence next={next_value}, max_id={max_id} ({seq_name})")

    return 1 if failures else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2)
