# 다음 Claude 세션 첫 메시지 (사장님 → Claude 복붙용)

> 이 파일의 §"복붙 시작 메시지" 블록 그대로 새 Claude Code 세션의 첫 메시지로 입력.
> Claude 가 HANDOFF + current-tasks + work-log 를 자동 읽고 컨텍스트 복원.

---

## 복붙 시작 메시지 (이 블록 그대로 복사)

```
이전 세션은 컨텍스트가 너무 길어져서 새 세션으로 이어갑니다.

작업 위치 (메인): D:\myproject\orderservice
브랜치: main (HEAD 25675d3 = stabilize/post-pg-cutover 머지 commit)

이전 세션 (2026-05-24) 진전:
- 자이라 수동 smoke 사이클 8 fix + 정리 단계 (B/C/D/E) + 출시 안정화 (KitchenMode/CAP-05c)
- 17 commit, 7 deploy
- stabilize/post-pg-cutover → main 머지 완료 (25675d3)
- origin/main 푸시 완료
- 운영 PID 648952, healthz 200, ActiveEnter 2026-05-24 13:01 UTC
- predeploy_smoke 8/8 PASS (회귀 자동 차단 #7 db_compat compile + #8 SQLModel enum)
- 출시 차단 요소 0 — 정식 서비스 가동 중

다음 세션 시작 시 진행:

1. tasks/HANDOFF-NEXT-SESSION.md 읽기 (v3 = main 머지 완료 반영)
2. tasks/current-tasks.md 읽기 (출시 후 잔여 카드 + 운영자 카드)
3. 운영 상태 빠른 확인:
   - git log --oneline -5
   - ssh -i ~/.ssh/qraku verejireh@35.213.6.149 "systemctl show qrorder -p MainPID -p NRestarts -p ActiveState; curl -s -m 3 -o /dev/null -w 'healthz=%{http_code}\n' http://127.0.0.1:8003/api/healthz"

그 후 상황 정리해서 보고해주세요. 진행할 작업은 보고 받은 후 결정하겠습니다.

다음 세션 우선 작업 후보 (사장님이 진행 시점 결정):

A. 자이라 수동 smoke 확장 결과 보고 받기 + 회귀 발견 시 hotfix
   - 페이지: 메인, admin login, テーブル管理, KDS, register, 손님 메뉴, 결제
   - 본 사이클에서 자동 검증 못 한 영역 (특히 KDS WS / 결제 사이클)

B. 운영자 작업 (자이라 권한 — 사장님 직접):
   - OPR-13: Cloud SQL ilhae 비번 로테이션 (선택, 옛 비번 무효화됨)
   - OPR-15: pg_stat_statements 활성화 (50매장 트래픽 분석)
   - OPR-07: Alembic baseline stamp
   - OPS-04: GCP Monitoring 디스크 80% 알람

C. 출시 후 사후 처리 (시간 날 때):
   - ENUM-CONSISTENCY: allowlist 16 mismatch 일괄 정리 (큰 변경, frontend sync)
   - CAP-05b: translate task time_limit 운영 모니터링
   - CAP-05d: translate_batch_with_gemini 활용 (6× 성능)
   - DBM-13c/d: docs/deployment.md + docs/architecture.md PG 재작성
   - PWA-ICON-HIRES: 192/512 PNG 생성

참고:
- 마지막 deploy 코드 = main 머지 코드 (별도 재배포 불요)
- backend/.env 의 비번은 git 노출 0, 옛 노출 비번 (onlyJESUS3927~~) 은 2026-05-20 폐기됨
- gen_204 ERR_BLOCKED_BY_CLIENT 는 사용자 브라우저 광고차단기 — 코드 fix 불요
- ENUM-CONSISTENCY allowlist 16건은 predeploy_smoke #8 이 신규 회귀 자동 차단 중
```

---

## 첫 메시지에 추가 정보 넣고 싶을 때

위 블록 끝에 한 줄 추가:
- "자이라가 수동 smoke 해봤는데 [페이지 X] 에서 [에러 Y] 발생" — 즉시 hotfix 진행
- "OPR-13 비번 로테이션 했음, 새 비번은 .env 에 적용 완료" — 다음 작업 결정
- "CAP-05d 진행해줘" — 출시 후 최적화 진행
- "ENUM-CONSISTENCY 정리 시작해줘" — 큰 변경 사이클 진입

## 응급 (운영 장애 발생 시)

위 블록 대신:
```
운영 장애 발생. https://qraku.com/[페이지] 에서 [증상].
ssh -i ~/.ssh/qraku verejireh@35.213.6.149 으로 backend.log tail 확인 + 즉시 진단해주세요.
필요시 git revert + 재배포 진행.
```
