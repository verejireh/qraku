#!/usr/bin/env python3
"""
STB-06 — PG 쿼리 성능 회귀 점검
stb-spec.md §5 임계값 기준으로 핵심 6개 엔드포인트 p50/p95 측정.

사전 조건:
    - 백엔드 uvicorn :8003 가동 중 (또는 --base-url 로 지정)
    - --store-id: 시드 데이터가 있는 매장 ID
    - --admin-token: admin JWT (insights 엔드포인트용)

실행:
    uv run python tools/pg_query_audit.py --store-id 1 --admin-token eyJ...
    python tools/pg_query_audit.py --store-id 1 --admin-token eyJ... --reps 50
"""

import argparse
import json
import sys
import time
import uuid

try:
    import httpx as _http_lib
    _USE_HTTPX = True
except ImportError:
    import urllib.request
    import urllib.error
    _USE_HTTPX = False


# ─── 임계값 (stb-spec.md §5) ──────────────────────────────────────────────────
THRESHOLDS = {
    "GET /api/menus/{store_id}":          {"p50": 80,  "p95": 200},
    "GET /api/orders/{store_id}":         {"p50": 100, "p95": 250},
    "GET /api/public/discover/nearby":    {"p50": 50,  "p95": 100},
    "GET /api/admin/insights/visitors":   {"p50": 150, "p95": 400},
    "GET /api/stats/dashboard":           {"p50": 150, "p95": 400},
    "POST /api/orders/ (takeout)":        {"p50": 200, "p95": 500},
}


# ─── HTTP 헬퍼 ────────────────────────────────────────────────────────────────

def _get(url: str, headers: dict | None = None, timeout: float = 10.0) -> tuple[int, float]:
    """GET 요청 → (status_code, elapsed_ms)."""
    t0 = time.perf_counter()
    try:
        if _USE_HTTPX:
            with _http_lib.Client(timeout=timeout) as client:
                r = client.get(url, headers=headers or {})
            return r.status_code, (time.perf_counter() - t0) * 1000
        else:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                _ = resp.read()
            return resp.status, (time.perf_counter() - t0) * 1000
    except Exception as exc:
        return 0, (time.perf_counter() - t0) * 1000


