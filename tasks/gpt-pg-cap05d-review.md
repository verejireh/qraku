# PG-CAP-05d translate_menu batch cross-review

Review target: `06efbe3` (`translate_menu` name+description Gemini batch)
Date: 2026-05-26 JST

## Executive summary

`translate_menu_fields_batch()`로 name/description을 6 calls에서 1 call로 줄인 방향은 타당합니다. Phase 2가 DB session 밖에서 실행되고, Phase 3의 stale source guard와 missing-field-only write도 유지되어 PG-CAP-05의 핵심 안전성은 깨지지 않았습니다.

다만 운영 배포 후에는 아래 3개를 우선 봐야 합니다.

1. **P1 - Gemini JSON schema 강제 미사용**: 현재는 prompt-only JSON + 사후 가드입니다. malformed JSON은 retry로 회복되지만, schema mode를 쓰면 실패율과 retry 비용을 더 줄일 수 있습니다.
2. **P1 - options strict 누락/삼킴**: `translate_text(..., strict=True)`는 Gemini API 예외에는 raise하지만, API key 누락 시 여전히 원문을 반환합니다. 또 `_translate_options()`는 예외를 잡고 `None`을 반환해 actor retry를 막습니다.
3. **P2 - options-only 재번역 skip**: Phase 1의 `names_done and descs_done` early return은 options 변경만 있는 경우 worker가 options 번역을 하지 못하게 할 수 있습니다. 이는 06efbe3의 신규 회귀라기보다 기존 구조의 잔여 부채입니다.

rollback은 `06efbe3`만 revert하면 name/description이 기존 `translate_text` 다중 호출 경로로 돌아가므로 기능적으로 안전합니다. PG-CAP-05c strict mode와 충돌하지 않습니다. 다만 성능/latency가 다시 악화됩니다.

## A. Gemini batch call 응답 신뢰성

판정: **기본 가드는 합리적이지만 prompt-only JSON 의존은 P1 리스크입니다.**

현재 구현:

- `translate_menu_fields_batch()`는 markdown fence를 제거한 뒤 `json.loads()`합니다. (`backend/utils/translation.py:122`-`:134`)
- `target_langs`의 각 lang key와 `name`/`description` 필드 존재를 검증합니다. (`backend/utils/translation.py:137`-`:143`)
- `strict=True`이면 Gemini 오류나 malformed response가 actor retry로 이어집니다. (`backend/utils/translation.py:146`)
- extra lang은 무시됩니다. worker는 `LANGS`만 읽습니다.

좋은 점:

- missing lang, malformed JSON, 필드 누락은 조용히 잘못 저장되지 않고 retry됩니다.
- strict=False fallback은 admin endpoint 등 비critical 경로에서 기존 호환 동작으로 쓸 수 있습니다.

보완 권고:

- 필드 존재뿐 아니라 타입도 확인하세요. 지금은 `{"name": [], "description": {}}`도 통과하고, 이후 SQLAlchemy가 문자열 컬럼에 비문자 값을 받을 수 있습니다.
- 값 trimming과 `None` normalize를 helper 내부에서 처리하세요.
- Google Gemini API는 structured output / JSON schema를 공식 지원합니다. prompt-only JSON보다 `response_format`/schema를 쓰는 편이 이 helper 목적에 더 맞습니다. 공식 문서는 structured output이 schema에 맞는 JSON 생성을 위한 기능이라고 설명하고, Gemini 2.5 Pro도 지원 모델에 포함합니다.
  - https://ai.google.dev/gemini-api/docs/structured-output

description empty case:

- `description_ja`가 비어 있으면 prompt는 description field를 empty string으로 요구합니다.
- worker는 `snapshot["description_jp"]`가 false면 description 결과를 쓰지 않습니다. (`backend/workers/translate_tasks.py:164`, `:181`)
- 따라서 Gemini가 `"(none)"`을 번역하거나 임의 description을 반환해도 DB에는 저장되지 않습니다.
- 다만 name만 필요한 경우에도 helper가 description field 존재를 강제하므로, Gemini가 description을 생략하면 name 번역까지 retry됩니다. 운영상 큰 위험은 아니지만 과도하게 엄격합니다. `description_ja`가 없고 `needs_desc=False`이면 description validation을 완화해도 됩니다.

