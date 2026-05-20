#!/usr/bin/env python3
"""
STB-07 — 데이터 일관성 자동 스캐너
stb-spec.md §6 기준 5개 카테고리 전수 점검.

MySQL → PostgreSQL 컷오버 후 데이터 부패 가능 항목 검출.

사전 조건:
    DATABASE_URL 환경변수 설정 (postgresql+asyncpg://... 또는 postgresql://...)
    psycopg2-binary 설치 (uv add psycopg2-binary)

실행:
    DATABASE_URL=postgresql://user:pass@localhost:5432/dbname python tools/data_consistency_audit.py
    python tools/data_consistency_audit.py --dsn postgresql://...
    python tools/data_consistency_audit.py --dsn postgresql://... --json-output audit.json
"""

import argparse
import json
import os
import sys
from datetime import datetime

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 미설치. 실행: uv add psycopg2-binary", file=sys.stderr)
    sys.exit(1)


# ─── DB 연결 ──────────────────────────────────────────────────────────────────

def _get_conn(dsn: str):
    """DATABASE_URL 에서 psycopg2 연결 생성. +asyncpg / +psycopg2 접두사 제거."""
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
    dsn = dsn.replace("postgresql+psycopg2://", "postgresql://")
    return psycopg2.connect(dsn, cursor_factory=psycopg2.extras.RealDictCursor)


def _safe_exec(cur, sql: str, params=None) -> list[dict]:
    """쿼리 실행, 예외 시 빈 리스트 반환 (테이블 미존재 대응)."""
    try:
        cur.execute(sql, params)
        return list(cur.fetchall())
    except Exception as exc:
        return [{"_error": str(exc)}]


# ─── Category 1: ENUM 컬럼 유효성 (C-3) ─────────────────────────────────────

ENUM_CHECKS = [
    # (table, column, valid_values_set)
    ("store", "kitchen_mode",        {"kds", "square"}),
    ("store", "category",            {"restaurant", "cafe", "bar", "other"}),
    ("store", "subscription_type",   {"FREE", "MONTHLY", "SIXMONTH", "YEARLY"}),
    ("store", "subscription_status", {"TRIAL", "ACTIVE", "EXPIRED"}),
    ("store", "payment_options",     {"cash_only", "card_and_cash"}),
    ("store", "point_accrual_type",  {"PERCENT", "FIXED"}),
    ("store", "kitchen_color_mode",  {"CATEGORY", "MENU", "TABLE"}),
    ('"table"', "status",            {"ready", "occupied", "CHECKOUT_REQUESTED"}),
    ('"order"', "order_type",        {"eat_in", "take_out"}),
    ('"order"', "payment_status",    {"unpaid", "paid", "partial", "refunded"}),
    ("orderitem", "status",          {"pending", "cooking_complete", "pickup_ready", "served", "cancelled"}),
    ("pointhistory", "tx_type",      {"EARNED", "USED", "EXPIRED"}),
]


def audit_enum(conn) -> dict:
    issues = []
    cur = conn.cursor()
    for table, col, valid in ENUM_CHECKS:
        in_clause = ", ".join(f"'{v}'" for v in valid)
        sql = f"SELECT id, {col} FROM {table} WHERE {col} IS NOT NULL AND {col} NOT IN ({in_clause})"
        rows = _safe_exec(cur, sql)
        if rows and "_error" in rows[0]:
            # 테이블/컬럼 미존재 → skip
            continue
        if rows:
            issues.append({
                "table": table.strip('"'),
                "column": col,
                "failing_ids": [r["id"] for r in rows[:50]],  # 최대 50개
                "count": len(rows),
            })
    cur.close()
    return {"category": "ENUM 컬럼 유효성", "passed": len(issues) == 0, "issues": issues}


# ─── Category 2: JSON-as-TEXT 파싱 (C-4) ─────────────────────────────────────

JSON_CHECKS = [
    ("menu", "options"),
    ("menu", "allergens"),
    ("store", "business_hours"),
    ("store", "interior_photos"),
    ("store", "exterior_photos"),
    ("store", "nearby_attractions"),
    ("orderitem", "option_details"),
    ("store", "extra_translations"),
    ("webhookevent", "payload"),
]