def _post(url: str, body: dict, headers: dict | None = None, timeout: float = 10.0) -> tuple[int, float]:
    """POST JSON 요청 → (status_code, elapsed_ms)."""
    t0 = time.perf_counter()
    try:
        if _USE_HTTPX:
            with _http_lib.Client(timeout=timeout) as client:
                r = client.post(url, json=body, headers=headers or {})
            return r.status_code, (time.perf_counter() - t0) * 1000
        else:
            data = json.dumps(body).encode()
            req = urllib.request.Request(url, data=data, headers={
                "Content-Type": "application/json",
                **(headers or {}),
            }, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                _ = resp.read()
            return resp.status, (time.perf_counter() - t0) * 1000
    except Exception as exc:
        return 0, (time.perf_counter() - t0) * 1000


# ─── 측정 ────────────────────────────────────────────────────────────────────

def percentile(times: list[float], pct: int) -> float:
    """정렬된 리스트에서 p{pct} 반환."""
    if not times:
        return 0.0
    idx = max(0, int(len(times) * pct / 100) - 1)
    return round(sorted(times)[idx], 1)


def measure(label: str, fn, reps: int) -> dict:
    """fn() 을 reps 번 호출, p50/p95 집계."""
    times = []
    errors = 0
    for _ in range(reps):
        status, elapsed = fn()
        if status >= 400 or status == 0:
            errors += 1
        else:
            times.append(elapsed)

    if not times:
        return {
            "label": label,
            "reps": reps,
            "errors": errors,
            "p50": None,
            "p95": None,
            "passed": False,
            "note": "모든 요청 실패 — 엔드포인트 확인 필요",
        }

    p50 = percentile(times, 50)
    p95 = percentile(times, 95)
    thresh = THRESHOLDS.get(label, {})
    p50_ok = thresh.get("p50") is None or p50 <= thresh["p50"]
    p95_ok = thresh.get("p95") is None or p95 <= thresh["p95"]

    return {
        "label": label,
        "reps": reps,
        "errors": errors,
        "p50": p50,
        "p95": p95,
        "p50_threshold": thresh.get("p50"),
        "p95_threshold": thresh.get("p95"),
        "passed": p50_ok and p95_ok,
    }


# ─── 리포트 출력 ──────────────────────────────────────────────────────────────

def print_report(results: list[dict]) -> None:
    print()
    print("═" * 70)
    print("STB-06 PG 쿼리 성능 회귀 점검 리포트")
    print("═" * 70)
    for r in results:
        icon = "✅" if r["passed"] else "❌"
        note = r.get("note", "")
        if r["p50"] is None:
            line = f"  {icon}  {r['label']:<45}  {note}"
        else:
            line = (
                f"  {icon}  {r['label']:<45}"
                f"  p50={r['p50']:.0f}ms (≤{r.get('p50_threshold','?')})"
                f"  p95={r['p95']:.0f}ms (≤{r.get('p95_threshold','?')})"
            )
            if r["errors"]:
                line += f"  [{r['errors']} errors]"
        print(line)

    print("─" * 70)
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    overall = "✅ PASS" if passed == total else f"❌ FAIL ({total - passed}/{total} 초과)"
    print(f"종합: {overall}")
    if passed < total:
        print()
        print("핫픽스 후보 (STB-08 슬롯 추가 필요):")
        for r in results:
            if not r["passed"]:
                print(f"  - {r['label']}: p95={r.get('p95','?')}ms (임계: {r.get('p95_threshold','?')}ms)")
    print()


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="STB-06 PG 쿼리 성능 회귀 점검")
    parser.add_argument("--base-url", default="http://localhost:8003")
    parser.add_argument("--store-id", required=True, type=int)
    parser.add_argument("--admin-token", default=None,
                        help="admin JWT — insights 엔드포인트 접근에 필요")
    parser.add_argument("--reps", default=50, type=int,
                        help="엔드포인트별 반복 횟수 (기본 50)")
    parser.add_argument("--explain", action="store_true",
                        help="EXPLAIN 지원 엔드포인트에서 추가 분석 시도")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    sid = args.store_id
    tok = args.admin_token
    reps = args.reps
    auth_header = {"Authorization": f"Bearer {tok}"} if tok else {}

    print(f"\nSTB-06: {base} / store_id={sid} / reps={reps}")
    if not _USE_HTTPX:
        print("  ⚠️  httpx 미설치 — urllib.request 폴백 사용 (Keep-Alive 없어 측정값 +과대추정 가능)")

    results = []

    # 1. GET /api/menus/{store_id}
    results.append(measure(
        "GET /api/menus/{store_id}",
        lambda: _get(f"{base}/api/menus/{sid}"),
        reps,
    ))

    # 2. GET /api/orders/{store_id}
    results.append(measure(
        "GET /api/orders/{store_id}",
        lambda: _get(f"{base}/api/orders/{sid}", headers=auth_header),
        reps,
    ))

    # 3. GET /api/public/discover/nearby (PostGIS)
    nearby_url = f"{base}/api/public/discover/nearby?lat=35.3083&lng=138.9328&radius=800"
    results.append(measure(
        "GET /api/public/discover/nearby",
        lambda: _get(nearby_url),
        reps,
    ))

    # 4. GET /api/admin/insights/visitors (admin JWT 필요)
    if tok:
        results.append(measure(
            "GET /api/admin/insights/visitors",
            lambda: _get(f"{base}/api/admin/insights/visitors?store_id={sid}", headers=auth_header),
            reps,
        ))
    else:
        results.append({
            "label": "GET /api/admin/insights/visitors",
            "passed": False,
            "note": "--admin-token 미설정 — skip",
            "p50": None, "p95": None, "reps": 0, "errors": 0,
        })

    # 5. GET /api/stats/dashboard
    results.append(measure(
        "GET /api/stats/dashboard",
        lambda: _get(f"{base}/api/stats/dashboard?store_id={sid}", headers=auth_header),
        reps,
    ))

    # 6. POST /api/orders/ (takeout) — 최소 페이로드 실주문 생성
    # 테스트 스토어 대상 — 부작용 있음 (실 주문 생성). 테스트 전용 매장 사용 권장.
    def _takeout_order():
        payload = {
            "shop_id": str(sid),
            "store_id": sid,
            "table_number": "0",
            "session_token": str(uuid.uuid4()),
            "order_type": "take_out",
            "payment_method": "cash",
            "items": [],
            "total_amount": 0,
        }
        return _post(f"{base}/api/orders/", body=payload)

    results.append(measure(
        "POST /api/orders/ (takeout)",
        _takeout_order,
        reps,
    ))

    print_report(results)

    all_passed = all(r["passed"] for r in results)
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
