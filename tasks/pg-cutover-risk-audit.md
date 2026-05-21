# PostgreSQL 컷오버 후 잠재 위험 감사

**작성일**: 2026-05-21
**대상 브랜치**: `stabilize/post-pg-cutover` (DBM-13 정리 완료 시점)
**컷오버일**: 2026-05-19 (DBM-12 F-2)

## 목적

MySQL → PostgreSQL 컷오버 후 STB 사이클 + DBM-13 정리에도 불구하고 **남아있는 잠재 위험 요소** 를 한 곳에 모은 단일 진실 소스.

각 항목은 코드 인용으로 검증됨. "혹시" 가설은 배제. 운영 DB 직접 조회가 필요한 항목은 그렇게 명시.

검증되지 않은 한 가지 — 운영 DB 의 실제 컬럼/시퀀스/PostGIS 상태는 로컬 코드만으로 확인 불가. 운영자 SSH + psql 1회 점검으로 5번/6번/12번 위험을 닫을 수 있음.

---

## 🔴 P0 — 출시 전 반드시 해결

### 1. KitchenMode enum 값 vs DB 마이그레이션 SQL 불일치

| 위치 | 값 |
|---|---|
| [`backend/models.py:16-18`](../backend/models.py) | `KitchenMode.KDS = "kds"` (소문자) |
| [`backend/database.py:83`](../backend/database.py) | `DEFAULT 'KDS'` (대문자) |
| [`backend/database.py:92`](../backend/database.py) | `UPDATE store SET kitchen_mode = 'KDS' WHERE kitchen_mode = 'kds'` |
| [`tools/data_consistency_audit.py:53`](../tools/data_consistency_audit.py) | `("store", "kitchen_mode", {"kds", "square"})` (소문자 기대) |

**위험 시나리오**:
1. 컷오버 직후 마이그레이션이 기존 'kds' → 'KDS' 로 정규화
2. SQLModel 이 DB 에서 'KDS' 로 읽음 → `KitchenMode("KDS")` ValueError (enum value 는 'kds')
3. STB-07 감사 도구가 'KDS' 행을 ENUM 위반으로 검출

**조치**: 셋 중 하나로 통일. 권장:
- enum 값을 `"KDS"` 로 변경 (대소문자 정렬, 다른 enum 들 — SubscriptionType/PointAccrualType 등 — 도 대문자)
- 마이그레이션 SQL 의 정규화 + DEFAULT 둘 다 'kds' 로 통일
- 데이터 마이그레이션: `UPDATE store SET kitchen_mode = 'kds' WHERE kitchen_mode = 'KDS'`

**검증**: `SELECT DISTINCT kitchen_mode FROM store;` — 결과가 코드 enum 과 일치하는지.

---

### 2. `migration_sqls` 의 `DATETIME` 키워드는 PG 에서 syntax error

PostgreSQL 은 `DATETIME` 타입을 모름 (`TIMESTAMP` 또는 `TIMESTAMPTZ` 필요).

[`backend/database.py`](../backend/database.py) 의 다음 라인들이 영향:

- 라인 59: `ALTER TABLE store ADD COLUMN IF NOT EXISTS trial_start_date DATETIME NULL`
- 라인 120, 136, 162, 170 (다른 DATETIME 컬럼들)
- 라인 195-196 (rewardcoupon used_at, expires_at)

**현재 무사한 이유 (추정)**:
- SQLModel 모델에 해당 컬럼들이 정의되어 있어 `SQLModel.metadata.create_all` 이 PG `TIMESTAMP` 로 자동 생성
- 결과적으로 `ADD COLUMN IF NOT EXISTS` 시점에는 이미 컬럼 존재 → "already exists" 패턴에 NOOP
- 즉 첫 부팅 시 컬럼이 존재하면 ALTER 가 NOOP, 컬럼이 없으면 syntax error