def audit_json(conn) -> dict:
    issues = []
    cur = conn.cursor()
    for table, col in JSON_CHECKS:
        sql = f"SELECT id, {col} FROM {table} WHERE {col} IS NOT NULL AND {col} != '' AND {col} != '[]' AND {col} != '{{}}'"
        rows = _safe_exec(cur, sql)
        if not rows or "_error" in rows[0]:
            continue
        fail_ids = []
        for row in rows:
            val = row[col]
            if val is None:
                continue
            try:
                json.loads(val)
            except (json.JSONDecodeError, TypeError):
                fail_ids.append(row["id"])
        if fail_ids:
            issues.append({
                "table": table,
                "column": col,
                "failing_ids": fail_ids[:50],
                "count": len(fail_ids),
            })
    cur.close()
    return {"category": "JSON-as-TEXT 파싱", "passed": len(issues) == 0, "issues": issues}


# ─── Category 3: datetime NULL / 이상값 (C-7) ────────────────────────────────

DATETIME_NULL_CHECKS = [
    # (table, column, allow_null)
    ('"order"', "created_at",   False),
    ("store",   "created_at",   False),
    ("menu",    "sold_out_until", True),   # NULL 허용
]

DATETIME_RANGE_MIN = datetime(2020, 1, 1)
DATETIME_RANGE_MAX = datetime(2030, 1, 1)


def audit_datetime(conn) -> dict:
    issues = []
    cur = conn.cursor()

    for table, col, allow_null in DATETIME_NULL_CHECKS:
        if not allow_null:
            sql = f"SELECT id FROM {table} WHERE {col} IS NULL"
            rows = _safe_exec(cur, sql)
            if rows and "_error" not in rows[0] and rows:
                issues.append({
                    "table": table.strip('"'),
                    "column": col,
                    "issue": "NULL 값 (NOT NULL 기대)",
                    "failing_ids": [r["id"] for r in rows[:50]],
                    "count": len(rows),
                })

        # 범위 이상 확인 (2020~2030)
        sql = (
            f"SELECT id, {col} FROM {table} "
            f"WHERE {col} IS NOT NULL "
            f"AND ({col} < %s OR {col} > %s)"
        )
        rows = _safe_exec(cur, sql, (DATETIME_RANGE_MIN, DATETIME_RANGE_MAX))
        if rows and "_error" not in rows[0] and rows:
            issues.append({
                "table": table.strip('"'),
                "column": col,
                "issue": f"범위 이상 ({DATETIME_RANGE_MIN.year}~{DATETIME_RANGE_MAX.year} 외)",
                "failing_ids": [r["id"] for r in rows[:50]],
                "count": len(rows),
            })

    cur.close()
    return {"category": "datetime NULL/이상값", "passed": len(issues) == 0, "issues": issues}


# ─── Category 4: FK orphan 검출 ──────────────────────────────────────────────

FK_CHECKS = [
    # (child_table, child_fk_col, parent_table, parent_pk)
    ("orderitem",    "order_id",  '"order"', "id"),
    ("menu",         "store_id",  "store",   "id"),
    ("staffmember",  "store_id",  "store",   "id"),
    ('"table"',      "store_id",  "store",   "id"),
    ("staffattendance", "staff_id", "staffmember", "id"),
]


def audit_fk(conn) -> dict:
    issues = []
    cur = conn.cursor()
    for child, fk, parent, pk in FK_CHECKS:
        sql = (
            f"SELECT id FROM {child} "
            f"WHERE {fk} IS NOT NULL "
            f"AND {fk} NOT IN (SELECT {pk} FROM {parent})"
        )
        rows = _safe_exec(cur, sql)
        if rows and "_error" in rows[0]:
            continue
        if rows:
            issues.append({
                "table": child.strip('"'),
                "column": fk,
                "issue": f"orphan → {parent}.{pk}",
                "failing_ids": [r["id"] for r in rows[:50]],
                "count": len(rows),
            })
    cur.close()
    return {"category": "FK orphan 검출", "passed": len(issues) == 0, "issues": issues}


