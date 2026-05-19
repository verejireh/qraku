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

(아직 시작 안 됨. SPC-01 명세 작성부터)
