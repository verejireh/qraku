"""DBM-09 — MySQL → PostgreSQL 데이터 마이그레이션 (pgloader 대체).

배경:
    pgloader 3.6.7 (Ubuntu apt) 의 QMYND 라이브러리가 MySQL 8 의 default
    auth plugin (caching_sha2_password) 핸드셰이크를 지원 안 함.
    → 직접 SQLAlchemy + PyMySQL/psycopg2 로 데이터만 이전.

전제:
    - PG target 에 이미 schema 가 생성돼있어야 함 (DBM-08 의 init_pg_schema.py 사용).
    - migration_sqls 의 ALTER 도 적용된 상태.
    - 본 스크립트는 DATA 만 복사 (DDL X).

타입 매핑은 SQLModel/SQLAlchemy 가 자동:
    - DATETIME ↔ TIMESTAMP
    - TINYINT(1) ↔ BOOLEAN
    - JSON ↔ TEXT (PG 쪽 컬럼이 TEXT 면 자동 변환)
    - ENUM(...) ↔ VARCHAR (PG 쪽 컬럼이 VARCHAR 면 자동)

사용:
    SOURCE_URL='mysql+pymysql://user:pass@host:3306/kiospad' \\
    TARGET_URL='postgresql+psycopg2://user:pass@host:5432/qraku' \\
    uv run python -u tools/pg_data_migrator.py [--dry-run] [--tables t1,t2]

DBM-12 컷오버 시에도 동일 스크립트 재사용.
"""
import argparse
import json
import os
import sys
from pathlib import Path
import time

print("=== pg_data_migrator START ===", flush=True)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import create_engine, MetaData, Table, inspect, text
from sqlalchemy.exc import SQLAlchemyError


# FK 의존 순서 — SQLAlchemy 가 자동으로 sorted_tables 제공하지만,
# circular FK 가 있으면 수동 순서 필요. 현재 schema 엔 circular 없음.

EXCLUDE_TABLES = {"alembic_version"}  # PG 측은 alembic 가 자체 관리


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source-url", default=os.environ.get("SOURCE_URL", ""))
    p.add_argument("--target-url", default=os.environ.get("TARGET_URL", ""))
    p.add_argument("--tables", help="comma-separated whitelist (e.g. 'menu,order')")
    p.add_argument("--dry-run", action="store_true", help="count + print plan, no insert")
    p.add_argument("--no-truncate", action="store_true", help="skip TRUNCATE on target (append mode)")
    p.add_argument("--batch", type=int, default=1000)
    return p.parse_args()


