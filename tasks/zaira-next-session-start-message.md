# 다음 Claude 세션 첫 메시지 (사장님 → Claude 복붙용)

> 이 파일의 §"복붙 시작 메시지" 블록 그대로 새 Claude Code 세션의 첫 메시지로 입력.
> Claude 가 HANDOFF + current-tasks + work-log 를 자동 읽고 컨텍스트 복원.

---

## 복붙 시작 메시지 (이 블록 그대로 복사)

```
이전 세션을 종료하고 새 세션으로 이어갑니다.

작업 위치 (메인): D:\myproject\orderservice
origin/main HEAD: 5fda79a (v5 최종 — GPT 점검 prompt 포함)
⚠️ 로컬 main worktree 는 아직 1164187 — git pull 안 했음. dirty 파일 다수 존재.

이전 세션 (2026-05-25, v5) 진전:
- Claude 측 stabilization backlog 100% 소진
- 11 commit, origin/main push 완료
- 운영 VM deploy 는 **미실행 — 첫 작업으로 진행 필요**
- 신규 카드:
  · PG-CAP-05d (translate_menu name+desc Gemini batch, 6→1 calls)
  · PWA-ICON-HIRES (192/512 PNG + manifest + tools/generate_pwa_icons.py)
  · P2 에러 메시지 정제 (str(e) 5건 일반화)
  · PAYPAY-AUTO-ORDER (PendingPayPayOrder 모델 + webhook 자동 Order 생성 폴백)
  · PAYPAY-CLEANUP (cleanup_pending_paypay_orders 액터, cron 등록 권장)
- outdated docs 정리:
  · CLAUDE.md "미완료" 의 PayPay Webhook + 환불 라우터 — 이미 구현됨 표시
  · frontend-react CLAUDE.md 의 Display Toggle URL 가드 — 이미 구현됨 표시
- predeploy_smoke 8/8 PASS (회귀 자동 차단 #7 + #8 유지)

다음 세션 시작 시 진행 순서:

0. **🚨 STEP 0 (필수, deploy 보다 먼저) — main worktree dirty 처리 + 동기화:**
   cd D:\myproject\orderservice
   git status --short
   → 위험: backend/workers/translate_tasks.py 의 dirty diff 가 origin/main 의
     translate_menu_fields_batch (PG-CAP-05d, 06efbe3) 를 옛 translate_batch_with_gemini
     경로로 REVERT 하는 형태. 절대 그대로 commit 하지 말 것.
   → ws_token.py, uv.lock, tools/predeploy_smoke.py 도 dirty 가능. 각각 git diff 로 검토.
   → 보존 가치 없는 dirty 는 사장님 승인 후 git checkout -- <파일> 폐기
   → git pull origin main 으로 HEAD = 5fda79a 동기화
   → 동기화 후 tasks/zaira-gpt-send-prompt-{paypay-auto-order,pg-cap05d}.md 보여야 정상

1. tasks/HANDOFF-NEXT-SESSION.md 읽기 (v5 = Claude 카드 100% 소진 + STEP 0 안내 + deploy 대기)
2. tasks/current-tasks.md 읽기 (현재 출시 후 사후 처리 표 = 모두 완료)
3. **GPT-5.5 점검 결과 확인 (있으면):**
   - tasks/gpt-paypay-auto-order-review.md (자이라가 zaira-gpt-send-prompt-paypay-auto-order.md 로 받은 응답)
   - tasks/gpt-pg-cap05d-review.md (자이라가 zaira-gpt-send-prompt-pg-cap05d.md 로 받은 응답)
   - must-fix 있으면 deploy 전 fix → 별도 commit + push
   - 점검 안 받았으면 자이라에게 진행 여부 확인 후 결정
4. 로컬 git 상태 재확인:
   git log --oneline -13
5. **Deploy 실행 (STEP 0 완료 + GPT must-fix 처리 후):**
   uv run deploy.py
6. Deploy 검증:
   ssh -i ~/.ssh/qraku verejireh@35.213.6.149 "systemctl show qrorder -p MainPID -p NRestarts -p ActiveState; curl -s -m 3 -o /dev/null -w 'healthz=%{http_code}\n' http://127.0.0.1:8003/api/healthz"
   ssh -i ~/.ssh/qraku verejireh@35.213.6.149 "psql 'host=127.0.0.1 port=5432 user=ilhae dbname=qraku' -c '\\dt pendingpaypayorder'"
   → pendingpaypayorder 테이블이 자동 생성됐는지 확인 (SQLModel.metadata.create_all)

그 후 상황 정리해서 보고해주세요. 진행할 작업은 보고 받은 후 결정하겠습니다.

다음 세션 우선 작업 후보 (사장님이 진행 시점 결정):

A. Deploy 후 smoke (필수)
   - PayPay 결제 → 콜백 닫기 → webhook 자동 Order 생성 확인 (sandbox)
   - PayPay 결제 → 콜백 정상 폴링 (기존 경로 회귀 없음 확인)
   - 메뉴 신규 생성 시 번역 속도 (PG-CAP-05d 효과 = 6× 빨라짐)
   - 에러 메시지 일반화 확인 (잘못된 이미지 업로드)
   - PWA 모바일에서 홈 화면 추가 시 192/512 아이콘 표시

B. 운영자 작업 (사장님 직접):
   - PAYPAY-CLEANUP-CRON: 매시 정각 cleanup_pending_paypay_orders.send() cron 등록
   - OPR-15: pg_stat_statements 활성화 (50매장 트래픽 분석)
   - OPR-07: Alembic baseline stamp (alembic.ini 운영 VM 배포 + alembic stamp head 1회)
   - OPR-13: Cloud SQL ilhae 비번 로테이션 (선택, 옛 비번 무효화됨)
   - OPR-14: 22 포트 방화벽 IP 재조정 (IAP 룰)
   - OPR-17: VAPID 키 생성 (npx web-push generate-vapid-keys, Web Push 용)
   - OPS-04: GCP Monitoring 디스크 80% 알람

C. 외부 자원 필요한 작업 (계약/spec 확보 시):
   - PAYPAY-E2E: PayPay 개발자 계정 + sandbox credentials 로 실 결제 흐름 검증
   - POS-SMAREGI / POS-AIRREGI: 외부 POS 계약 후 API spec 기반 어댑터 구현

참고:
- 본 세션 변경 schema = 신규 테이블 PendingPayPayOrder 1개 (SQLModel auto-create)
- ALTER TABLE 마이그레이션 없음 (database.py.migration_sqls 변경 없음)
- 운영 시 첫 부팅에서 advisory_xact_lock 단일 트랜잭션 안에서 안전하게 테이블 생성됨
- backend/.env 의 비번/키 변경 없음
- CLAUDE.md 가 신뢰 가능한 상태로 정리됨 — 다음 세션은 outdated docs 헷갈림 없음
- GPT-5.5 점검 prompt 2건 작성됨:
  · tasks/zaira-gpt-send-prompt-paypay-auto-order.md (🔴 강력 권장 — 결제 critical)
  · tasks/zaira-gpt-send-prompt-pg-cap05d.md (🟡 권장 — Gemini batch 응답 신뢰성)
```

