# 자이라 → GPT 전송 프롬프트 — 세션 K (PG-CAP-05d 구현 검증)

**작성일**: 2026-05-25
**용도**: 자이라가 GPT-5.5 chat 에 그대로 복붙해서 sampling cross-review 요청
**전제**: PG-CAP-05d (commit 06efbe3) 구현 완료 + origin/main push
**미실행**: 운영 VM deploy (다음 세션 첫 작업)

이전 세션 F (PG-CAP-05) 의 follow-up. 세션 F 분석은 `tasks/gpt-pg-cap05-review.md` §C 끝에서
"Consider a follow-up task to use `translate_batch_with_gemini` or a dedicated batch helper
to reduce API calls" 권고했음. 본 변경이 그 권고를 실행.

---

## 자이라가 GPT 에 보낼 메시지

```text
Claude 가 PG-CAP-05d (commit 06efbe3) — translate_menu worker 의 name+description 다국어
번역을 단일 Gemini batch call 로 통합 구현했습니다. 이전 세션 F (gpt-pg-cap05-review.md)
§C 권고의 후속.

배경:
- 기존 translate_menu Phase 2 는 LANGS × fields = 3 × 2 = 6 calls (name + description 분리,
  lang 별 별도 호출).
- PG-CAP-05d 가 translate_menu_fields_batch 신규 helper 로 1 call 에 처리 — ~6× API 호출
  감소 (latency 도 비례 감소 예상).
- 옵션 (group_name + choice names) 은 JSON 구조 복잡 + 빈도 낮아 기존 translate_text 유지.

검토 대상 파일 (commit 06efbe3, push 완료, deploy 전):

핵심 변경:
- backend/utils/translation.py
  · translate_menu_fields_batch 신규 helper
  · 기존 translate_batch_with_gemini (admin endpoint 전용) 와 의도적으로 분리:
    - 본 helper 는 JA 원문 rewrite 없음 (admin 입력 보존)
    - 응답에 ja 키 없음, target_langs 만 반환
    - strict=True 시 Gemini 실패 → raise (worker retry trigger)
    - 응답 형식 가드 (lang 키 + name/description 필드 존재 확인)

- backend/workers/translate_tasks.py
  · Phase 2 를 batch 호출로 전환
  · needs_name / needs_desc 계산 후 둘 다 false 면 batch call 회피 (idempotency)
  · missing-field-only write (admin 수동 입력 값 보존) 유지
  · 옵션 부분은 기존 translate_text 호출 유지

관련 참조:
- tasks/gpt-pg-cap05-review.md (세션 F, 본 follow-up 의 권고 출처)
- tasks/p1-cap05-translate-task-refactor-analysis.md (PG-CAP-05 원 분석)
- backend/utils/translation.py 의 기존 translate_batch_with_gemini (비교용)
- backend/utils/translation.py 의 기존 translate_text (옵션 부분 유지 이유 비교용)

검증 요청 5 항목:

A. Gemini batch call 응답 신뢰성
   translate_menu_fields_batch 의 응답 가드:
   ```python
   for lang in target_langs:
       if lang not in result_json:
           raise ValueError(...)
       entry = result_json[lang]
       if not isinstance(entry, dict) or "name" not in entry or "description" not in entry:
           raise ValueError(...)
   ```
   - Gemini 가 잘못된 JSON / 일부 lang 누락 / extra lang 포함 등 응답 시 동작은?
     (strict=True 면 raise → worker retry; strict=False 면 원본 fallback)
   - description_ja 가 빈 문자열일 때 Gemini 가 description 필드를 빈 문자열로 안 주고
     생략하거나 "(none)" 같은 문자열로 줄 위험은?

B. Token budget / 응답 truncation
   옵션 풍부 메뉴는 옵션이 별도라 영향 없지만, name + description 이 매우 길어도 1 call
   에 처리. Gemini 2.5-pro 의 output token limit 안에서 안전한지?
   - 최악 케이스 추정: name 100자 + description 500자 × 3 langs = ~1800자 + JSON overhead
   - 평균 / 95th percentile latency 변화 예상?
   - retry / time_limit (60s) 와의 상호작용?

C. JA 원문 보존 보장
   prompt 가 명시적으로 "Do NOT rewrite or refine the Japanese" 라고 지시하지만,
   Gemini 가 prompt 무시하고 JA 를 살짝 다듬어 반환할 수 있음. 본 helper 는 JA 응답을
   사용 안 하지만:
   - prompt 의 견고성 (Gemini 가 정말 지시 따르는지)?
   - 더 안전한 prompt 패턴 (예: "JA original is read-only, do NOT include in response")?
   - 응답 검증에 JA 비교 단계 추가 필요한가?

D. 옵션 부분 batch 미적용 의사결정
   현재 옵션은 group 당 (group_name + N choices) × 3 langs = (1+N) × 3 calls (group 별
   for loop 안에 lang 별 translate_text 호출). 옵션 풍부 메뉴 (5 groups × 5 choices) 면
   여전히 ~90 calls.
   - 옵션도 batch 화하면 어떤 패턴이 안전한가? (group 별 batch / 전체 batch / 청크 batch)
   - PG-CAP-05b 의 time_limit 모니터링 임계 (30s WARN, 45s CRITICAL) 를 본 변경 이후에도
     유효한가? (옵션 + name+desc 합쳐 빈도/latency 변화)

E. Deploy 안전성 + 회귀 시나리오
   본 변경은 Phase 2 외부 API 호출만 영향. Phase 1/3 의 DB 액세스 패턴 동일.
   - rollback 시나리오: 본 commit (06efbe3) 만 revert 하면 translate_text 경로 복귀.
     PG-CAP-05c (strict mode, 49b2f5f) 와의 상호작용으로 회귀 가능성?
   - deploy 후 첫 메뉴 생성 시 검증 포인트는? (WS TRANSLATION_COMPLETED 이벤트 + 실제
     번역 결과 화면 표시)
   - 회귀 발견 시 hotfix vs full revert 판단 기준?

응답을 tasks/gpt-pg-cap05d-review.md 로 저장 + 커밋해주세요.
응답 즉시 디스크 저장 + 커밋 명시 (이전 회차 교훈).
```

---

## 응답 수신 후 Claude 처리 흐름

GPT 응답이 도착하면 Claude 는:

1. `tasks/gpt-pg-cap05d-review.md` 로 저장 + 커밋
2. **A (응답 신뢰성)** — 응답 가드 강화 (예: 빈 문자열 normalize) 필요 시 fix
3. **B (token budget)** — Gemini 응답 길이 측정 코드 추가 (PG-CAP-05b 모니터링 연계)
4. **C (JA 보존)** — prompt 보강 또는 응답 검증 단계 추가
5. **D (옵션 batch)** — PG-CAP-05e 카드로 분리 (옵션 batch 화)
6. **E (deploy)** — must-fix 없으면 deploy 진행, must-fix 있으면 fix 후 deploy

---

## 후속 작업 (응답과 무관하게 진행 가능)

- 운영 VM deploy (다음 세션 첫 작업, HANDOFF v5 §"v5 첫 우선 작업")
- 자이라 수동 smoke: 메뉴 신규 생성 → 번역 latency 측정 (PG-CAP-05d 효과 확인)
- PG-CAP-05b 모니터링 로그 grep (deploy 후 1주일 — translate_menu WARN/CRITICAL 빈도)
