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

---

## 2026-05-20 — `.env` 정리 (OPR-18 + OPR-01 + OPR-19) 자이라 + claude 협업

OPR-16 작업 중 발견된 `.env` 파일 위생 문제 일괄 해소.

### 발견 → 해소 순서

1. **OPR-18 (CRLF)** — `set -a; source .env` 시 `$'\r': command not found` + 모든 변수 끝 `\r` 섞임. `sed -i 's/\r$//'` 한 줄로 변환. 백업 보존. ✅
2. **OPR-19 (시크릿 노출)** — 첫 source 실패 출력에 line 41 `ENCRYPTION_KEY` 값 채팅 1회 노출. 처음엔 무시 검토했으나 다음 단계 진단에서 의미 바뀜:
3. **OPR-01 (ENCRYPTION_KEY 형식 오류 진단)** — python-dotenv 직접 호출로 확인:
   - `len: 46` (꺾쇠 포함), 꺾쇠 빼면 `44자` = 정확한 Fernet 키 길이
   - 자이라가 `.env` 에 `ENCRYPTION_KEY=<aT1Q_w...=>` 형식으로 placeholder 스타일 작성
   - `crypto.py:35` "ENCRYPTION_KEY 형식 오류" 로깅 + **평문 fallback** 작동 중
   - 자이라가 grep `'fernet\|encryption'` 으로는 매칭 안 됨 (한국어 "형식 오류")
   - → 그동안 모든 시크릿이 평문 저장됨 (Square 토큰, PIN 등). 키 회전해도 잃을 데이터 없음.
4. **회전 + 갱신** — 자이라가 PC PowerShell 에서:
   - `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` 으로 새 키 발급 (출력은 채팅에 미게시)
   - `.env` line 41 새 키로 교체 (꺾쇠 없이)
   - `sudo systemctl restart qrorder`
   - `tail -20 backend.log | grep -iE 'encryption|fernet|형식'` → `(no errors)` 확인
   - `/api/healthz` ok, `/api/readyz` ready

### 결과

| OPR | 상태 |
|---|---|
| OPR-01 (ENCRYPTION_KEY 적용) | ✅ DONE — 새 키 정상 로드, 평문 fallback 종료 |
| OPR-18 (.env CRLF→LF) | ✅ DONE |
| OPR-19 (노출 키 회전) | ✅ DONE (OPR-01 과 동일 작업) |

### 향후 고려 (출시 전 또는 후 검토)

- 평문으로 저장된 기존 시크릿 (Square access/refresh token, master_pin 등) 의 자동 암호화 마이그레이션 — backend 가 next save 시 자동 암호화하므로 admin 에서 각 매장 토큰 재저장 한번씩 하면 해소. 또는 일괄 마이그레이션 스크립트.
- 50개 식당 출시 전 시점에 점검 권장.

---

## 2026-05-20 — SPC-02 마감 할인 서버 자동화

### 개요

Dramatiq scheduled actor 로 `food_rescue_mode='auto'` 매장의 `food_rescue_manual_active` 를 close_at 기준으로 자동 갱신. `is_open` 은 절대 건드리지 않음.

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `backend/utils/business_hours.py` | `get_close_time_today(store, now)` 추가. PR-04 옵션 A (자정 넘김 = 익일) 적용. |
| `backend/workers/food_rescue_scheduler.py` | 신규. `@dramatiq.actor` `food_rescue_check`. cron `*/5 * * * *` 등록용. |
| `backend/workers/__init__.py` | `food_rescue_scheduler` import 등록 (actor 브로커 등록). |
| `backend/test_business_hours.py` | 단위 테스트 7 케이스. 전체 PASS 확인. |

### 알고리즘

1. JST now → `get_close_time_today(store, now)` → `close_dt`
2. `minutes_until_close = (close_dt − now).total_seconds() / 60`
3. `should_be_active = 0 < minutes_until_close <= store.food_rescue_auto_minutes`
4. 변경된 매장만 bulk UPDATE + Redis pub/sub WS broadcast (`food_rescue:{store_id}`)

### 수용 기준 체크

- [x] Dramatiq actor `food_rescue_check` 등록
- [x] 매 5분 cron 주석 명시
- [x] 영업 시간 + auto_minutes 비교 정확 (자정 넘김 포함)
- [x] WebSocket broadcast (`FOOD_RESCUE_CHANGED`) 동작
- [x] 단위 테스트 7 케이스 모두 PASS

### 운영 VM cron 등록 방법 (OPS 메모)

