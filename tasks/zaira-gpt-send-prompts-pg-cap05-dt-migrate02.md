# 자이라 → GPT 전송 프롬프트 — PG-CAP-05 + PG-DT-MIGRATE-02

**작성일**: 2026-05-22
**용도**: 자이라가 GPT chat 에 그대로 복붙해서 cross-review 요청
**전제**: Claude 가 두 분석 doc 작성 + 커밋 완료

두 작업이 독립적이라 **2개 GPT 세션 병렬 전송 가능**. 각 세션의 응답은 즉시 디스크 저장 + 커밋 필수 (이전 회차 유실 교훈).

---

## 세션 F — PG-CAP-05 (translate_menu DB session 분리)

### 자이라가 GPT 에 보낼 메시지

```text
Claude 가 PG-CAP-05 분석 doc 을 작성했습니다. cross-review 부탁드립니다.

대상 파일:
- tasks/p1-cap05-translate-task-refactor-analysis.md  (Claude 신규 작성, ~370 줄)
- tasks/p1-capacity-model-analysis.md  (상위 카드)
- tasks/gpt-p1-capacity-review.md  (이전 GPT review — D 섹션 참조)
- tasks/claude-parallel-handoff-pg-cap05-dt-migrate02.md  (GPT 핸드오프 — Section 1)
- backend/workers/translate_tasks.py  (변경 대상 코드)
- backend/workers/db.py  (worker sync engine)
- backend/utils/translation.py  (외부 API 호출)

작업 배경:
translate_menu 가 외부 Gemini API 호출 (~6~36 calls × 1~3 초) 전체 구간 동안
DB session 을 보유. 단일 worker process 에선 OK 이지만 Dramatiq 확장 시
pool exhaustion 위험. PG-CAP-04 worker scaling 의 선행 조건.

Claude 가 제안한 3-Phase 분리 패턴:
  Phase 1 (Load, DB session): Menu/SystemConfig 조회 → primitive snapshot 추출 → session close
  Phase 2 (External API, no session): translate_text 호출 + result 누적 (snapshot 기반)
  Phase 3 (Write, DB session): re-fetch + stale source 가드 + missing-field-only write + commit

핵심 설계 결정 (분석 doc §"핵심 설계 결정" 참조):
  1. Source-text staleness check — in-flight 중 name_jp 변경 시 drop + re-trigger
  2. Missing-field-only write — admin 수동 입력 보존
  3. options stale 처리 — raw JSON 전체 비교
  4. SystemConfig per-task 조회 유지 (단순성)
  5. Dramatiq retry semantics 보존

cross-review 요청 5 항목:

A. 3-phase 분리가 DB connection hold 차단에 충분한가? 
   특히 Phase 1/2 사이 또는 Phase 2/3 사이에 또 다른 connection 잡힐 위험?

B. Menu row 가 in-flight 중 변경 시 race condition — Claude 의 stale source 가드
   (m.name_jp != snapshot["name_jp"] 비교 후 drop) vs idempotent missing-field-only
   write 어느 게 적절? Claude 는 (a) drop + re-trigger 보장 안 선택. 
   대안 (b) 부분 적용 / (c) DB-level optimistic locking 비교 평가.

C. Dramatiq retry settings (max_retries=3, min_backoff=1s, max_backoff=30s, 
   time_limit=60s) 가 분리 후 안전한가? 부분 성공 (Phase 2 완료 후 Phase 3 실패) /
   API timeout / DB commit 실패 / 중복 actor 실행 시 동작?

D. SystemConfig/GEMINI_API_KEY 캐싱 vs per-task 로딩 — Claude 는 per-task 유지 권장.
   캐싱 시 API 키 회전 stale 위험 vs DB 부담 trade-off 평가.

E. 누락된 capacity 위험 — worker threads/processes, sync pool 사이즈, Redis publish,
   WS fanout 관련해서 본 분석이 놓친 부분?

응답을 tasks/gpt-pg-cap05-review.md 로 저장 + 커밋해주세요 (이전처럼 유실 방지).
```

---

## 세션 G — PG-DT-MIGRATE-02 (utcnow 113건 분류 + 일괄 교체)

### 자이라가 GPT 에 보낼 메시지