def main():
    args = parse_args()
    if not args.source_url or not args.target_url:
        print("[FAIL] SOURCE_URL / TARGET_URL 필요 (env 또는 --source-url/--target-url)", flush=True)
        return 1

    print(f"SOURCE: {args.source_url.split('@')[-1]}", flush=True)
    print(f"TARGET: {args.target_url.split('@')[-1]}", flush=True)

    src = create_engine(args.source_url, future=True, pool_pre_ping=True)
    tgt = create_engine(args.target_url, future=True, pool_pre_ping=True)

    # MySQL 스키마 reflect
    src_meta = MetaData()
    print("\n[1/4] MySQL 스키마 reflect ...", flush=True)
    src_meta.reflect(bind=src)
    print(f"  total {len(src_meta.tables)} tables in source", flush=True)

    # PG 측 inspector — 어떤 테이블이 PG 에 있는지 확인
    tgt_insp = inspect(tgt)
    pg_tables = set(tgt_insp.get_table_names(schema="public"))
    print(f"  total {len(pg_tables)} tables in target (public)", flush=True)

    # 처리 대상 결정
    table_filter = set(args.tables.split(",")) if args.tables else None
    sorted_tables = []
    for t in src_meta.sorted_tables:
        if t.name in EXCLUDE_TABLES:
            continue
        if table_filter and t.name not in table_filter:
            continue
        if t.name not in pg_tables:
            print(f"  [SKIP] {t.name} — PG 에 테이블 없음", flush=True)
            continue
        sorted_tables.append(t)

    print(f"\n[2/4] 처리 대상 {len(sorted_tables)} 개 (FK 순서 정렬됨):", flush=True)
    for t in sorted_tables:
        with src.connect() as c:
            n = c.execute(text(f"SELECT COUNT(*) FROM `{t.name}`")).scalar()
        print(f"  - {t.name}: {n:,} 행", flush=True)

    if args.dry_run:
        print("\n[DRY-RUN] 종료 — 실제 복사 X", flush=True)
        return 0

    # 복사 실행 — 역순 truncate, 정순 insert
    print(f"\n[3/4] 복사 시작 (batch={args.batch})", flush=True)
    if not args.no_truncate:
        print("  TRUNCATE (FK 역순) ...", flush=True)
        with tgt.begin() as conn:
            for t in reversed(sorted_tables):
                conn.execute(text(f'TRUNCATE TABLE "{t.name}" RESTART IDENTITY CASCADE'))
        print("  TRUNCATE 완료", flush=True)

    total_copied = 0
    t_start = time.time()
    for tbl in sorted_tables:
        n_copied = 0
        t0 = time.time()
        with src.connect() as src_conn:
            src_conn = src_conn.execution_options(stream_results=True)
            result = src_conn.execute(tbl.select())
            cols = list(result.keys())
            tgt_table = Table(tbl.name, MetaData(), autoload_with=tgt, schema="public")

            with tgt.begin() as tgt_conn:
                batch = []
                for row in result:
                    rowd = dict(zip(cols, row))
                    # PyMySQL 이 MySQL JSON 컬럼을 dict/list 로 자동 파싱.
                    # PG 측 대응 컬럼이 TEXT (DBM-05 후) 라 psycopg2 가 거절 → JSON 문자열로 직렬화.
                    for k, v in rowd.items():
                        if isinstance(v, (dict, list)):
                            rowd[k] = json.dumps(v, ensure_ascii=False)
                    batch.append(rowd)
                    if len(batch) >= args.batch:
                        if batch:
                            tgt_conn.execute(tgt_table.insert(), batch)
                            n_copied += len(batch)
                        batch = []
                if batch:
                    tgt_conn.execute(tgt_table.insert(), batch)
                    n_copied += len(batch)

        dt = time.time() - t0
        rate = n_copied / dt if dt > 0 else 0
        print(f"  ✅ {tbl.name}: {n_copied:,} 행 / {dt:.2f}s ({rate:,.0f} 행/s)", flush=True)
        total_copied += n_copied

    elapsed = time.time() - t_start
    print(f"\n[3/4] 총 {total_copied:,} 행 / {elapsed:.2f}s", flush=True)

    # 시퀀스 재설정
    print("\n[4/4] PG 시퀀스 재설정 (id 컬럼 sequence ← MAX(id)+1)", flush=True)
    seq_sql = """
    DO $body$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT c.relname AS seq, t.relname AS tbl, a.attname AS col
        FROM pg_class c
        JOIN pg_depend d ON d.objid = c.oid
        JOIN pg_class t ON d.refobjid = t.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
        WHERE c.relkind = 'S' AND t.relkind = 'r'
      LOOP
        EXECUTE format(
          'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)',
          r.seq, r.col, r.tbl
        );
      END LOOP;
    END
    $body$;
    """
    with tgt.begin() as conn:
        conn.execute(text(seq_sql))
    print("  시퀀스 재설정 완료", flush=True)

    # ANALYZE
    print("\n[4/4] ANALYZE", flush=True)
    with tgt.begin() as conn:
        conn.execute(text("ANALYZE"))
    print("  ANALYZE 완료", flush=True)

    print("\n[OK] DBM-09 데이터 마이그레이션 완료", flush=True)
    return 0


if __name__ == "__main__":
    try:
        rc = main()
    except Exception as e:
        import traceback
        print(f"\n[FATAL] {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        rc = 1
    print(f"\n=== pg_data_migrator END (exit={rc}) ===", flush=True)
    sys.exit(rc)
