# GPT-5.5 PG 컷오버 위험 감사 교차 검토 지시서

## 사용 방법

본 지시서는 GPT-5.5 (또는 다른 독립 모델) 에게 **별도 세션** 으로 보내는 프롬프트.
Claude 가 작성한 [`pg-cutover-risk-audit.md`](./pg-cutover-risk-audit.md) 를 입력으로 받아 평가한다.

GPT-5.5 는 코드에 직접 접근 못 함 → 첨부 마크다운 만 읽고 답변.

---

## 프롬프트 (그대로 복사해서 GPT-5.5 에게 전송)

```
당신은 PostgreSQL + FastAPI + SQLAlchemy/SQLModel + asyncpg 운영 경험이 풍부한 시니어 백엔드 엔지니어입니다.

다른 모델 (Claude Sonnet 4.6) 이 MySQL → PostgreSQL 컷오버 후의 잠재 위험을
감사하고 첨부 문서를 작성했습니다. 그 작업의 **독립적 2nd-opinion** 을 요청합니다.

배경:
- 본 시스템은 QR 기반 레스토랑 주문 SaaS. 베치헤드 50개 식당.
- 컷오버 2026-05-19 완료, MySQL 정리 2026-06-02 예정.
- 본 감사는 컷오버 후 첫 회귀 검증 사이클 (STB) 의 일환.

요청 형식:
첨부 문서의 17개 위험 항목 각각에 대해 아래 4개를 한 문단으로 답변:

  1. **동의 여부**: Claude 의 위험 가설이 타당한가? (동의 / 부분 동의 / 반박)
  2. **추가 위험**: Claude 가 놓친 측면이 있는가? (없으면 "없음")
  3. **조치 우선순위 재평가**: Claude 의 P0/P1/P2 분류가 적절한가?
     특히 P0 → P1 강등 또는 P1 → P0 승격 후보.
  4. **구체적 수정 패치**: 핵심 항목 (#1, #2, #7) 에 대해 코드 수정 패치를 추정해서 제시.

특별 검토 요청 사항:
- 항목 #1 (KitchenMode enum/DB 불일치): SQLModel + Enum 의 표준 패턴은? `use_enum_values=True` 옵션?
- 항목 #2 (DATETIME 키워드): asyncpg / SQLAlchemy 가 `DATETIME` 을 PG TIMESTAMP 로 자동 변환할 가능성?
  (Claude 는 PG planner 가 거부한다고 가정 — 실제 동작 확인 요청)
- 항목 #5 (PostGIS GIST 인덱스 매치): 함수형 인덱스의 표현식 매치 규칙. WHERE 부분 인덱스가
  쿼리 predicate 와 같지 않으면 정말 인덱스 미사용인가?
- 항목 #7 (datetime 혼용): timezone-aware 로 전 코드 마이그레이션의 점진적 전략 제안.
- 항목 #8 (init_db race): 다중 워커 환경에서 SQLAlchemy `engine.begin()` + DDL 의 격리 수준.

추가로 답변 끝에:
- **종합 위험도 점수** (0~100): Claude 평가 vs 본인 평가
- **출시 게이트 권고**: 베치헤드 50개 식당 출시 전 반드시 해결할 P0 항목 최종 목록
- **Claude 가 over-engineering 하거나 과민반응한 항목**: 있다면 명시

답변 분량 제한 없음. 각 항목 2~5 문장 권장.
```

---

## 후속 처리

GPT-5.5 답변을 받으면 (자이라가 채팅으로 받음):

1. **자이라**: 답변을 `tasks/gpt-pg-risk-review.md` 로 저장
2. **Claude 후속 세션**: GPT 응답을 읽고 P0 항목 코드 수정 (#1, #2, #3, #4 — 1~2 시간)
3. **운영자**: 검증 체크리스트 (pg-cutover-risk-audit.md §끝부분) 8개 명령 실행 + 결과 보고
4. **자이라**: 결과 종합 → STB-08x 핫픽스 카드 추가 또는 신규 사이클 분리 결정

---

## 다른 모델 후보

- **GPT-5.5** (OpenAI 최신): 1차 권장 — 폭넓은 PG 운영 지식
- **Gemini 2.5 Pro** (Google): 보완 — Cloud SQL 특이사항 강함
- **DeepSeek-V3.2** / **Qwen3** : 무료, 한국어 OK, 백업 옵션

세 모델 모두에게 동일 프롬프트를 보내고 답변을 교차하면 신뢰도 더 높음 (단, 토큰 비용).