**위험 시나리오**:
- 새 매장 시드 또는 새 환경 부팅 시: 컬럼이 없는 상태에서 ALTER 실행 → `type "datetime" does not exist` 에러
- `IGNORED_MIGRATION_ERRORS` 패턴 (`already exists`, `42701`, `42P07`) 에 안 잡힘 → stderr 로 출력 후 계속
- 컬럼이 생성되지 않고 SQLModel.metadata.create_all 이 그 후 실행되면서 우연히 생성됨 (순서 의존)

**조치**: `DATETIME` → `TIMESTAMP` 또는 `TIMESTAMPTZ` 로 일괄 교체. 6~8 라인 정도.

**검증**: 빈 PG 데이터베이스에서 `init_db()` 실행 → stderr 에 `does not exist` 에러가 0건이어야 함.

---

### 3. `seed_data.py` 가 PG 에서 실패

[`backend/seed_data.py:26-34, 49-59`](../backend/seed_data.py):

```sql
INSERT INTO store (...) VALUES (...)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_open = VALUES(is_open)
```

```sql
INSERT INTO `table` (store_id, ...) VALUES (...)
ON DUPLICATE KEY UPDATE ...
```

**위험**: 둘 다 MySQL 전용 (PG 는 `ON CONFLICT (col) DO UPDATE SET col = EXCLUDED.col`). 백틱 (`` `table` ``) 도 PG 에서 syntax error — PG 는 큰따옴표 `"table"` 사용.

**조치 선택지**:
- (A) PG 호환 SQL 로 재작성
- (B) 파일 삭제 (실 운영에서 안 쓰이면) — reseed_demo.py 가 대체

**확인 필요**: deploy.py / 시드 워크플로우에서 `seed_data.py` 가 호출되는지.

---

### 4. `reseed_demo.py` 의 백틱 `` `table` ``

[`backend/reseed_demo.py:127, 135`](../backend/reseed_demo.py):

```python
await s.execute(text(f"DELETE FROM `table` WHERE store_id = {sid}"))
```

**위험**: PG syntax error. `table` 은 SQL 예약어이므로 따옴표 필요 — PG 에선 `"table"`.

**조치**: `\`table\`` → `"table"` 로 교체. 2 라인.

**부가**: `f"DELETE ... WHERE id = {sid}"` 패턴은 SQL injection 위험 — `sid` 가 신뢰된 int 이지만 `text()` 의 bind param 사용이 안전한 패턴 (`text("DELETE FROM ... WHERE id = :sid"), {"sid": sid}`).

---

### 5. PostGIS 함수형 GIST 인덱스가 실제로 매치되는지 미검증

[`backend/database.py:226`](../backend/database.py):

```sql
CREATE INDEX IF NOT EXISTS idx_store_geo ON store USING GIST (
  (ST_MakePoint(longitude, latitude)::geography)
)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
```

SPC-03 nearby 쿼리 [`backend/routers/discover.py`](../backend/routers/discover.py):

```sql
WHERE ST_DWithin(
  ST_MakePoint(longitude, latitude)::geography,
  ST_MakePoint(:lng, :lat)::geography,
  :radius
)
```

**위험**: PG planner 가 함수형 인덱스를 매치하려면 쿼리의 표현식이 인덱스 정의와 **정확히** 일치해야 함. `WHERE` predicate (`latitude IS NOT NULL AND longitude IS NOT NULL`) 가 쿼리에 없으면 부분 인덱스 미사용 가능. 또한 `ST_DWithin` 첫 인자 + 인덱스 표현식 매치도 확인 필요.

**검증 (운영 VM)**:
```sql
EXPLAIN ANALYZE SELECT id FROM store
WHERE ST_DWithin(
  ST_MakePoint(longitude, latitude)::geography,
  ST_MakePoint(138.93, 35.31)::geography,
  800
)
AND latitude IS NOT NULL AND longitude IS NOT NULL;
```
계획에 `Index Scan using idx_store_geo` 가 등장하지 않으면 폴백 → 인덱스 재정의 필요.