```bash
crontab -e
# 추가:
*/5 * * * * cd ~/qr-order-system && .venv/bin/python -m dramatiq backend.workers --processes 1 --threads 1 --path . 2>> ~/dramatiq-food-rescue.log
```

또는 `food_rescue_check.send()` 를 외부 cron/APScheduler 로 주기 호출.

---

## 2026-05-20 — SPC-03 위경도 nearby API

### 개요

PostGIS `ST_DWithin` + `ST_Distance` 를 사용하는 `GET /public/discover/nearby` 엔드포인트 추가. 기존 `Store.latitude`/`Store.longitude` 필드 재활용 (모델 변경 없음). 함수형 GIST 인덱스 마이그레이션 추가.

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `backend/routers/discover.py` | `GET /public/discover/nearby` 엔드포인트 신규 추가. |
| `backend/database.py` | `CREATE INDEX USING GIST ((ST_MakePoint(longitude, latitude)::geography))` 마이그레이션 추가. |

### API 명세

```
GET /api/public/discover/nearby
  ?lat=35.3093   # 현재 위도 (필수)
  &lng=138.9337  # 현재 경도 (필수)
  &radius=800    # 반경(m), 기본 800m = 도보 10분, max 5000m
  &food_rescue_only=false  # true: 마감 할인 진행 중 매장만

응답:
{
  "items": [{
    "store_id", "store_name", "slug", "category", "prefecture", "city",
    "address", "phone", "theme", "latitude", "longitude",
    "is_open", "food_rescue_active", "food_rescue_manual_active", "food_rescue_msg",
    "food_rescue_auto_minutes", "about_description", "specialty", "business_hours",
    "distance_m",           ← 미터 단위 거리 (소수점 1자리)
    "google_maps_url"       ← "https://www.google.com/maps/?q={lat},{lng}" (SDK 0원)
  }],
  "total", "center", "radius_m", "food_rescue_only"
}
```

### 수용 기준 체크

- [x] `GET /public/discover/nearby` 등록 (라우터 prefix: `/api/public/discover`)
- [x] PostGIS `ST_DWithin` 거리 필터 (radius 기본 800m)
- [x] 거리 오름차순, max 20 결과
- [x] `google_maps_url` 필드 포함
- [x] `food_rescue_only=true` 필터 지원
- [x] GIST 함수형 인덱스 마이그레이션 추가
- [x] 모델 변경 없음 (기존 latitude/longitude 재활용)

---

## 2026-05-20 — SPC-11 SettingView 毎日運営 탭

### 개요

SettingView 에 "毎日運営" 탭 신설. 매장 ON/OFF 와 마감 할인 수동 토글을 물리적으로 분리된 카드에 배치. RegisterView 헤더의 중복 버튼 + 관련 state/handler/modal 제거.

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `frontend-react/src/views/SettingView.jsx` | `DailyOpsTab` 컴포넌트 신규. TABS 배열 앞에 `毎日運営` 탭 추가. 기본 탭 변경 (`staff` → `daily`). |
| `frontend-react/src/views/RegisterView.jsx` | 헤더 영업 ON/OFF 버튼 + タイムセール 버튼 제거. 관련 state 4개 + handler 4개 + modal 2개 제거. |

### DailyOpsTab 기능

- **카드 1 — 영업 ON/OFF**: 
  - `is_open=True` → 빨강 "営業を終了する" 버튼 + 확인 모달
  - `is_open=False` → 초록 "営業を開始する" 버튼 (즉시)
  - `PATCH /api/stores/{id}/business-status`

- **카드 2 — 마감 할인**:
  - `food_rescue_active=False` → 비활성 안내 + Admin 링크
  - `food_rescue_mode='auto'` → disabled (자동 모드) + 안내 텍스트 + Admin 링크
  - 수동 모드: 주황 "割引を開始する" ↔ 회색 "割引を停止する"
  - `PATCH /api/stores/{id}/food-rescue-status`

### 수용 기준 체크 (PR-03 확정 사항)

- [x] 신규 탭 "毎日運営" 추가 (탭 순서: 毎日運営 → 勤務管理 → 品切れ管理 → 食べ放題)
- [x] 두 버튼 상하 분리 (별도 카드)
- [x] 색상 차별화 (매장 ON/OFF = 초록/빨강, 마감 할인 = 주황/회색)
- [x] auto 모드 disabled + admin 페이지 링크
- [x] RegisterView 중복 토글 제거 (4 state + 4 handler + 2 modal)

---

## 2026-05-20 — SPC-04 디스커버 지도 UI

### 개요

