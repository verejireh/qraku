# GPT-5.5 PG 컷오버 운영 검증 결과 교차 검토 지시서

## 사용 방법

본 지시서는 GPT-5.5 (또는 다른 독립 모델) 에게 **별도 세션** 으로 보내는 프롬프트.

Claude 가 운영 VM에서 직접 실행한 검증 결과 [`pg-cutover-verification-results.md`](./pg-cutover-verification-results.md) + 선행 감사 [`pg-cutover-risk-audit.md`](./pg-cutover-risk-audit.md) 를 입력으로 받아 평가한다.

GPT-5.5 는 운영 VM 에 직접 접근 못 함 → 첨부 마크다운 만 읽고 답변.

---

## 프롬프트 (그대로 복사해서 GPT-5.5 에게 전송)

```
당신은 PostgreSQL + FastAPI + systemd + Cloud SQL 운영 경험이 풍부한
시니어 SRE 입니다.

다른 모델 (Claude Opus 4.7) 이 MySQL → PostgreSQL 컷오버 후의 17개 잠재
위험 항목을 감사 (pg-cutover-risk-audit.md) 하고, P0 6개를 코드 수정한 후,
운영 VM 에 SSH 접속해서 8개 검증 명령을 직접 실행 (pg-cutover-
verification-results.md) 했습니다.

그 과정에서 부가적으로 **qrorder 서비스 restart loop (NRestarts=413)**
를 발견했고, orphan uvicorn 프로세스 (PID 290514, 87분 가동) 를 SIGTERM 으로
종료해서 해소했습니다.

이 검증 작업의 **독립적 2nd-opinion** 을 요청합니다.

==============================
검증 결과의 신뢰성 평가
==============================

요청 형식: 검증 결과 문서의 각 CHECK 1~8 에 대해 아래 3개를 답변:

  1. **검증 충분성**: Claude 가 실행한 SQL/명령이 해당 P0 항목을 "닫혔다" 고
     선언하기에 충분한가? 추가로 확인해야 할 쿼리/관점이 있는가?

  2. **결과 해석 정확성**: Claude 의 결과 해석에 오류가 있는가?
     (특히 CHECK 4 의 "store 6개 모두 lat/lng NULL 인데도 plan 자체는
     인덱스 매치 → P0 #5 닫힘" 의 추론 — 실제 데이터 0건인 상태에서
     planner 의 인덱스 매치가 검증으로 충분한가?)

  3. **누락된 검증 항목**: 17개 위험 항목 중 운영 VM 에서 추가로 확인해야 할
     항목이 있는가? (예: P1 #7 datetime 혼용 — 운영 DB 의 실제 timezone
     쿼리로 검증 가능한가?)

==============================
qrorder restart loop 사후 분석
==============================

특별 검토 요청:

A. **근본 원인 가설 검증**:
   Claude 는 87분 가동 중인 orphan uvicorn (PPID=1, cgroup 미확인) 의
   발생 메커니즘을 "deploy.py 의 setup_server.sh 가 systemctl restart
   시점에 uvicorn graceful shutdown 이 RestartSec=5 보다 길어서 시작-종료
   순서가 꼬임" 또는 "setup 스크립트가 별도 nohup uvicorn 을 띄우고 종료
   추적 못 함" 으로 추정. 이 가설이 타당한가? 다른 더 유력한 메커니즘이
   있는가? (특히 SIGTERM 처리 / Python asyncio shutdown / uvicorn lifespan
   shutdown 의 알려진 함정)

B. **재발 방지 systemd unit 검토**:
   Claude 가 제안한 unit 개선안:
     - `After=cloud-sql-proxy.service` 추가
     - `ExecStartPre=/bin/bash -c 'fuser -k 8003/tcp || true'`
     - `TimeoutStopSec=10`
     - `KillMode=mixed`
   이 안이 다음 시나리오에서 안전한가?
   (1) 일반 deploy.py 재시작 시 — orphan 발생 안 함
   (2) 코드 버그로 uvicorn shutdown 이 hang 할 때 — TimeoutStopSec 후 SIGKILL
   (3) systemd-mediated 재시작 vs deploy 스크립트 재시작 의 충돌

C. **유사 패턴의 다른 서비스 점검**:
   같은 VM 에서 cloud-sql-proxy, redis 등 다른 systemd 서비스도 동일
   restart loop / orphan 패턴 가능성? Claude 는 qrorder 만 확인.

==============================
검증 우선순위 재평가
==============================

Claude 가 P1 (출시 후 D+7) 으로 분류한 항목 중 **이번 restart loop 발견을
근거로 P0 로 승격해야 할 것**이 있는가?

특히:
  - P1 #8 (init_db() 매 부팅 231개 ALTER + 다중 워커 race): restart loop
    상황에서 매 7~13초 마다 ALTER 가 재실행됐다는 점 → 데이터 무결성에
    영향?
  - P1 #9 (uvicorn worker 수 미지정): unit 에 --workers 없음 = 단일
    프로세스. orphan 단일 vs 다중 worker 환경에서의 거동 차이?

==============================
운영자 (자이라) 액션 우선순위
==============================

Claude 가 제시한 4개 운영자 카드:
  - OPR-15 (신규): pg_stat_statements 활성화
  - OPR-07: alembic baseline stamp
  - OPR-13: ilhae 비번 로테이션
  - OPS-04: GCP Monitoring 디스크 80% 알람

베치헤드 출시(50개 매장, 2주 이내 예정) 관점에서 위 4개의 우선순위 +
누락된 항목 (있다면) 을 제안.

==============================
답변 형식
==============================

각 섹션 답변 끝에:
  - **종합 신뢰성 점수** (0~100): Claude 검증 작업의 신뢰성
  - **추가 SSH 명령 권고**: 운영자가 1회 더 실행하면 좋을 명령 (10개 이내)
  - **출시 게이트 최종 권고**: 베치헤드 50개 매장 출시 가능 여부 + 차단 사유

답변 분량 제한 없음. 각 CHECK 항목 2~5 문장 권장.
```

