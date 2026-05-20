# Work Log

> **2026-05-19 기준 압축됨**. 이전 사이클 (SaaS Infra, DBM PG 마이그레이션) 상세는 archive 참조:
> - [`archive/2026-05-saas-infra-cycle.md`](./archive/2026-05-saas-infra-cycle.md) (SaaS 인프라 사이클)
> - [`archive/2026-05-dbm-pg-cycle.md`](./archive/2026-05-dbm-pg-cycle.md) (PostgreSQL 컷오버 사이클)
>
> 본 파일은 **최근 작업 + 진행 중 사이클** 만 시간순 보관.

---

## 2026-05-19 — PG 컷오버 + qraku-specialize 코드 감사

### DBM-12 F-2 운영 컷오버 완료 🎉

**08:13 UTC** — backend 가 MySQL → PostgreSQL 로 완전 전환.

- T-25: `sudo systemctl stop qrorder` + pkill uvicorn → 8003 다운
- T-20: mysqldump 안전 백업 (`~/cutover_kiospad_20260519_073230Z.sql.gz`, 28K, 28 테이블)
- T-10: `pg_data_migrator.py` 실행 → 30 테이블 / 464 행 / 4.07초 / 시퀀스 재설정 + ANALYZE
- T-5: migration_check 스킵 (DBM-09 리허설과 동일 dataset, pg_data_migrator 자체 검증)
- T=0: `.env` 에 DB_USER/DB_PASS/DB_HOST/DB_PORT/DB_NAME/DB_DRIVER 추가 + `sudo systemctl restart qrorder`
- T+5: healthz/readyz 200, `/api/menus/1234568` 실 데이터 (`ロースカツ` ¥1650, 다국어, 이미지 URL)

상세 컷오버 절차 + 카드 결과는 [archive/2026-05-dbm-pg-cycle.md](./archive/2026-05-dbm-pg-cycle.md).

### OPS-04 phase 2 — 컷오버 후 추가 디스크 정리

`/var/log/syslog` 가 185M 로 재성장 (qrorder restart loop 시기 로그). 추가 cleanup + logrotate 영구 cap:

- syslog truncate + `/etc/logrotate.d/rsyslog-size-cap` 신규 (50M cap, rotate 4) — 재성장 영구 차단
- `apt-get clean && autoremove` (squashfs-tools 등 제거)
- `~/.cache/{uv,pip,playwright}` 정리
- 옛 DBM-09 dump 제거 (cutover 안전 dump 2개 보존)
- systemd 설치 후 불필요한 홈 사본 (`cloud-sql-proxy*`, `cloudsql-ca.pem`) 제거
- journald 100M vacuum

**결과**: 4.5G → 4.1G (16% → 15%), `/var/log` 390M → 115M

남은 OPS-04 항목: **GCP Monitoring 디스크 80% 알람** (운영자, 콘솔 5분 작업)

### qraku-specialize 코드 감사 (4개 영역)

다음 사이클 (SPC) 준비를 위해 차별화 기능 현황 조사. **80% 이미 구현됨**:

| 영역 | 상태 | 비고 |
|---|---|---|
| 미니홈피 (`/{shop_id}` → `StorePublicView.jsx`) | ✅ 완성 | 737줄, food rescue 배너 + 스탬프 + 포토리뷰 통합 |
| 사장님 공개 동의 UI (`AdminHomePageView.jsx`) | ✅ 완성 | `Store.allow_public_listing` 토글 |
| 디스커버 (지역 필터 기반) | ✅ 완성 | `/api/discover/*` + `DiscoverView.jsx` (정렬 + 통계) |
| **마감 할인 서버 자동화** | ⚠️ 누락 | 클라이언트 시계 비교만, Dramatiq cron 없음 |
| **위경도 검색 API** | ⚠️ 누락 | lat/lng 필드는 있음. PostGIS 미사용 |
| **지도 UI / 위치 요청** | ⚠️ 누락 | DiscoverView 에 텍스트 검색만 |

남은 20% 가 USP 의 핵심 ("10분 도보 거리 마감 할인 발견"). SPC-02, SPC-03, SPC-04 카드로 분해됨.

