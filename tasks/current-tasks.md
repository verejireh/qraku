# Current Tasks — QRaku 다음 사이클

> 이 파일은 **현재 진행 중 / 예정** 카드만 담는다.
> 완료된 사이클의 카드는 [`archive/`](./archive/) 로 이동한다.
> 모든 카드는 [`docs/coding-rules.md`](../docs/coding-rules.md) 규칙 1~11 을 준수해야 한다.

---

## 작업 완료 시 필수 절차

카드 작업이 끝날 때마다 **반드시 두 가지**를 동시에 처리한다:

1. **진행 보드 상태 갱신** — 해당 카드의 상태를 `TODO → ✅ DONE`
2. **`tasks/work-log.md`에 append** — 아래 템플릿 사용:

```markdown
## [카드ID] 제목
**날짜**: YYYY-MM-DD
**담당**: 에이전트명 (모델)
**커밋**: `<hash>`

### 변경 파일
- `path/to/file` (신규/수정, N LOC) — 한 줄 설명

### 마이그레이션
없음 / `# [날짜] 목적` — SQL 내용

### 검증 결과
- ✅/❌ 수용 기준 항목별 결과

### 비고
- 운영자 액션 필요 항목
- 다음 가능 작업
- 특이사항
```

사이클 종료 시:
1. 모든 ✅ DONE 카드를 [`archive/{YYYY-MM}-{cycle-name}.md`](./archive/) 로 요약 이전.
2. `current-tasks.md` 는 다음 사이클의 후보 카드만 남긴다.
3. 주요 설계 결정은 [`docs/adr/`](../docs/adr/) 에 ADR 로 별도 기록.

---

## 진행 보드

| ID | 제목 | Phase | 우선순위 | Owner | 모델 | 상태 |
|---|---|---|---|---|---|---|
| _(다음 사이클 카드 추가)_ | | | | | | |

> **우선순위 표기**: 🔴 P0 (출시 전 필수) / 🟠 P1 (이번 사이클 내) / 🟡 P2 (사이클 후반)

### 모델 선택 규칙

| 모델 | 언제 쓰나 |
|---|---|
| **opus** | ① 새 컴포넌트 도입 결정, ② 폭이 넓고 트레이드오프가 많은 분석 (전 라우터 감사 등), ③ 카드 자체를 새로 작성/수정. **`architect` 에이전트는 항상 opus.** |
| **sonnet** | 카드의 허용 파일이 명확하고 코드 스니펫까지 박혀있는 **순수 구현 작업**. **`backend-reliability` / `websocket-specialist` 에이전트는 sonnet**. |

**`opus → sonnet` 표기 의미**: 먼저 opus 가 카드 정밀화/설계 검토 → 그 다음 sonnet 이 구현. 두 단계로 나눠 시키면 토큰 비용은 줄고 품질은 안정적.

### 지시 예시

```
# 단순 구현
INF-01 sonnet으로 backend-reliability 에이전트로 작업해줘.

# 설계 검토 후 구현 (2단계)
SEC-01 opus의 architect로 먼저 정밀화 → 그 다음 sonnet의 backend-reliability로 구현해줘.

# 모델 전환
/model claude-opus-4-7   ← 카드 정밀화/큰 설계 결정 시
/model claude-sonnet-4-6  ← 실제 코드 작성 시
```

---

## 운영자 미완료 항목 (코드 외 작업)

| ID | 항목 | 비고 |
|---|---|---|
| OPR-01 | `ENCRYPTION_KEY` 운영 환경 발급 | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| OPR-02 | `VITE_LINE_LIFF_ID` LIFF 앱 발급 | LINE Developers Console |
| OPR-03 | `FRONTEND_BASE_URL=https://qraku.com` 설정 | PayPay 콜백용 |
| OPR-04 | `VISION_API_KEY` GCP Vision API 활성화 | 사진 NSFW 자동 차단 (선택) |
| OPR-05 | `REDIS_URL` 운영 환경 Redis 인스턴스 | INF-01 완료 후 운영 배포 시 |
| OPR-06 | PayPay 콘솔 webhook URL 등록 | PAY-01 배포 후 (`https://qraku.com/api/webhooks/paypay`) |
| OPR-07 | OPS-03 Alembic baseline stamp | 운영 DB 첫 배포 시 1회 `uv run alembic stamp head` |
| OPR-08 | `PAYPAY_WEBHOOK_SECRET` 운영 .env 설정 | PayPay 콘솔에서 발급 |

> 운영자 액션은 사이클이 바뀌어도 **완료될 때까지 이 표에 남는다**.

---

## 다음 사이클 후보 (Backlog)

이번 사이클에서 의도적으로 미룬 것 + 새로 발생한 후보. 카드 정식 정밀화 전.

### 인프라 / 운영
- [ ] 멀티 인스턴스 실배포 (Nginx + backend×2) 검증 — OPS-01 docker-compose 결과 발판
- [ ] `migration_sqls` 단계적 deprecate → Alembic 단일화 (충분한 운영 검증 후)
- [ ] 결제 재시도 워커 (`payment_retry_tasks.py`) — Dramatiq 인프라 재사용
- [ ] POS 동기화 워커 — Square POS / Smaregi 본격 구현 시
- [ ] 영수증 PDF 워커화 (현재 동기 생성)
- [ ] 사진 NSFW 검사 (Vision API) 워커화 — `OPR-04` 활성화 시

### AI / 마케팅 (다음 사이클 핵심 후보)
- [ ] AI 매출 분석 — Gemini 활용, 일/주/월 자동 리포트
- [ ] LINE 마케팅 메시지 발송 — 워커로
- [ ] 메뉴 사진 자동 생성 — 텍스트 → 이미지

### UX / 결제
- [ ] PayPay Direct E2E 테스트 (sandbox 계정)
- [ ] Smaregi / AirRegi 어댑터 본격 구현 (현재 placeholder)
- [ ] 食べ放題 세션 인원 변경 / 시간 연장
- [ ] 飲み放題 + 食べ放題 동시 진행

### 모니터링
- [ ] 로그 수집기 (ELK 또는 Loki) — 일단 보류
- [ ] APM (Sentry / Datadog) — 운영 트래픽 늘면 검토

---

## 카드 작성 규칙 (이 파일 갱신 시)

새 작업 카드 추가 시 반드시 포함:

1. **ID** (도메인 약자 + 번호, 예: `INF-06`)
2. **Owner** (어느 에이전트가 담당)
3. **Priority** (🔴 P0 / 🟠 P1 / 🟡 P2)
4. **Depends on / Blocks**
5. **배경** (왜 하는가)
6. **허용 파일** (File Fence)
7. **금지** (하지 않을 일)
8. **구현 요구사항** (구체 코드 스니펫까지)
9. **수용 기준** (체크박스로)
10. **검증** (어떻게 확인)
11. **참고 문서** (코딩 규칙 / ADR / 도메인 룰)

작업 완료 시:
1. 진행 보드 상태를 `TODO` → `✅ DONE`
2. [`tasks/work-log.md`](./work-log.md) 에 완료 기록 append
3. 사이클 종료 시 [`archive/`](./archive/) 로 이동, `current-tasks.md` 정리
4. 주요 설계 결정은 [`docs/adr/`](../docs/adr/) 에 ADR 로 추가

---

## 참고 — 직전 사이클 산출물

- [2026-05 SaaS 인프라 안정화 사이클](./archive/2026-05-saas-infra-cycle.md)
- [SEC-01 멀티테넌시 감사 보고서](./sec-audit-report.md)
- [Work log (모든 사이클 누적)](./work-log.md)