## B. Token budget / 응답 truncation

판정: **token limit 자체는 여유. latency/time_limit는 options가 지배합니다.**

Gemini 2.5 Pro의 공식 모델 문서는 output token limit를 65,536으로 표시합니다.

- https://ai.google.dev/gemini-api/docs/models

사용자 추정치처럼 name 100자 + description 500자 x 3 langs 수준이면 JSON overhead를 포함해도 output token limit에는 매우 여유가 있습니다. 이 변경의 truncation 위험은 낮습니다.

더 중요한 위험은 latency와 retry 비용입니다.

- batch call 1회가 느려지거나 malformed JSON으로 retry되면 name/description 전체가 다시 호출됩니다.
- 그래도 기존 6회 호출보다 평균 latency와 API call 수는 개선될 가능성이 큽니다.
- `time_limit=60_000`에서 여전히 병목은 options입니다. 현재 comment도 options 풍부 메뉴에서 75 calls 이상 가능하다고 보고 있습니다. (`backend/workers/translate_tasks.py:106`-`:117`)

권장:

- Gemini call에 명시적 request timeout을 줄 수 있는지 SDK 레벨에서 확인해 설정하세요. actor `time_limit`에만 의존하면 worker kill 시 어느 API call에서 멈췄는지 관측이 약합니다.
- `translate_menu WARN/CRITICAL` 로그를 배포 후 24시간 봐야 합니다. name/desc batch 후에도 CRITICAL이 남으면 거의 options 문제입니다.
- structured output을 쓰면 malformed JSON retry 비용을 줄일 수 있습니다.

## C. JA 원문 보존

판정: **현재 DB write path 기준으로 JA 원문 변경 위험은 낮습니다.**

근거:

- helper prompt는 “Do NOT rewrite or refine the Japanese”를 명시합니다.
- helper 응답 구조에는 `ja` key를 요구하지 않습니다.
- worker는 batch 응답에서 `ko/en/zh`만 읽고 `name_jp`/`description_jp`에는 쓰지 않습니다. (`backend/workers/translate_tasks.py:172`-`:184`)
- Phase 3에서 원문이 바뀌었으면 stale write를 drop합니다. (`backend/workers/translate_tasks.py:210`-`:218`)

prompt 개선:

- “JA original is read-only context. Do not include a `ja` key in the response.”를 추가하면 의도가 더 선명합니다.
- JSON schema에서 allowed top-level keys를 target langs로 제한하고 `additionalProperties: false`를 쓰는 형태가 가장 낫습니다. 다만 Gemini schema subset이 모든 JSON Schema 기능을 완전히 강제하지 않을 수 있으므로 사후 가드는 유지해야 합니다.

실패 시나리오:

- Gemini가 `ja`를 반환해도 현재 worker는 무시하므로 직접 회귀는 없습니다.
- Gemini가 target lang name에 일본어 원문을 그대로 넣는 품질 실패는 현재 가드로 잡지 못합니다. 자동 판별은 오탐이 많으므로, 운영에서는 “translation equals source” 비율을 metric으로 보는 정도가 적절합니다.

## D. options batch 제외의 병목/안전성

판정: **name/desc batch 후 남은 주된 time_limit 리스크는 options입니다. P1/P2.**

현재 구조:

- options는 group name과 choice name마다 `LANGS`별 `translate_text`를 호출합니다. (`backend/workers/translate_tasks.py:75`-`:101`)
- 5 groups x 5 choices면 대략 `(5 group + 25 choices) x 3 = 90` calls입니다.
- `_translate_options()`는 실패 시 exception을 log하고 `None`을 반환합니다. 그러면 actor 전체 retry가 아니라 options write만 skip됩니다. (`backend/workers/translate_tasks.py:102`-`:104`)

중요한 잔여 이슈:

- `translate_text(..., strict=True)`는 API key가 없을 때 raise하지 않고 원문을 반환합니다. (`backend/utils/translation.py:166`-`:168`) 이는 PG-CAP-05c strict 의도와 다릅니다.
- `_translate_options()`가 모든 예외를 삼키므로 transient API 장애가 options만 미번역 상태로 남을 수 있습니다.
- Phase 1에서 `names_done and descs_done`이면 즉시 return합니다. (`backend/workers/translate_tasks.py:134`-`:138`) `menus.py`는 `options` 변경 시 worker를 enqueue하지만 (`backend/routers/menus.py:333`-`:347`), name/description이 이미 모두 차 있으면 options-only 변경은 번역되지 않을 수 있습니다.

권장:

1. 단기 hotfix:
   - `translate_text()`의 no-api-key branch도 `strict=True`이면 raise.
   - `_translate_options()`에서 strict 실패를 삼키지 말고 raise하거나, 최소한 `translation.options_failed` 로그/metric을 남김.
   - early return 조건에 options 번역 완료 여부를 포함.

2. PG-CAP-05e:
   - options를 group 단위 batch로 묶으세요. 예: 한 group의 `group_name` + choices 전체를 3개 언어로 한 번에 번역.
   - 전체 menu options를 한 call로 묶는 것도 가능하지만 JSON 구조가 깊어 malformed 시 전체 retry가 커집니다. group 단위가 장애 격리에 더 좋습니다.
   - schema는 `group_translation` + `choices[index].translations` 형태로 index 기반 매칭을 권장합니다. choice name 기반 매칭은 중복 choice 이름에서 깨질 수 있습니다.

## E. Deploy 모니터링 + revert 전략

운영 모니터링 우선순위:

1. `translate_menu CRITICAL` / Dramatiq time limit
   - name/desc batch 후에도 남으면 options 병목입니다.

2. Gemini batch parse/shape 실패
   - 로그 키워드: `Gemini translate_menu_fields_batch Error`, `Missing lang`, `Malformed entry`, `JSONDecodeError`.

3. worker retry/dead-letter
   - `max_retries=3` 이후 실패가 쌓이면 malformed JSON, API key, quota/rate limit을 의심해야 합니다.

4. 번역 완료 이벤트
   - `TRANSLATION_COMPLETED`가 생성/수정 메뉴 수 대비 급감하면 Phase 2 실패 또는 Phase 3 stale drop이 늘어난 것입니다. (`backend/workers/translate_tasks.py:53`)

5. 원문 반환 품질 metric
   - `name_ko/en/zh == name_jp` 또는 `description_* == description_jp` 비율. 단 고유명사/카타카나 메뉴는 정상일 수 있어 alert는 낮은 severity로 두세요.

rollback:

- `git revert 06efbe3`은 name/description을 기존 `translate_text` 반복 호출 경로로 되돌립니다.
- PG-CAP-05c strict mode commit과 논리 충돌은 없습니다. 기존 경로도 `translate_text(..., strict=True)`를 호출합니다.
- 단, `translate_text()`의 API key 누락 strict 미동작은 revert해도 남는 기존 문제입니다.
- rollback 후 latency/API call 수가 다시 6배 가까이 늘 수 있으므로, 장애가 “batch response parsing/shape”에 한정되면 full revert보다 structured output hotfix가 더 낫습니다.

hotfix vs full revert 기준:

- **hotfix 우선**: malformed JSON retry가 간헐적, options time_limit이 주원인, 원문 보존 우려만 있는 경우.
- **full revert 후보**: batch helper가 지속적으로 JSON parse 실패해 신규/수정 메뉴 번역이 전반적으로 dead-letter 되는 경우, Gemini SDK config 변경이 즉시 어려운 경우.

## Suggested follow-ups

1. `translate_menu_fields_batch()`에 Gemini structured output schema 적용.
2. helper response validation을 `str` 타입 + trim + empty normalize까지 강화.
3. `translate_text(strict=True)` no-api-key branch raise 처리.
4. `_translate_options()` 실패 정책 결정: retry할지, partial skip + metric으로 둘지 명확화.
5. options group batch를 PG-CAP-05e로 분리 구현.