### tasks/*.md 정리

- DBM 사이클 카드 정의 (1500줄) → `archive/2026-05-dbm-pg-cycle.md` 로 이전 (압축됨)
- `current-tasks.md` 살아있는 카드만 (DBM-13, OPS-04 알람, OPR, SPC-01~10) 으로 슬림화
- 본 work-log 도 최근 작업만 + archive 링크로 정리

### 보안 부채 (작업 종료 후 로테이션)

- Cloud SQL `ilhae` 비번 — 채팅 5회 노출 (`KEeLj8:E#HlfmSrk`, `z(o0VD0D2@ijYn&c`, `onlyJESUS3927~~` 등). OPR-13 로 추적
- MySQL `root` 비번 — 곧 retire 라 무시 가능

---

## 2026-05-19 — 본 세션 종료 시점 상태

- ✅ DBM 사이클 종료 (DBM-01 ~ DBM-12 + DBM-12b, OPS-04 cleanup, OPS-05). archive 로 이전됨.
- ✅ 운영 backend 가 PostgreSQL 위에서 정상 동작
- ✅ tasks/*.md 압축 완료 (current-tasks 살아있는 카드만, work-log 최근만, archive 신규)
- ✅ SPC (qraku-Specialize) 사이클 SPC-01 ~ SPC-10 카드 설계 완료
- ⏸ 마케팅 프로젝트 (`D:\myproject\qraku-marketing\`) 빌드 — 다음 작업
- ⏸ Worktree 2개 신설 (stabilize/post-pg-cutover, qraku-specialize) — 다음 작업
- 🔴 운영자 잔여: DBM-13 (D+7), OPS-04 알람, OPR-13 비번 로테이션

---

# 신규 사이클 — SPC (qraku-Specialize)

> 진행 중 — 아래에 SPC-* 카드 완료 시 append.

## 2026-05-20 — SPC-01 명세 작성 완료

### 산출물

- [`tasks/spc-spec.md`](./spc-spec.md) (신규, 13 § 구성) — SPC-02~10 카드의 SSoT
  - §1 베치헤드 (고텐바 50개) / §2 코드 감사 매트릭스 (80% 구현)
  - §3 손님 흐름 mermaid / §4 사장님 흐름 mermaid
  - §5 기능 명세 표 15 행 (F1~F15, 각 행 → 담당 SPC 카드 매핑)
  - §6 데이터 모델 (Store 거의 변경 없음 확인. Menu allergens/stock 만 P2)
  - §7 신규 API 5개 (nearby, push subscribe, sitemap, insights, referrals)
  - §8 마감 할인 자동화 룰 (Dramatiq cron 의사코드 + `business_hours.py` 헬퍼 정의)
  - §9 위경도 검색 룰 (PostGIS 권장 + haversine 폴백 SQL 양쪽 제시)
  - §10 결정 대기 5 항목 (디폴트 잡음 + PENDING 자이라 검토)
  - §11 후속 카드 필독 § 매핑 / §12 MVP 출시 체크리스트

### 카드 정의 vs 실제 코드 불일치 발견

- 카드 SPC-02 가정: `Store.open_at/close_at` 컬럼
- 실제: `Store.business_hours` JSON ({mon:{open,close},...}) + `Store.is_open` bool
- → §8 에 `business_hours.py:get_close_time_today` 헬퍼 신규 정의로 반영

### 신규 운영자 항목

- OPR-15: Google Maps API 키 (SPC-04 선결정)
- OPR-16: PostGIS Cloud SQL flag 확인 (SPC-03 선결정)
- OPR-17: VAPID 키 생성 (SPC-06 선결정)

### 결정 (자이라 확인)

- 디스커버 인증 = 익명 + IP rate-limit
- 알레르기 = P2 유지
- PWA 푸시 = 옵트인 토글
- (모두 §10 에 PENDING 마크 — 자이라 검토 후 v2 확정)

### 다음 작업

- SPC-02 (postgres-specialist / sonnet) + SPC-03 (postgres-specialist / sonnet) 병렬 가능
- SPC-04 는 SPC-03 응답 스키마 의존 → 순차

---

## 2026-05-20 — SPC-01 v1.1 (자이라 검토 반영)

### 자이라 확정

| § | 항목 | 결정 |
|---|---|---|
| §10-a | Discover 인증 | ✅ 익명 + IP rate-limit |
| §10-b | 알레르기 P2 | ✅ 유지 (출시 후 2주차 검토) |
| §10-c | PWA 푸시 권한 | ✅ 옵트인 "단골 등록" 버튼 |
| §10-d | 자동/수동 의미 | ✅ **마감 할인 이벤트 발동 방식만** 의미. 매장 영업 자체(is_open)와 무관. cron 은 is_open 건드리지 X |
| §10-d | UI 위치 룰 | ✅ admin=설정 / 공통 staff setting=매일 운영 (is_open, food_rescue_manual_active 수동) |
| §10-e | 지도 라이브러리 | 🟡 보류 → `pending-review.md` PR-01 |

### 발견 → 신규 카드 SPC-11

매장 오픈 토글이 현재 RegisterView 에만 있음. 자이라 결정에 따라 register/staff/kitchen 공통 setting 페이지 신설 필요.

- **현재**: [RegisterView.jsx:285-290](../frontend-react/src/views/RegisterView.jsx) `営業開始/終了` 버튼 + `PATCH /api/stores/{id}/business-status` (stores.py:340)
- **이동 대상**: `is_open` 토글, `food_rescue_manual_active` 수동 토글
- **백엔드 변경 없음** — 기존 API 재사용

### 발견 → §8 헬퍼 정정

`backend/utils/business_hours.py` **이미 존재** (단, is_open 만 보고 business_hours JSON 무시). SPC-02 는 **기존 파일에 `get_close_time_today()` 추가** (새 파일 생성 X).

### 신규 파일

- [tasks/pending-review.md](./pending-review.md) — 보류 검토 사항 누적용 (PR-01 ~ PR-04 등록)

### 변경 파일

- [tasks/spc-spec.md](./spc-spec.md) — §10 / §8 / §5 / §11 / §12 / §13 업데이트 (v1 → v1.1)
- [tasks/current-tasks.md](./current-tasks.md) — SPC-11 진행 보드 행 + 카드 정의 본문 추가, Phase B+ 신설

---

## 2026-05-20 — SPC-01 v1.2 / v1.3 (자이라 추가 검토 반영)

### v1.2 — SPC-11 PR-03 확정 + SettingView 발견

| 항목 | 결정 |
|---|---|
| SettingView 이미 존재? | ✅ [SettingView.jsx](../frontend-react/src/views/SettingView.jsx), 라우트 `/{shop_id}/setting`, 마스터 PIN 보유자용 |
| SPC-11 = 신규 페이지? | X (기존 SettingView 확장만) |
| SettingView 안 배치 | 신규 탭 "毎日運営" (첫 탭) |
| 두 버튼 분리 | **상하 분리 + 색상 차별화** (매장 ON/OFF = 녹/적, 마감 할인 = 주황/회). 한 위젯에 묶지 X. |
| auto 모드 disabled | 마감 할인 수동 토글 disabled + admin 링크 안내 |

### v1.3 — SPC-04 지도 비용 0원 솔루션 확정

자이라 비용 우려 → 명확화: Google Maps SDK 만 유료, 외부 링크 + Embed iframe 은 **둘 다 무제한 무료**.

| 위치 | 방식 | 비용 |
|---|---|---|
| 디스커버 카드 "📍 지도 보기" | 외부 링크 `https://www.google.com/maps/?q={lat},{lng}` | 0원 |
| 미니홈피 매장 위치 | Google Maps Embed iframe | 0원 |
| 거리 계산 | backend PostGIS / haversine | 0원 |
| **합계** | | **0원/월 무제한 트래픽** |

→ **OPR-15 (Google Maps API 키 발급) 항목 제거**. SPC-04 카드 수용 기준 갱신.

### OPR-16 PostGIS 활성화 가이드 (자이라 운영 작업)

이번 세션에서 자이라에게 안내 제공 (별도 md 파일 X, 채팅 내). 5~10분 작업:

1. Cloud SQL flag 변경 불필요 (PostGIS 사전 설치)
2. SSH 운영 VM → `psql "host=127.0.0.1 port=5432 user=ilhae dbname=qraku"`
3. `CREATE EXTENSION IF NOT EXISTS postgis;` 실행
4. 권한 거부 시 `postgres` 슈퍼유저로 재접속 후 실행
5. `\dx` 로 확인

거부 시 SPC-03 가 자동 haversine 폴백 (50 식당에서 < 100ms 충족).

### 변경 파일 (v1.2 + v1.3)

- [tasks/spc-spec.md](./spc-spec.md) — §5 F6/F16 + §7 nearby + §10-d/e + §12 + §13 변경 이력 (v1.1 → v1.3)
- [tasks/current-tasks.md](./current-tasks.md) — SPC-11 카드 본문 정정 (신규 페이지 X, 毎日運営 탭, 수용 기준 확정)
- [tasks/pending-review.md](./pending-review.md) — PR-01 ✅ 확정 (지도 SDK X), PR-03 ✅ 확정 (毎日運営 탭 + 상하 분리 + 색상)

### 다음 작업 (자이라 미완 + 백엔드 카드 시작 가능)

| 항목 | 담당 | 상태 |
|---|---|---|
| OPR-16 PostGIS 활성화 | claude → 운영 VM 직접 | ✅ DONE 2026-05-20 (아래 참조) |
| SPC-02 (마감 할인 cron) | sonnet | 착수 가능 |
| SPC-03 (위경도 nearby API) | sonnet | OPR-16 또는 haversine 폴백 둘 다 가능 → 착수 가능 |
| SPC-11 (SettingView 毎日運営 탭) | sonnet | 착수 가능 (frontend) |
| SPC-04 ~ SPC-07 | sonnet | SPC-03 후 또는 병렬

---

## 2026-05-20 — OPR-16 PostGIS 활성화 (운영 VM 직접 작업, claude)

자이라가 OPR-13 (ilhae 비번 로테이션) 완료 + `.env` 업데이트 후 OPR-16 위임.

### 결과

- PostGIS **3.6.0** 활성화 (`CREATE EXTENSION postgis;`)
- ilhae 가 `cloudsqlsuperuser` 멤버 → 슈퍼유저 fallback 불필요
- Smoke test: 도쿄(139.7670,35.6814) ↔ 고텐바(138.9357,35.3088) = **86,013 m** (실거리와 정확)
- backend `/api/healthz` 200, `/api/readyz` ready — 영향 없음

```sql
SELECT postgis_full_version();
-- POSTGIS="3.6.0 3.6.0" PGSQL="160" GEOS="3.11.4" PROJ="7.2.0" LIBJSON="0.17" ...
```

### 발견 이슈 (별도 OPR 카드 신설)

- **OPR-18**: `.env` 가 CRLF 라인 종결 → `set -a; source .env` 시 `$'\r': command not found` + 변수 값 끝 `\r` 섞여 비번 인증 실패. 우회: `grep | tr -d '\r' | cut -d= -f2-`. 영구 해결은 `sed -i 's/\r$//' .env`.
- **OPR-19**: 첫 source 시도 실패 출력에 `.env` line 41 부근 시크릿 (`aT1Q_wsHbsI9qEJOxAe3ZhJ51ZOhMZ7eRiHbpz4bTkI=`, Fernet ENCRYPTION_KEY 추정) 채팅 1회 노출. 회전 시 기존 암호화 데이터 재암호화 마이그레이션 필요 → 자이라 결정 (회전 vs 무시).

### SPC-03 후속 작업 (자동)

OPR-16 완료로 SPC-03 가 **PostGIS 경로** 진행 가능 (haversine 폴백 불필요):
- `Store.location geography(POINT,4326)` 컬럼 추가
- 기존 lat/lng → location UPDATE
- GIST 인덱스 (`CREATE INDEX idx_store_location ON store USING gist(location)`)
- INSERT/UPDATE trigger (lat/lng 변경 시 location 자동 동기화)

→ SPC-03 카드 착수 시 `backend/database.py` migration_sqls 끝에 위 4 항목 추가 (CLAUDE.md 규칙 2 마이그레이션 태그 준수)
