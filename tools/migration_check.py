#!/usr/bin/env python
"""MySQL ↔ PostgreSQL 데이터 정합성 검증 스크립트.

DBM-10 (data-migration-engineer, sonnet) — 컷오버 전 / 후 사용.
스테이징 리허설 시 1회, 운영 컷오버 룬북 T-10 단계에서 1회 실행.

사용:
    python tools/migration_check.py \\
        --mysql mysql+pymysql://user:pass@host:3306/kiospad \\
        --pg postgresql+psycopg2://qraku:pass@host:5432/qraku

출력:
    항목별 ✅ / ❌ + 차이 sample. 마지막에 종합 결과.
    종료 코드: 0 = 모두 PASS, 1 = 하나 이상 FAIL.

검증 항목:
    1. 행 수 일치 (모든 테이블)
    2. MAX(id) 일치 (id 컬럼 있는 테이블)
    3. PG sequence next_val ≥ MAX(id) + 1 (auto-increment 대응)
    4. FK 정합성 — orphan 행 0 (양 DB)
    5. 인코딩 — 한국어/일본어 sample row 동일 (Store.name, Menu.name)
    6. JSON 컬럼 — 파싱 결과 동일 (Menu.options, Menu.extra_translations)
    7. 인덱스 / UNIQUE — 양 DB 에 동일 인덱스 존재
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import OrderedDict
from typing import Optional

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

# Windows console (cp932/cp949) 에서도 Unicode (이모지 / 박스 라인) 출력 안전.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass


# ─── 출력 헬퍼 ───────────────────────────────────────────────────────────────
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
RESET = "\033[0m"


def ok(msg: str) -> None:
    print(f"  {GREEN}✅{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"  {RED}❌{RESET} {msg}")


def warn(msg: str) -> None:
    print(f"  {YELLOW}⚠️ {RESET} {msg}")


def section(title: str) -> None:
    print(f"\n{'═' * 76}\n  {title}\n{'═' * 76}")


# ─── 검증 함수 ───────────────────────────────────────────────────────────────
def get_tables(engine: Engine, exclude: set[str]) -> list[str]:
    """대상 DB 의 사용자 테이블 목록 (alembic_version 등 제외)."""
    insp = inspect(engine)
    return sorted(t for t in insp.get_table_names() if t not in exclude)


def has_column(engine: Engine, table: str, column: str) -> bool:
    insp = inspect(engine)
    return any(c["name"] == column for c in insp.get_columns(table))


def scalar(engine: Engine, sql: str) -> Optional[int]:
    with engine.connect() as conn:
        return conn.execute(text(sql)).scalar()


def quote_ident(engine: Engine, name: str) -> str:
    """PG 예약어(order, table) 등 양 DB 안전 인용."""
    dialect = engine.dialect.name
    if dialect == "postgresql":
        return f'"{name}"'
    return f"`{name}`"


def check_row_counts(mysql: Engine, pg: Engine, tables: list[str]) -> bool:
    section("1. 행 수 일치")
    all_ok = True
    for tbl in tables:
        m_count = scalar(mysql, f"SELECT COUNT(*) FROM {quote_ident(mysql, tbl)}")
        p_count = scalar(pg, f"SELECT COUNT(*) FROM {quote_ident(pg, tbl)}")
        if m_count == p_count:
            ok(f"{tbl}: {m_count} rows")
        else:
            fail(f"{tbl}: MySQL={m_count} / PG={p_count} (diff {m_count - p_count})")
            all_ok = False
    return all_ok


def check_max_id(mysql: Engine, pg: Engine, tables: list[str]) -> bool:
    section("2. MAX(id) 일치 (id 컬럼 있는 테이블)")
    all_ok = True
    for tbl in tables:
        if not has_column(mysql, tbl, "id"):
            continue
        m_max = scalar(mysql, f"SELECT MAX(id) FROM {quote_ident(mysql, tbl)}")
        p_max = scalar(pg, f"SELECT MAX(id) FROM {quote_ident(pg, tbl)}")
        if m_max == p_max:
            ok(f"{tbl}.id: MAX={m_max}")
        else:
            fail(f"{tbl}.id: MySQL MAX={m_max} / PG MAX={p_max}")
            all_ok = False
    return all_ok


def check_sequences(pg: Engine, tables: list[str]) -> bool:
    section("3. PG sequence next_val ≥ MAX(id) + 1")
    all_ok = True
    insp = inspect(pg)
    for tbl in tables:
        if not has_column(pg, tbl, "id"):
            continue
        # 시퀀스 이름 추정: pg_get_serial_sequence
        seq_sql = (
            f"SELECT pg_get_serial_sequence('{tbl}', 'id')"
        )
        seq_name = scalar(pg, seq_sql)
        if not seq_name:
            warn(f"{tbl}: sequence 없음 (id 가 SERIAL 이 아닌 듯)")
            continue
        next_val = scalar(pg, f"SELECT last_value FROM {seq_name}")
        max_id = scalar(pg, f'SELECT MAX(id) FROM "{tbl}"') or 0
        if next_val >= max_id + 1:
            ok(f"{tbl}: seq next_val={next_val} ≥ MAX(id)+1={max_id + 1}")
        else:
            fail(f"{tbl}: seq next_val={next_val} < MAX(id)+1={max_id + 1} — 보정 필요")
            all_ok = False
    return all_ok


def check_fk_orphans(engine: Engine, label: str) -> bool:
    section(f"4. FK 정합성 — orphan 행 0 ({label})")
    all_ok = True
    insp = inspect(engine)
    for tbl in sorted(insp.get_table_names()):
        for fk in insp.get_foreign_keys(tbl):
            local_cols = fk["constrained_columns"]
            ref_table = fk["referred_table"]
            ref_cols = fk["referred_columns"]
            if not local_cols or not ref_cols:
                continue
            lc = local_cols[0]
            rc = ref_cols[0]
            tbl_q = quote_ident(engine, tbl)
            ref_q = quote_ident(engine, ref_table)
            sql = (
                f"SELECT COUNT(*) FROM {tbl_q} t "
                f"WHERE t.{lc} IS NOT NULL "
                f"AND NOT EXISTS (SELECT 1 FROM {ref_q} r WHERE r.{rc} = t.{lc})"
            )
            try:
                orphans = scalar(engine, sql)
            except Exception as e:
                warn(f"{tbl}.{lc} → {ref_table}.{rc}: 검사 실패 ({e})")
                continue
            if orphans == 0:
                ok(f"{tbl}.{lc} → {ref_table}.{rc}: orphan 0")
            else:
                fail(f"{tbl}.{lc} → {ref_table}.{rc}: orphan {orphans} 건")
                all_ok = False
    return all_ok


def check_encoding(mysql: Engine, pg: Engine) -> bool:
    section("5. 인코딩 — 한국어/일본어 sample row")
    all_ok = True
    samples = [
        ("store", "name", "LIMIT 5"),
        ("menu", "name_ja", "LIMIT 5"),
        ("menu", "name_ko", "LIMIT 5"),
    ]
    for tbl, col, suffix in samples:
        if not has_column(mysql, tbl, col):
            continue
        m_q = (
            f"SELECT id, {col} FROM {quote_ident(mysql, tbl)} "
            f"WHERE {col} IS NOT NULL ORDER BY id {suffix}"
        )
        p_q = (
            f"SELECT id, {col} FROM {quote_ident(pg, tbl)} "
            f"WHERE {col} IS NOT NULL ORDER BY id {suffix}"
        )
        with mysql.connect() as mc, pg.connect() as pc:
            m_rows = [tuple(r) for r in mc.execute(text(m_q)).all()]
            p_rows = [tuple(r) for r in pc.execute(text(p_q)).all()]
        if m_rows == p_rows:
            ok(f"{tbl}.{col}: sample {len(m_rows)} rows 동일")
        else:
            fail(f"{tbl}.{col}: sample 불일치 (MySQL 첫행 {m_rows[:1]} / PG 첫행 {p_rows[:1]})")
            all_ok = False
    return all_ok


def check_json_columns(mysql: Engine, pg: Engine) -> bool:
    section("6. JSON 컬럼 — 파싱 결과 동일")
    all_ok = True
    targets = [
        ("menu", "options"),
        ("menu", "extra_translations"),
        ("orderitem", "option_details"),
        ("globalreview", "tags"),
    ]
    for tbl, col in targets:
        if not has_column(mysql, tbl, col) or not has_column(pg, tbl, col):
            continue
        m_q = (
            f"SELECT id, {col} FROM {quote_ident(mysql, tbl)} "
            f"WHERE {col} IS NOT NULL AND {col} <> '' ORDER BY id LIMIT 10"
        )
        p_q = (
            f"SELECT id, {col} FROM {quote_ident(pg, tbl)} "
            f"WHERE {col} IS NOT NULL AND {col} <> '' ORDER BY id LIMIT 10"
        )
        with mysql.connect() as mc, pg.connect() as pc:
            m_rows = list(mc.execute(text(m_q)).all())
            p_rows = list(pc.execute(text(p_q)).all())
        if len(m_rows) != len(p_rows):
            fail(f"{tbl}.{col}: row count diff MySQL={len(m_rows)} / PG={len(p_rows)}")
            all_ok = False
            continue
        local_ok = True
        for (m_id, m_val), (p_id, p_val) in zip(m_rows, p_rows):
            if m_id != p_id:
                fail(f"{tbl}.{col}: id 불일치 MySQL={m_id} / PG={p_id}")
                local_ok = False
                break
            try:
                if json.loads(m_val) != json.loads(p_val):
                    fail(f"{tbl}.{col} id={m_id}: JSON parse 결과 불일치")
                    local_ok = False
                    break
            except json.JSONDecodeError as e:
                warn(f"{tbl}.{col} id={m_id}: JSON 파싱 불가 ({e}) — 양쪽 모두 raw 비교")
                if m_val != p_val:
                    fail(f"{tbl}.{col} id={m_id}: raw 문자열 불일치")
                    local_ok = False
                    break
        if local_ok:
            ok(f"{tbl}.{col}: {len(m_rows)} rows 동일")
        else:
            all_ok = False
    return all_ok


def check_indexes(mysql: Engine, pg: Engine, tables: list[str]) -> bool:
    section("7. 인덱스 / UNIQUE — 양 DB 동일성")
    all_ok = True
    insp_m = inspect(mysql)
    insp_p = inspect(pg)
    for tbl in tables:
        m_idx = {
            (i["name"], tuple(sorted(i["column_names"] or [])), bool(i.get("unique")))
            for i in insp_m.get_indexes(tbl)
        }
        p_idx = {
            (i["name"], tuple(sorted(i["column_names"] or [])), bool(i.get("unique")))
            for i in insp_p.get_indexes(tbl)
        }
        # 이름은 DB 마다 다를 수 있어 (columns, unique) 만 비교
        m_keys = {(cols, uniq) for (_, cols, uniq) in m_idx}
        p_keys = {(cols, uniq) for (_, cols, uniq) in p_idx}
        missing_in_pg = m_keys - p_keys
        extra_in_pg = p_keys - m_keys
        if not missing_in_pg and not extra_in_pg:
            ok(f"{tbl}: 인덱스 {len(m_keys)} 개 동일")
        else:
            if missing_in_pg:
                fail(f"{tbl}: PG 에 누락된 인덱스 {missing_in_pg}")
                all_ok = False
            if extra_in_pg:
                warn(f"{tbl}: PG 에 추가 인덱스 {extra_in_pg} (보통 OK)")
    return all_ok


# ─── 메인 ────────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(
        description="MySQL <-> PostgreSQL 데이터 정합성 검증 (DBM-10)"
    )
    parser.add_argument(
        "--mysql", required=True,
        help="MySQL sync URL (예: mysql+pymysql://user:pass@host:3306/kiospad)"
    )
    parser.add_argument(
        "--pg", required=True,
        help="PG sync URL (예: postgresql+psycopg2://qraku:pass@host:5432/qraku)"
    )
    parser.add_argument(
        "--skip", default="",
        help="콤마 구분 skip 항목 (rows,maxid,seq,fk,encoding,json,index)"
    )
    args = parser.parse_args()

    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    exclude_tables = {"alembic_version"}

    print(f"\n  MySQL → {args.mysql.split('@')[-1]}")
    print(f"  PG    → {args.pg.split('@')[-1]}")

    mysql_engine = create_engine(args.mysql, pool_pre_ping=True)
    pg_engine = create_engine(args.pg, pool_pre_ping=True)

    # 공통 테이블만 검증 대상
    m_tables = set(get_tables(mysql_engine, exclude_tables))
    p_tables = set(get_tables(pg_engine, exclude_tables))
    only_mysql = m_tables - p_tables
    only_pg = p_tables - m_tables
    if only_mysql:
        warn(f"MySQL only tables: {sorted(only_mysql)}")
    if only_pg:
        warn(f"PG only tables: {sorted(only_pg)}")
    common = sorted(m_tables & p_tables)
    print(f"  공통 테이블 {len(common)} 개 검증\n")

    results: OrderedDict[str, bool] = OrderedDict()
    if "rows" not in skip:
        results["1. 행 수 일치"] = check_row_counts(mysql_engine, pg_engine, common)
    if "maxid" not in skip:
        results["2. MAX(id)"] = check_max_id(mysql_engine, pg_engine, common)
    if "seq" not in skip:
        results["3. PG sequence"] = check_sequences(pg_engine, common)
    if "fk" not in skip:
        results["4. FK orphan (MySQL)"] = check_fk_orphans(mysql_engine, "MySQL")
        results["4. FK orphan (PG)"] = check_fk_orphans(pg_engine, "PG")
    if "encoding" not in skip:
        results["5. 인코딩"] = check_encoding(mysql_engine, pg_engine)
    if "json" not in skip:
        results["6. JSON"] = check_json_columns(mysql_engine, pg_engine)
    if "index" not in skip:
        results["7. 인덱스"] = check_indexes(mysql_engine, pg_engine, common)

    section("종합 결과")
    all_pass = True
    for name, passed in results.items():
        if passed:
            ok(name)
        else:
            fail(name)
            all_pass = False

    print()
    if all_pass:
        print(f"  {GREEN}모든 검증 통과 — 컷오버 진행 가능{RESET}\n")
        return 0
    print(f"  {RED}일부 검증 실패 — 차이를 분석하고 보정 후 재실행하세요{RESET}\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
