# 자이라 → GPT 전송 프롬프트 — 세션 H (PG-DT-MIGRATE-02a 구현 검증)

**작성일**: 2026-05-22
**용도**: 자이라가 GPT chat 에 그대로 복붙해서 sampling cross-review 요청
**전제**: PG-DT-MIGRATE-02a (commit eeab9e9) 구현 완료 + push

이전 세션 F/G 가 분석 doc 검토였다면, 세션 H 는 **실 구현 결과의 sampling 검증** + 운영 smoke 우선순위 결정.

---

## 자이라가 GPT 에 보낼 메시지

```text
Claude 가 PG-DT-MIGRATE-02a (commit eeab9e9) 에서 datetime.utcnow 95 건 / 21 파일을
일괄 변환 완료했습니다. 자동화 스크립트로 진행했고, sampling cross-review 부탁드립니다.

배경:
P1 #7 Strategy 2 단계 마지막. GPT 세션 G review (gpt-pg-dt-migrate-02-review.md) 의
must-fix 3 항목 모두 prep commit (66bc7c0) 에서 반영됨:
  - tzdata 의존성 추가 + JST fallback
  - grep 패턴 수정 (괄호 없이 `datetime\.utcnow`)
  - rolling window 정밀화 + loyalty JST month 버그 (fa47244)
운영 VM smoke 결과 backend compileall + models import + Store.model_fields 모두 정상.

검토 대상 파일 (commit eeab9e9, push 완료):

핵심 변환:
- backend/models.py
  - Field(default_factory=datetime.utcnow) × 29 → default_factory=now_utc_naive
  - Field(default_factory=lambda: datetime.utcnow() + timedelta(days=60))
    → default_factory=lambda: now_utc_naive() + timedelta(days=60)  (subscription_expires_at)
  - from utils.time_helpers import now_utc_naive 추가
- backend/utils/jwt.py
  - 4 곳 (admin_token / super_admin_token / staff_token exp + subscription 비교)
    datetime.utcnow() → now_utc_naive()
- backend/utils/events.py
  - "ts": datetime.utcnow().isoformat() + "Z"
    → "ts": datetime.now(timezone.utc).isoformat()
  - from datetime import timezone 추가
- backend/routers/orders.py (× 11), register.py (× 3), billing.py (× 4),
  tabehoudai.py (× 4), tables.py (× 4), takeout.py (× 3), stores.py (× 4),
  super_admin.py (× 5), 그 외 ~30 위치

관련 참조:
- tasks/p1-dt-migrate-02-utcnow-classification-analysis.md (분석 doc, 갱신됨)
- tasks/gpt-pg-dt-migrate-02-review.md (GPT 세션 G review)
- backend/utils/time_helpers.py (now_utc_naive 정의)

검증 요청 5 항목:

A. JWT 호환성
   utils/jwt.py 의 4 곳:
   ```
   "exp": now_utc_naive() + timedelta(hours=ADMIN_TOKEN_EXPIRE_HOURS)
   if now_utc_naive() <= store.subscription_expires_at: ...
   ```
   PyJWT 가 naive datetime 의 `.timestamp()` 를 호출해서 POSIX 초로 변환하는데,
   `now_utc_naive()` (= `datetime.now(timezone.utc).replace(tzinfo=None)`) 가
   `datetime.utcnow()` 와 동일한 naive UTC instant 를 반환하므로 semantic 동일.
   회귀 가능성 평가 + JWT smoke 자동화 방법?

B. SQLModel default_factory 안전성
   models.py 의 29 컬럼이 `Field(default_factory=now_utc_naive)` 로 변경됨.
   특수 케이스:
     1. Optional[datetime] = Field(default_factory=now_utc_naive)
     2. lambda: now_utc_naive() + timedelta(days=60)  (subscription_expires_at)
     3. Relationship 와 함께 정의된 컬럼 (last_visit on GuestProfile 등)
   `Store.model_fields` 로딩 + `Store(name=..., owner_id=...)` 인스턴스 생성 시
   default value 정상 생성되는지 검증 방법?

C. Event ts wire format 회귀
   utils/events.py 의 wire format 변경:
     "2026-05-22T03:00:00Z"  →  "2026-05-22T03:00:00+00:00"
   frontend grep 결과 Z suffix 의존 0 건 확인 (보고서에 명시).
   추가 검증할 곳:
     - WS payload (KDS / 손님 receipt JS Date() 파싱 회귀 없는지)
     - eventlog 테이블의 ts 컬럼 — DB 저장 시점에는 Python str 그대로 들어가니
       비교 시점에 형식 깨지는지 확인
     - workers/translate_tasks.py 도 같은 변환 (97713a7 에서 처리됨)
   누락 가능한 검증 포인트?

D. 운영 smoke 우선순위
   PG-DT-MIGRATE-02 + PG-CAP-05 두 큰 변경의 라이브 적용 전 반드시 통과해야 할
   smoke 우선순위. GPT 세션 G 가 6 항목 (dependency/import / grep / JWT /
   event ts / expiry / reporting regression) 제시. 그 중:
     - 다음 deploy 전 자동화 가능한 것은? (1 명령으로 grep + py_compile + import 등)
     - 다음 deploy 후 수동 검증 필수는? (실 사장님 admin login + stats 페이지 등)
     - 회귀 위험 가장 큰 항목 top 3?

E. Deploy 일정 분리 여부
   현재 stabilize/post-pg-cutover 브랜치에 누적된 큰 변경:
     - PG-CAP-05 IMPL (translate_menu 3-phase + update_menu re-enqueue)
     - PG-DT-MIGRATE-02 prep + 02b + 02a
     - 부수 변경 (db_compat JST, WS dead conn cleanup, pool_recycle 등)
   한 deploy 로 한꺼번에 갈지, 분리해서 단계 적용할지?
   분리한다면 어떤 단위로? (예: datetime 만 먼저, translate_menu 는 별도)

응답을 tasks/gpt-pg-dt-migrate-02a-impl-review.md 로 저장 + 커밋해주세요.
이번에도 응답 즉시 디스크 저장 + 커밋 명시 (이전 회차 교훈).
```

---

## 응답 수신 후 Claude 처리 흐름

GPT 응답이 도착하면 Claude 는:

1. `tasks/p1-dt-migrate-02-utcnow-classification-analysis.md` 끝에 §"02a 구현 GPT cross-review 반영" 섹션 추가
2. **A (JWT smoke)** — 운영 VM 에서 admin/super_admin/staff token 발급 → decode → expiry 비교 자동화
3. **B (SQLModel default_factory)** — models 인스턴스 생성 smoke 추가
4. **C (event ts)** — WS payload 형식 확인 (필요 시 `.replace("+00:00", "Z")` 보정 옵션)
5. **D (운영 smoke 우선순위)** — 다음 deploy 전 사전 검증 스크립트 1 개 작성
6. **E (deploy 분리)** — GPT 권고대로 한 deploy / 분할 결정

---

## 후속 작업 (응답과 무관하게 진행 가능)

- PG-DT-DG-04 분석 doc — 핫패스 `date_only(...) == today` → UTC range 전환
- PG-DT-MIGRATE-02c — Cat-5 seed scripts (~3건, 운영 무영향)
- PG-CAP-05b/c/d — time_limit / strict mode / batch (translate_menu 후속)