---

## 후속 처리

GPT-5.5 답변을 받으면 (자이라가 채팅으로 받음):

1. **자이라**: 답변을 `tasks/gpt-pg-verification-review.md` 로 저장 (이번에는 반드시 디스크에 저장 + 커밋)
2. **Claude 후속 세션**:
   - GPT 응답 읽고 추가 운영 명령 (있으면) 실행
   - P0/P1 재분류 (특히 init_db race / uvicorn worker)
   - systemd unit 개선안 PR
3. **자이라**: 운영자 카드 4종 + GPT 가 추가 권고한 항목 처리

---

## 입력 첨부 파일

GPT-5.5 에게 다음 3개 파일을 첨부 (또는 본문 붙여넣기):

1. [`pg-cutover-risk-audit.md`](./pg-cutover-risk-audit.md) — 17개 위험 항목 원본
2. [`pg-cutover-verification-results.md`](./pg-cutover-verification-results.md) — 운영 VM 검증 결과
3. (선택) [`gpt-pg-risk-review-instructions.md`](./gpt-pg-risk-review-instructions.md) — 이전 cross-review 지시서

---

## 다른 모델 후보

이전 cross-review 응답이 디스크에 저장되지 않은 (혹은 컴 다운으로 유실) 교훈 →
**이번에는 응답을 받자마자 `tasks/gpt-pg-verification-review.md` 로 즉시 저장 후 커밋**.

- **GPT-5.5** (OpenAI): 1차 권장
- **Gemini 2.5 Pro** (Google): 보완 — systemd / Cloud SQL 운영 특이사항
- **DeepSeek-V3.2** / **Qwen3**: 무료 백업

세 모델 동일 프롬프트 + 응답 비교 시 신뢰도 ↑.
