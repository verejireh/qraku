# 다음 Claude 세션 첫 메시지 (자이라 → Claude 복붙용)

> 이 파일의 §"복붙 시작 메시지" 블록 그대로 새 Claude Code 세션의 첫 메시지로 입력.
> Claude 가 HANDOFF + current-tasks 를 자동 읽고 컨텍스트 복원.

---

## 복붙 시작 메시지 (이 블록 그대로 복사)

```
이전 세션은 컨텍스트가 너무 길어져서 새 세션으로 이어갑니다.

작업 위치: D:\myproject\orderservice\.claude\worktrees\stabilize-post-pg-cutover
브랜치: stabilize/post-pg-cutover

PG 컷오버 위험 감사 사이클 + GPT 4 세션 cross-review + Deploy 성공으로 이전 세션이 종료됨.
모든 P0/P1 큰 항목 처리 완료. Production 안정 가동 중.

다음 세션 시작 시 진행:

1. tasks/HANDOFF-NEXT-SESSION.md 읽기 (이전 세션의 핵심 진전 + 다음 작업 후보 + 운영 상태)
2. tasks/current-tasks.md 읽기 (살아있는 카드 + 후속)
3. 운영 상태 빠른 확인:
   - git log --oneline -5
   - ssh -i ~/.ssh/qraku verejireh@35.213.6.149 "systemctl show qrorder -p NRestarts -p MainPID; curl -s -m 3 -o /dev/null -w 'healthz=%{http_code}\n' http://127.0.0.1:8003/api/healthz"

그 후 상황 정리해서 보고해주세요. 진행할 작업은 보고 받은 후 결정하겠습니다.

참고:
- 이전 세션 마지막 commit: 90c26a3 (PG-DT-MIGRATE-02c — Cat-5 seed/legacy 3건 cleanup)
- 운영 VM 마지막 deploy: 2026-05-23 15:32 UTC (자정 직후 JST), 무사고 가동 중
- 자이라 수동 smoke 미확인 — admin login / KDS / stats today+monthly / 만료 boundary 검증 권장
```

---

## 메시지 작성 의도

위 메시지는 다음을 트리거:

1. **HANDOFF + current-tasks 자동 읽기** — Claude 가 5분 내 컨텍스트 복원
2. **운영 상태 확인 명령 명시** — Claude 가 추측 대신 실데이터로 검증
3. **"보고 후 결정"** — Claude 가 멋대로 작업 진행 안 함 + 사용자 의사결정 권한 보존
4. **수동 smoke 환기** — deploy 후 회귀 검증 잊지 않도록

---

## 만약 더 짧게 보내고 싶다면 (간소 버전)

```
이전 세션 컨텍스트 종료. tasks/HANDOFF-NEXT-SESSION.md 읽고 상황 보고해주세요.
작업 위치는 .claude/worktrees/stabilize-post-pg-cutover, 브랜치 stabilize/post-pg-cutover.
```

위 1줄 버전도 동일 효과. Claude 가 HANDOFF 안에서 모든 컨텍스트 + 명령 + 후보 작업을 발견.

---

## 보너스 — 특정 작업 즉시 진행하고 싶을 때

수동 smoke 확인 후 회귀 없다는 가정으로, 곧바로 다음 작업 지정 가능:

| 의도 | 첫 메시지 추가 |
|---|---|
| 안정화 후속 | "PG-CAP-05b/c/d 분석 진행해주세요" |
| 백오피스 보강 | "PG-DT-DG-05 (raw SQL grep + frontend target_date 검증) 부터" |
| Housekeeping | "DBM-13c (docs/deployment.md PG 재작성) 부터" |
| 대규모 후속 | "OPR-07 Alembic baseline 절차 + Strategy 3 (TIMESTAMPTZ) 전체 계획" |

기본 메시지 (위 첫 번째 블록) + 위 한 줄 추가하면 됨.