---

### 6. 시퀀스 (sequence) 현재값이 MAX(id) 와 일치하는지 미검증

`pg_data_migrator.py` 는 끝에서 시퀀스 재설정을 한다고 했으나 운영 컷오버 직후 검증 도구 없음. 신규 INSERT 시 PK 충돌 가능성.

**검증 (운영 VM)**:
```sql
SELECT 'store' AS table, MAX(id) AS max_id,
       (SELECT last_value FROM store_id_seq) AS seq_last
FROM store
UNION ALL
SELECT 'order', MAX(id), (SELECT last_value FROM order_id_seq) FROM "order"
UNION ALL
SELECT 'orderitem', MAX(id), (SELECT last_value FROM orderitem_id_seq) FROM orderitem;
-- seq_last >= max_id 여야 안전.
```

**불일치 시**: `SELECT setval('store_id_seq', (SELECT MAX(id) FROM store));`

---

## 🟠 P1 — 출시 후 D+7 이내

### 7. `datetime.now()` vs `datetime.utcnow()` 혼용 — 30개 파일 86곳

검색: `Grep "datetime.now\(\)|datetime.utcnow\(\)" backend/` → 86 hits in 30 files.

**확인된 사례**:
- [`backend/routers/menu_groups.py:266`](../backend/routers/menu_groups.py) — `now = datetime.now()` (naive, 서버 로컬 timezone)
- 대부분은 `datetime.utcnow()` (UTC naive)
- [`backend/workers/food_rescue_scheduler.py:61`](../backend/workers/food_rescue_scheduler.py) — `datetime.now(JST)` (timezone-aware, 모범 사례)

**위험**:
- DB DATETIME 컬럼은 timezone 미보유 → 어느 timezone 기준으로 저장됐는지 코드 caller 마다 다름
- `business_hours.py:get_close_time_today` 는 naive datetime 을 받아 `weekday()`/`replace(hour=...)` 사용 — caller 가 JST 가 아닌 UTC 를 넘기면 영업시간 판정 9시간 오차 (식당이 일찍 닫힘으로 판정)
- food_rescue_scheduler 는 JST 명시했으나, 다른 caller (예: 손님 메뉴 노출 판정) 가 동일 헬퍼 호출 시 어떤 timezone 넘기는지 검증 필요

**조치**:
- 전 코드 `datetime.utcnow()` 통일 + DB 저장은 UTC
- 표시 / 영업시간 비교 시점에만 JST 변환 (pytz/zoneinfo)
- 또는 모델의 datetime 컬럼들을 `TIMESTAMPTZ` 로 마이그레이션 (대공사)

**검증 (단위 테스트 권장)**: business_hours.py 에 UTC/JST 양쪽 입력으로 caller 가정을 명시.

---

### 8. `init_db()` 가 매 부팅마다 231개 ALTER 실행 + 다중 워커 race

[`backend/database.py:50-254`](../backend/database.py):

- uvicorn 다중 워커 (운영: `--workers 4` 시) 모두 부팅 시 `init_db()` 호출 가능
- 큰 테이블 (`order`, `orderitem`, `eventlog` 50만 행 가정) 에 ALTER 시 PG 가 ACCESS EXCLUSIVE lock — 다른 워커 부팅 / 활성 트래픽 블로킹

**조치**:
- `init_db()` 호출을 단일 워커로 제한 (env `INIT_DB_ROLE=primary` 같은 플래그)
- 또는 마이그레이션을 부팅에서 분리 → Alembic + 운영자 `alembic upgrade head` 수동 실행
- 그 전까지 임시: 운영 부팅 전에 마이그레이션이 더 이상 추가 안 됨을 확인 + 부팅 시간 모니터링

---

### 9. uvicorn worker 수 미지정