```text
Claude 가 PG-DT-MIGRATE-02 분석 doc 을 작성했습니다. cross-review 부탁드립니다.

대상 파일:
- tasks/p1-dt-migrate-02-utcnow-classification-analysis.md  (Claude 신규 작성, ~430 줄)
- tasks/p1-datetime-utc-migration-analysis.md  (상위 카드 P1 #7)
- tasks/gpt-p1-datetime-review.md  (이전 GPT review)
- tasks/gpt-p1-date-grouping-review.md  (관련 GPT review)
- tasks/claude-parallel-handoff-pg-cap05-dt-migrate02.md  (GPT 핸드오프 — Section 2)
- backend/utils/time_helpers.py  (헬퍼 모듈)
- backend/models.py, backend/utils/jwt.py, backend/routers/{stats,insights,super_admin,orders,billing}.py
   (대표 변경 대상)

작업 배경:
P1 #7 Strategy 1 적용 후에도 datetime.utcnow() 113 건 잔존. 이 중 80 건 정도가
DB naive UTC write/비교 (안전 변환), 나머지가 의미 분석 필요한 케이스.
GPT 이전 review 가 "단순 sed 금지" 명시 — 분류별 정밀 작업 필요.

Claude 가 분류한 6 카테고리:
  Cat-1 DB naive UTC writes/comparisons  ~70건  → now_utc_naive()  (안전)
  Cat-2 Rolling UTC windows              ~21건  → 의미 분석:
        - JST calendar day 의도 17건 (stats/insights/super_admin)
          → 신규 helper days_ago_jst_as_utc_naive(days) 권장
        - Rolling 24h × N 의도 4건 (discover/beta)
          → now_utc_naive() 직접 교체
  Cat-3 Event ts with "Z" suffix          2건   → datetime.now(timezone.utc).isoformat()
                                                  (food_rescue_scheduler 는 이미 모범 사례)
  Cat-4 JWT exp                           5건   → Strategy 2 단계엔 now_utc_naive() 유지
                                                  (Strategy 3 시점 aware UTC 전환)
  Cat-5 Seed/migration scripts            3건   → 낮은 우선순위
  Cat-6 Fixed-offset JST                  2건   → ZoneInfo("Asia/Tokyo") 통일

전체 113건 - 10건 (주석 reference + helper 자신) = 103건 실 변경.

3-Phase 적용 단계:
  Phase 2a (즉시): Cat-1, Cat-3, Cat-4 안전 일괄 변환 (~80건)
  Phase 2b (의미 분석): Cat-2 rolling window — helper 신규 + 교체 (~17건)
  Phase 2c (후순위): Cat-5 seed + Cat-6 fixed-offset (~5건)

cross-review 요청 5 항목:

A. 분류 6 카테고리 + 변환 패턴 정확성. 특히 Cat-1 의 models.py default_factory
   (29건) 가 datetime.utcnow 직접 참조 → now_utc_naive callable 직접 참조로 
   안전한가? Field(default_factory=now_utc_naive) 패턴이 SQLModel 에서 정상 작동?

B. Rolling window 의도 식별 — Claude 분류:
     stats/insights/super_admin × 17건 = JST calendar day 의도
     discover/beta × 4건 = Rolling 24h × N 의도
   각 파일 사용처 (예: stats.py:38 의 since 는 daily revenue chart 의 N일 전 시작점)
   를 보고 분류가 맞는지 검증. 누락이나 분류 오류?

C. Import-cycle 위험 — models.py 가 utils.time_helpers 를 import 할 때
   utils.time_helpers 는 models 안 import 하지만, SQLModel + Pydantic 의존성 
   체인 안에서 안전한가? backend/database.py 등 다른 의존성도 확인 권장.

D. models.py default_factory 변경 — Strategy 2 (~29건) 에서 진행 vs Strategy 3 
   TIMESTAMPTZ 이행과 함께? 분리 시 partial migration (Python 코드만 aware, 
   DB 컬럼 여전히 naive) 가 안전한가, 위험한가?

E. 필수 smoke/test:
     - JWT 토큰 발급/검증 (login → /api/admin/* → 401 0 건)
     - Event ts 형식 일관성 (`+00:00` vs `Z`, 프론트 Date 파싱 회귀 없는지)
     - 만료 비교 경계 케이스 (subscription/coupon/tabehoudai session)
     - stats rolling window 의미 (Cat-2 변환 후 매출 합계 회귀 없는지)
   누락된 smoke?

응답을 tasks/gpt-pg-dt-migrate-02-review.md 로 저장 + 커밋해주세요.
```

---

## 응답 수신 후 Claude 처리 흐름

GPT 두 응답이 도착하면 Claude 는:

1. **PG-CAP-05 응답**:
   - `tasks/p1-cap05-translate-task-refactor-analysis.md` 끝에 `§"GPT cross-review 반영"` 섹션 추가
   - 신규 발견된 위험은 별도 항목으로 분리
   - 실 코드 패치 (`backend/workers/translate_tasks.py` 3-phase 재구성) 진행
   - 검증 (운영 VM 시뮬레이션) + 커밋

2. **PG-DT-MIGRATE-02 응답**:
   - `tasks/p1-dt-migrate-02-utcnow-classification-analysis.md` 끝에 `§"GPT cross-review 반영"` 섹션 추가
   - 분류 조정 (있으면)
   - Phase 2a 일괄 변환 + 검증 + 커밋 (큰 PR — files ~25개)
   - Phase 2b helper 신규 + 교체
   - Phase 2c 후순위 처리

두 작업 모두 다음 deploy 사이클에 라이브 적용 — orphan 0건 / restart loop 0건 검증된 안정 상태에서 안전하게 진행 가능.