---

## 첫 메시지에 추가 정보 넣고 싶을 때

위 블록 끝에 한 줄 추가:
- "자이라가 수동 smoke 해봤는데 [페이지 X] 에서 [에러 Y] 발생" — 즉시 hotfix 진행
- "OPR-15 활성화 완료, pg_stat_statements 데이터 분석해줘" — 50매장 트래픽 분석
- "운영 cron 등록 완료" — 다음 작업 결정
- "외부 [POS] 연동 시작" — 어댑터 구현 사이클 진입

## 응급 (운영 장애 발생 시)

위 블록 대신:
```
운영 장애 발생. https://qraku.com/[페이지] 에서 [증상].
ssh -i ~/.ssh/qraku verejireh@35.213.6.149 으로 backend.log tail 확인 + 즉시 진단해주세요.
필요시 git revert + 재배포 진행.
```

가능한 회귀 후보 (v5 변경 사항 영역):
- PayPay 결제 흐름 — webhook 또는 폴링 경로 회귀 시 5fc4305..9e6cf84 사이 revert
- 메뉴 번역 — PG-CAP-05d 에 회귀 시 06efbe3 revert (translate_text 로 복귀)
- 에러 메시지 — P2 정제는 무해, revert 거의 불필요
- PWA 아이콘 — 무해 (icon-192/512 추가만, 기존 favicon 유지)