[`Dockerfile:25`](../Dockerfile):
```dockerfile
CMD ["uv","run","uvicorn","backend.main:app","--host","0.0.0.0","--port","8003","--app-dir",".","--reload"]
```

`--reload` + 단일 워커. 운영 systemd 서비스 (deploy.py 설정) 도 확인 필요.

**위험**: 50개 식당 점심 피크 (12:00 JST) 에 단일 프로세스 처리. uvicorn 단일 워커 + asyncpg → 동시 요청은 처리하나 CPU bound 부분 (Square 결제 검증, JSON 직렬화) 에서 직렬화 → 응답 지연.

**조치**:
- 운영 systemd 의 ExecStart 확인 → `--workers 4` 권장 (VM CPU 코어 기준)
- 워커 4개 × `pool_size=10` = 40 connections + 여유 → Cloud SQL 인스턴스 max_connections 확인 (보통 200 이상)

---

### 10. JSON-as-TEXT 컬럼 (PG JSONB 미사용)

[`backend/database.py:64`](../backend/database.py):
```sql
ALTER TABLE menu ADD COLUMN IF NOT EXISTS options TEXT DEFAULT '[]'
```

코드는 `json.loads(menu.options)` 패턴. PG JSONB native 활용 안 함.

**위험**:
- 인덱싱 불가 (JSONB 는 GIN 인덱스 가능)
- WHERE / 집계 쿼리에서 JSON 필터 못 함 → 전 행 로드 후 Python 필터 (N+1 유사 패턴)
- TEXT escape 처리 위험 (직접 SQL 작성 시)

**조치**: 대공사. SPC 후속 사이클에서 처리 권장 — 영향 컬럼: `menu.options`, `menu.allergens`, `store.business_hours`, `store.interior_photos`, `store.exterior_photos`, `store.nearby_attractions`, `store.extra_translations`, `orderitem.option_details`, `webhookevent.payload`.

---

### 11. SettingView / register UI 의 토글 race vs cron

SPC-02 food_rescue_check actor 는 5분 마다 실행. SPC-11 SettingView 의 수동 토글이 cron 발동 직후 눌리면:

```
T+0:00 — cron: food_rescue_manual_active = True
T+0:30 — 사장님 수동 OFF (False)
T+5:00 — cron: True 로 다시 덮어씀
```

**현재 코드 보호**: `food_rescue_scheduler.py:73` `Store.food_rescue_mode == "auto"`. 사장님이 SettingView 에서 `manual` 모드 선택해야 수동 토글이 영구. 단, UX 명확성 (사장님이 모드 차이 이해?) 확인.

**조치**: 사용자 가이드 + SettingView UI 의 모드 선택 디자인 검토 (SPC-11 확장).

---

## 🟡 P2 — 운영 관찰 후 결정

### 12. 운영 PG 설정 (운영자 영역)

| 항목 | 권장 | 검증 명령 |
|---|---|---|
| `autovacuum_vacuum_cost_delay` | 2ms (high-churn 테이블) | `SHOW autovacuum_vacuum_cost_delay;` |
| `pg_stat_statements` | 활성화 + Top 10 모니터링 | `SELECT * FROM pg_extension WHERE extname='pg_stat_statements';` |
| `max_connections` | 200+ | `SHOW max_connections;` |
| `shared_buffers` | RAM 의 25% | `SHOW shared_buffers;` |
| autovacuum tuning | `eventlog`/`orderitem`/`webhookevent` 별도 설정 | — |

### 13. Cloud SQL automated backup / PITR

운영자 콘솔 확인:
- automated backup: 일 1회, 보관 7~30일
- PITR (Point-in-Time Recovery): 활성화 권장
- failover replica: 베치헤드 50개 식당 출시 후 검토

### 14. Alembic baseline stamp 미완 (OPR-07)