DiscoverView 에 "近くのお店" 모드 추가. 브라우저 Geolocation → SPC-03 nearby API → StoreCard 리스트. 지도 SDK 미사용 (PR-01 확정 — 외부 링크만, 0원).

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `frontend-react/src/views/DiscoverView.jsx` | 모드 탭 (ランキング/近くのお店) 추가. `NearbyPanel` + `StoreCard` 컴포넌트 신규. |

### 기능 상세

- **모드 탭**: 헤더에 "ランキング" ↔ "近くのお店" 전환
- **NearbyPanel** (근처 모드):
  - `idle` → "現在地を使う" 버튼 → `requesting` → Geolocation API
  - `granted` → `/api/public/discover/nearby` 자동 호출
  - `denied/error` → 재시도 버튼
  - 필터: 반경(300m/800m/1.5km/3km) + 마감 할인 토글
  - 반경/필터 변경 시 자동 재검색
- **StoreCard**:
  - 매장명, 카테고리, 거리(m/km), 할인 배지(🔥)
  - food_rescue_msg 배너
  - "地図で見る" → `google_maps_url` 외부 링크 (새 탭)
  - "お店へ" → `/{slug}` 미니홈피 링크
- **기존 ランキングモード**: 변경 없이 유지

### 수용 기준 체크 (SPC-04)

- [x] 위치 요청 UX (idle → requesting → granted/denied)
- [x] nearby API 호출 + 결과 리스트
- [x] 거리/할인 필터 UI
- [x] `google_maps_url` 외부 링크 (SDK 미사용, 0원)
- [x] 기존 ランキングモード 정상 유지

---

## 2026-05-20 — SPC-05 SEO + SPC-06 PWA

### SPC-05 — 미니홈피 SEO 강화

| 파일 | 변경 내용 |
|---|---|
| `frontend-react/src/views/StorePublicView.jsx` | `useEffect` 추가 — store 로드 시 `document.title`, `meta[description]`, OG 태그 5개, JSON-LD Restaurant 스키마 (`<script id="ld-json-store">`) 동적 주입. unmount 시 cleanup. |
| `backend/routers/seo.py` | 신규. `GET /sitemap.xml` (공개 매장 전체 URL 목록, XML) + `GET /robots.txt`. `FRONTEND_BASE_URL` env 기반. |
| `backend/main.py` | `seo.router` 등록 (`/api` prefix 없이 root-level). |

**JSON-LD 필드**: name, description, url, servesCuisine, address (PostalAddress), telephone, geo (GeoCoordinates).

### SPC-06 — PWA 설치 가능화

| 파일 | 변경 내용 |
|---|---|
| `frontend-react/public/manifest.json` | 신규. name/short_name/icons/theme_color/start_url/display/lang. |
| `frontend-react/public/sw.js` | 신규. Cache-first (정적 자산) + Network-first (API/WS 제외). install/activate/fetch 3 lifecycle. |
| `frontend-react/index.html` | `<link rel="manifest">` + SW 등록 스크립트 추가. |

**참고**: 푸시 알림 (Web Push) 은 VAPID 키 발급 (OPR-17) 후 SPC-06 후속으로 추가 예정.

### SPC-07 — 사장님 데이터 인사이트 미니 대시보드

| 파일 | 변경 내용 |
|---|---|
| `backend/routers/insights.py` | 신규. 4 엔드포인트: `GET /api/admin/insights/visitors` (일별 주문 트렌드), `GET /api/admin/insights/popular_menus` (Top N 인기 메뉴), `GET /api/admin/insights/rescue_effect` (마감 할인 효과), `GET /api/admin/insights/neighborhood_avg` (동일 prefecture 매장 평균 비교). 모두 `require_admin` 인증. |
| `backend/main.py` | `insights.router` 등록 (`api_router` 하위). |
| `frontend-react/src/views/AdminHomePageView.jsx` | `InsightsSection` 컴포넌트 추가. 주문 트렌드 바 차트 (CSS), 인기 메뉴 진행 바, 마감 할인 효과 카드, 동네 평균 비교 카드 4패널. 저장 버튼 위에 삽입. |

**설계 결정**:
- 방문자 = 주문 건수 프록시 (페이지뷰 추적 미구현, Order.created_at 기반)
- 마감 할인 효果 = `discount_amount > 0` 주문 vs 일반 주문 (food_rescue 전용 flag 없음)
- 동네 비교 = 동일 `prefecture`, `allow_public_listing=True` 매장 평균 (city 아닌 prefecture — 고텐바 50 매장 규모)
- 외부 차트 라이브러리 없음 (CSS 바 차트)