# ─── Category 5: NOT NULL 위반 ────────────────────────────────────────────────

NOTNULL_CHECKS = [
    # (table, columns_that_must_not_be_null)
    ("store",       ["name", "owner_id"]),
    ("menu",        ["name_jp", "store_id"]),
    ('"order"',     ["shop_id", "session_token"]),
    ("staffmember", ["store_id", "name"]),
]


def audit_notnull(conn) -> dict:
    issues = []
    cur = conn.cursor()
    for table, cols in NOTNULL_CHECKS:
        for col in cols:
            sql = f"SELECT COUNT(*) AS cnt FROM {table} WHERE {col} IS NULL"
            rows = _safe_exec(cur, sql)
            if not rows or "_error" in rows[0]:
                continue
            cnt = rows[0].get("cnt", 0)
            if cnt and cnt > 0:
                issues.append({
                    "table": table.strip('"'),
                    "column": col,
                    "issue": "NOT NULL 위반",
                    "count": cnt,
                })
    cur.close()
    return {"category": "NOT NULL 위반", "passed": len(issues) == 0, "issues": issues}


# ─── 리포트 출력 ──────────────────────────────────────────────────────────────

def print_report(results: list[dict]) -> None:
    print()
    print("═" * 60)
    print("STB-07 데이터 일관성 감사 리포트")
    print("═" * 60)
    for i, r in enumerate(results, 1):
        icon = "✅" if r["passed"] else "⚠️ "
        issues = r.get("issues", [])
        total_issues = sum(x.get("count", 0) for x in issues)
        print(f"[{i}/5] {r['category']:<35} {icon} {'PASS' if r['passed'] else f'FAIL ({total_issues} issues)'}")
        for iss in issues:
            ids_preview = str(iss.get("failing_ids", [])[:10])
            print(f"  - {iss.get('table')}.{iss.get('column')}: {iss.get('count')} rows  {iss.get('issue', '')}  ids={ids_preview}")
    print("─" * 60)
    all_passed = all(r["passed"] for r in results)
    fail_count = sum(1 for r in results if not r["passed"])
    overall = "✅ PASS — 데이터 이상 없음" if all_passed else f"❌ FAIL — {fail_count}/5 카테고리 실패"
    print(f"종합: {overall}")
    if not all_passed:
        print("→ STB-08 핫픽스 슬롯에 추가 필요")
    print()


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="STB-07 데이터 일관성 자동 스캐너")
    parser.add_argument("--dsn", default=os.getenv("DATABASE_URL"),
                        help="PostgreSQL DSN (기본: DATABASE_URL 환경변수)")
    parser.add_argument("--json-output", default=None,
                        help="JSON 리포트 출력 파일 경로 (선택)")
    args = parser.parse_args()

    if not args.dsn:
        print("ERROR: DATABASE_URL 환경변수 또는 --dsn 필요", file=sys.stderr)
        print("  예: DATABASE_URL=postgresql://user:pass@localhost/dbname python tools/data_consistency_audit.py")
        sys.exit(1)

    print(f"\nSTB-07: 연결 중... ({args.dsn.split('@')[-1] if '@' in args.dsn else args.dsn[:30]})")

    try:
        conn = _get_conn(args.dsn)
    except Exception as e:
        print(f"ERROR: DB 연결 실패 — {e}", file=sys.stderr)
        sys.exit(1)

    results = []
    categories = [
        ("ENUM 컬럼 유효성",   audit_enum),
        ("JSON-as-TEXT 파싱",  audit_json),
        ("datetime NULL/이상", audit_datetime),
        ("FK orphan 검출",     audit_fk),
        ("NOT NULL 위반",      audit_notnull),
    ]
    for name, fn in categories:
        print(f"  [{name}] 점검 중...", end=" ", flush=True)
        r = fn(conn)
        print("✅" if r["passed"] else "❌")
        results.append(r)

    conn.close()

    print_report(results)

    if args.json_output:
        with open(args.json_output, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2, default=str)
        print(f"JSON 리포트: {args.json_output}")

    all_passed = all(r["passed"] for r in results)
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