[`alembic/env.py:4-5`](../alembic/env.py) 주석:
> 운영 DB에는 운영자가 1회 `alembic stamp head` 실행하여 baseline 마킹 (OPR-07).

**조치**: 운영 VM 에서:
```bash
cd ~/qr-order-system && uv run alembic stamp head
```
이후 신규 스키마 변경은 `alembic revision --autogenerate -m "..."` + 검토 + `alembic upgrade head` 패턴으로.

### 15. 단일 PG 인스턴스 한계 추정

- 50 매장 × 평균 일 100 주문 = 5,000 주문/일, 피크 12:00 1시간에 25% (1,250 주문) = 약 21 주문/분
- orderitem 평균 3 = 63 INSERT/분 + select 트래픽
- 현 사이즈 (Cloud SQL db-f1-micro / db-g1-small 인스턴스 가정) 충분. 단 500 매장 확장 시 read replica 분기 검토

### 16. Redis 단일 인스턴스 (WS pub/sub + Dramatiq + idempotency)

3개 책임이 동일 인스턴스. 50 매장 동시 WS 연결 50~200개 가정 시 OK. 1000+ 시 분리 검토.

### 17. 역사적 마이그레이션 도구 보존 vs 폐기

`tools/migration_check.py`, `tools/pg_data_migrator.py`, `tools/rollback_resync.py` 는 MySQL→PG 도구로 코드에 MySQL 잔재. **2026-06-02 (DBM-13 D+14, MySQL purge 일) 이후** `tools/archive/` 로 이동 권장.

---

## 검증 체크리스트 (운영 VM 에서 1회 실행)

```bash
# 1. KitchenMode 정규화 상태
psql -c "SELECT DISTINCT kitchen_mode FROM store;"

# 2. DATETIME 컬럼이 실제 TIMESTAMP 로 생성됐는지
psql -c "SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'store' AND column_name IN
         ('trial_start_date','subscription_expires_at');"

# 3. 시퀀스 vs MAX(id)
psql -c "SELECT 'store' tbl, MAX(id) max_id,
         (SELECT last_value FROM store_id_seq) seq
         FROM store
         UNION ALL SELECT 'order', MAX(id),
         (SELECT last_value FROM order_id_seq) FROM \"order\"
         UNION ALL SELECT 'orderitem', MAX(id),
         (SELECT last_value FROM orderitem_id_seq) FROM orderitem;"

# 4. PostGIS GIST 인덱스 사용 여부
psql -c "EXPLAIN ANALYZE SELECT id FROM store
         WHERE ST_DWithin(
           ST_MakePoint(longitude, latitude)::geography,
           ST_MakePoint(138.93, 35.31)::geography, 800
         ) AND latitude IS NOT NULL AND longitude IS NOT NULL;"

# 5. pg_stat_statements 활성화 여부
psql -c "SELECT extname FROM pg_extension WHERE extname='pg_stat_statements';"

# 6. autovacuum 설정
psql -c "SHOW autovacuum; SHOW autovacuum_vacuum_cost_delay;"

# 7. 부팅 시 마이그레이션 stderr 확인
journalctl -u qrorder --since "1 hour ago" | grep -i "Migration skipped\|does not exist"

# 8. Alembic baseline
cd ~/qr-order-system && uv run alembic current
# (출력이 head 이어야 함)
```

---

## 다음 단계

1. **P0 (#1~#5)**: 코드 수정 1~2 시간 — 권고 즉시 처리
2. **P0 (#6) + 검증 체크리스트 1~4번**: 운영자 SSH 점검 30분
3. **P1 (#7~#11)**: STB-08 하위 카드 또는 신규 사이클로 분리
4. **P2 (#12~#17)**: 출시 후 1 주일 관찰 + 결정
5. **GPT-5.5 교차 검토**: 본 문서를 입력으로 [`gpt-pg-risk-review-instructions.md`](./gpt-pg-risk-review-instructions.md) 의 질문에 답변 요청
