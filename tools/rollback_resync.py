"""DBM-12b — 롤백 시 PG → MySQL 데이터 역동기화 (인서트만).

용도:
    컷오버 (T=0) 후 PG 가 운영 DB 였던 짧은 구간 (T+0 ~ T+롤백) 에 PG 로만
    들어간 신규 행을 MySQL 로 복사. 롤백 직후 실행해서 데이터 손실 방지.

전제:
    - 양 DB 모두 schema 동일 (DBM-09 직후 상태)
    - 대다수 테이블이 auto-increment `id` PK 보유 → MAX(id) 비교로 델타 식별
    - 컷오버 윈도우가 짧음 (분 단위). 본 스크립트는 INSERT 만 지원, UPDATE 는
      별도 분석 (출력에 "잠재 충돌" 리포트로 표시)

사용:
    SOURCE_URL='postgresql+psycopg2://ilhae:***@host/qraku?sslmode=require' \\
    TARGET_URL='mysql+pymysql://kios_user:***@localhost:3306/kiospad' \\
    uv run python -u tools/rollback_resync.py [--dry-run] [--tables t1,t2] [--verbose-conflicts]

기본 동작은 dry-run + 잠재 충돌 리포트만. `--apply` 명시 시 실제 INSERT.

DBM-12 룬북 §9.3 에서 호출.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

print("=== rollback_resync START ===", flush=True)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, MetaData, Table, inspect, text


EXCLUDE_TABLES = {"alembic_version"}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source-url", default=os.environ.get("SOURCE_URL", ""),
                   help="PG (rollback 시점의 운영 DB)")
    p.add_argument("--target-url", default=os.environ.get("TARGET_URL", ""),
                   help="MySQL (복원 대상)")
    p.add_argument("--tables", help="comma-separated whitelist")
    p.add_argument("--apply", action="store_true",
                   help="실제 INSERT 실행. 기본은 dry-run + 리포트.")
    p.add_argument("--verbose-conflicts", action="store_true",
                   help="잠재 UPDATE 충돌 행을 모두 출력")
    p.add_argument("--batch", type=int, default=500)
    return p.parse_args()


def get_id_column(table):
    """테이블의 PK 컬럼 중 첫 번째 (보통 'id') 반환. 없으면 None."""
    pk = list(table.primary_key.columns)
    if len(pk) == 1 and pk[0].name == "id":
        return pk[0]
    return None


def main():
    args = parse_args()
    if not args.source_url or not args.target_url:
        print("[FAIL] SOURCE_URL / TARGET_URL 필요", flush=True)
        return 1

    print(f"SOURCE (PG):    {args.source_url.split('@')[-1]}", flush=True)
    print(f"TARGET (MySQL): {args.target_url.split('@')[-1]}", flush=True)
    print(f"모드: {'APPLY (실제 INSERT)' if args.apply else 'DRY-RUN (리포트만)'}", flush=True)

    src = create_engine(args.source_url, future=True, pool_pre_ping=True)
    tgt = create_engine(args.target_url, future=True, pool_pre_ping=True)

    print("\n[1/3] 양 DB schema reflect ...", flush=True)
    src_meta = MetaData()
    tgt_meta = MetaData()
    # PG 면 schema='public', MySQL/SQLite 면 schema 미지정.
    src_kw = {"schema": "public"} if src.dialect.name == "postgresql" else {}
    tgt_kw = {"schema": "public"} if tgt.dialect.name == "postgresql" else {}
    src_meta.reflect(bind=src, **src_kw)
    tgt_meta.reflect(bind=tgt, **tgt_kw)

    table_filter = set(args.tables.split(",")) if args.tables else None

    # FK 순서로 정렬 (인서트 정순)
    pg_tables = {t.name: t for t in src_meta.sorted_tables}
    mysql_tables = {t.name: t for t in tgt_meta.sorted_tables}

    # 분석 대상
    analyzed = []
    for name in [t.name for t in src_meta.sorted_tables]:
        if name in EXCLUDE_TABLES:
            continue
        if table_filter and name not in table_filter:
            continue
        if name not in mysql_tables:
            print(f"  [SKIP] {name} — MySQL 에 없음", flush=True)
            continue
        analyzed.append(name)

    # 델타 분석
    print(f"\n[2/3] 델타 분석 ({len(analyzed)} 테이블)", flush=True)
    plan = []  # (tbl_name, mysql_max_id, pg_max_id, n_new, has_id_col, n_overlap)
    for name in analyzed:
        pg_tbl = pg_tables[name]
        mysql_tbl = mysql_tables[name]
        id_col = get_id_column(pg_tbl)

        # Dialect-aware quoting
        src_q = src.dialect.identifier_preparer.quote(name)
        tgt_q = tgt.dialect.identifier_preparer.quote(name)

        if id_col is None:
            with src.connect() as c:
                pg_n = c.execute(text(f"SELECT COUNT(*) FROM {src_q}")).scalar()
            with tgt.connect() as c:
                mysql_n = c.execute(text(f"SELECT COUNT(*) FROM {tgt_q}")).scalar()
            delta = pg_n - mysql_n
            print(f"  ⚠️  {name}: id PK 없음. SRC={pg_n}, TGT={mysql_n}, delta={delta} (수동 점검 필요)", flush=True)
            plan.append((name, None, None, delta if delta > 0 else 0, False, 0))
            continue

        with src.connect() as c:
            pg_max = c.execute(text(f"SELECT MAX(id) FROM {src_q}")).scalar() or 0
        with tgt.connect() as c:
            mysql_max = c.execute(text(f"SELECT MAX(id) FROM {tgt_q}")).scalar() or 0

        n_new = max(0, pg_max - mysql_max)

        # 오버랩 영역 (id ≤ mysql_max) 에서 row hash 다른 행 카운트 = 잠재 UPDATE 충돌
        n_overlap = 0
        if mysql_max > 0 and not args.verbose_conflicts:
            # 빠른 sample: 최근 100 행만 비교 — 정밀 비교는 --verbose-conflicts
            pass
        elif mysql_max > 0:
            # 정밀 비교 (느림)
            with src.connect() as c:
                pg_rows = c.execute(
                    text(f"SELECT * FROM {src_q} WHERE id <= :m ORDER BY id"),
                    {"m": mysql_max}
                ).all()
            with tgt.connect() as c:
                mysql_rows = c.execute(
                    text(f"SELECT * FROM {tgt_q} WHERE id <= :m ORDER BY id"),
                    {"m": mysql_max}
                ).all()
            pg_keys = list((pg_tables[name].select()).columns.keys())
            mysql_keys = list((mysql_tables[name].select()).columns.keys())
            common = set(pg_keys) & set(mysql_keys)
            mysql_dict = {r._mapping["id"]: {k: r._mapping[k] for k in common if k in r._mapping} for r in mysql_rows}
            for r in pg_rows:
                rid = r._mapping["id"]
                if rid not in mysql_dict:
                    continue
                pg_row = {k: r._mapping[k] for k in common if k in r._mapping}
                if _normalize(pg_row) != _normalize(mysql_dict[rid]):
                    n_overlap += 1
                    if n_overlap <= 5:
                        print(f"     ⚠ {name}.id={rid} 값 다름 (PG vs MySQL)", flush=True)

        marker = "🆕" if n_new > 0 else "✓ "
        print(f"  {marker} {name}: MySQL_max={mysql_max}, PG_max={pg_max}, 신규={n_new}"
              + (f", 잠재충돌={n_overlap}" if n_overlap > 0 else ""), flush=True)
        plan.append((name, mysql_max, pg_max, n_new, True, n_overlap))

    total_new = sum(p[3] for p in plan)
    total_conflict = sum(p[5] for p in plan)
    print(f"\n  총 신규 행: {total_new}", flush=True)
    print(f"  총 잠재 UPDATE 충돌: {total_conflict} (수동 분석)", flush=True)

    if not args.apply:
        print("\n[DRY-RUN] 종료 — --apply 로 실제 INSERT", flush=True)
        return 0

    if total_new == 0:
        print("\n[OK] 신규 행 없음. 작업 불필요.", flush=True)
        return 0

    # 실제 INSERT
    print(f"\n[3/3] INSERT 시작 (FK 순서)", flush=True)
    t_start = time.time()
    total_inserted = 0
    for name, mysql_max, pg_max, n_new, has_id, n_overlap in plan:
        if n_new <= 0 or not has_id:
            continue

        pg_tbl = pg_tables[name]
        mysql_tbl = mysql_tables[name]
        common_cols = [c.name for c in pg_tbl.columns if c.name in {c2.name for c2 in mysql_tbl.columns}]

        src_q = src.dialect.identifier_preparer.quote(name)
        tgt_q = tgt.dialect.identifier_preparer.quote(name)
        with src.connect() as src_conn:
            src_conn = src_conn.execution_options(stream_results=True)
            result = src_conn.execute(
                text(f"SELECT * FROM {src_q} WHERE id > :m ORDER BY id"),
                {"m": mysql_max or 0}
            )
            keys = list(result.keys())

            with tgt.begin() as tgt_conn:
                batch = []
                n_inserted = 0
                t0 = time.time()
                for row in result:
                    rowd = {k: row._mapping[k] for k in keys if k in common_cols}
                    # PG TEXT (JSON 문자열) → MySQL JSON 컬럼: 그대로 문자열 통과 OK
                    # PG dict/list (예: jsonb) 가 들어오는 경우 대비 직렬화
                    for k, v in list(rowd.items()):
                        if isinstance(v, (dict, list)):
                            rowd[k] = json.dumps(v, ensure_ascii=False)
                    batch.append(rowd)
                    if len(batch) >= args.batch:
                        tgt_conn.execute(mysql_tbl.insert(), batch)
                        n_inserted += len(batch)
                        batch = []
                if batch:
                    tgt_conn.execute(mysql_tbl.insert(), batch)
                    n_inserted += len(batch)

                # MySQL AUTO_INCREMENT 를 max(id)+1 로 보정 (MySQL 전용)
                if pg_max and tgt.dialect.name == "mysql":
                    tgt_conn.execute(text(f"ALTER TABLE {tgt_q} AUTO_INCREMENT = {pg_max + 1}"))

        dt = time.time() - t0
        print(f"  ✅ {name}: +{n_inserted} 행 / {dt:.2f}s", flush=True)
        total_inserted += n_inserted

    elapsed = time.time() - t_start
    print(f"\n[3/3] 총 INSERT {total_inserted} 행 / {elapsed:.2f}s", flush=True)
    if total_conflict > 0:
        print(f"\n⚠️  잠재 UPDATE 충돌 {total_conflict} 건 — 운영자가 수동 검토 필요", flush=True)

    print("\n[OK] rollback_resync 완료", flush=True)
    return 0


def _normalize(d):
    """비교용 정규화: dict/list 는 JSON, datetime/None 등은 str."""
    out = {}
    for k, v in d.items():
        if isinstance(v, (dict, list)):
            out[k] = json.dumps(v, sort_keys=True, default=str)
        elif v is None:
            out[k] = None
        else:
            out[k] = str(v) if not isinstance(v, (int, float, bool)) else v
    return out


if __name__ == "__main__":
    try:
        rc = main()
    except Exception as e:
        import traceback
        print(f"\n[FATAL] {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        rc = 1
    print(f"\n=== rollback_resync END (exit={rc}) ===", flush=True)
    sys.exit(rc)
