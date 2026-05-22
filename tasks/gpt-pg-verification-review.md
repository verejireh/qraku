# GPT PG Verification Review

**작성일**: 2026-05-22  
**대상**: `stabilize/post-pg-cutover` @ `faf87aa`  
**검토 문서**:
- `tasks/pg-cutover-risk-audit.md`
- `tasks/pg-cutover-verification-results.md`
- `tasks/gpt-pg-verification-review-instructions.md`

## 총평

Claude의 검증 결과는 P0 6개 중 **1, 2, 6은 운영 DB 증거로 닫기에 충분**하고, **3, 4는 코드 수정 증거로 닫을 수 있으나 1회 실행 smoke가 있으면 더 단단**합니다. **5(PostGIS GIST)는 "인덱스 predicate/expression이 planner에 매칭된다"는 점은 확인됐지만, 현재 lat/lng가 0건인 상태라 실제 데이터 분포에서의 성능 P0까지 닫는 근거로는 부족**합니다.

신뢰도 점수: **82/100**

감점 사유는 CHECK 4의 데이터 0건 한계, `pg_stat_statements` 미활성화, Alembic baseline 실패, 그리고 restart loop 대응 unit의 몇 가지 운영상 날카로운 부분입니다.

## CHECK 1~8 검토

### CHECK 1: KitchenMode

`SELECT DISTINCT kitchen_mode FROM store`가 `KDS`만 반환했고, 코드도 `KitchenMode.KDS = "KDS"`로 맞춰져 있습니다. `backend/database.py`의 정규화 UPDATE도 `WHERE kitchen_mode::text = 'kds'`로 바뀌어 enum literal parse 실패를 피합니다.

판정: **P0 닫힘 충분**

추가 확인:
- 다음 deploy/restart 이후 `journalctl -u qrorder --since ... | grep -i "invalid input value for enum"` 0건 확인.

### CHECK 2: TIMESTAMP

운영 DB의 `trial_start_date`, `subscription_expires_at`가 `timestamp without time zone`이고, 코드의 `DATETIME`도 `TIMESTAMP`로 정리됐습니다.

판정: **P0 닫힘 충분**

잔여 리스크:
- P1 #7 timezone 통일과는 별도입니다. 타입 syntax P0는 닫혔지만, naive UTC/JST 혼용은 아직 남은 P1입니다.

### CHECK 3: Sequence

`tools/check_pg_sequences.py`가 28개 테이블에서 `next_value >= MAX(id)+1` 조건을 확인했습니다. 대표 시퀀스도 모두 정상입니다.

판정: **P0 닫힘 충분**

보강:
- tool의 PYTHONPATH 의존성은 이미 별도 개선 대상으로 잡은 것이 맞습니다. 검증 자체의 신뢰도를 크게 흔들지는 않습니다.

### CHECK 4: PostGIS GIST

`EXPLAIN ANALYZE`에서 `Index Scan using idx_store_geo`가 나온 것은 중요합니다. 적어도 아래 두 가지는 검증됐습니다.

- partial index predicate와 쿼리 predicate가 planner에서 매칭된다.
- `ST_MakePoint(longitude, latitude)::geography` expression index가 `ST_DWithin` 조건에 사용 가능하다.

하지만 현재 `store` 6건 모두 lat/lng가 NULL이라 실제 qualifying row가 0건입니다. 이 상태에서는 selectivity, heap fetch, filter cost, 반경 확대 시 planner 선택, 실제 nearby endpoint p95까지는 검증되지 않습니다.

판정:
- **기능적 P0: 닫힘 가능**
- **성능 P0: 조건부 닫힘. 최소 1건 이상의 lat/lng 데이터로 재검증 권장**

권장 추가 SQL:

```sql
BEGIN;
UPDATE store
SET latitude = 35.31, longitude = 138.93, allow_public_listing = true
WHERE id = (SELECT id FROM store LIMIT 1);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM store
WHERE ST_DWithin(
  ST_MakePoint(longitude, latitude)::geography,
  ST_MakePoint(138.93, 35.31)::geography,
  800
)
AND latitude IS NOT NULL AND longitude IS NOT NULL;

ROLLBACK;
```

가능하면 `tools/pg_query_audit.py`로 `/api/discover/nearby` p95도 같이 확인해야 합니다.

### CHECK 5: pg_stat_statements

미활성화 상태입니다. P0는 아니지만, PG 컷오버 이후 성능 회귀를 운영에서 잡는 핵심 장치라 우선순위는 높습니다.

판정: **P2라기보다 OPR-15 High**

권장:
- Cloud SQL flag 적용
- `CREATE EXTENSION pg_stat_statements`
- restart 필요 여부와 maintenance window 확인

### CHECK 6: autovacuum / max_connections

autovacuum 설정은 양호합니다. 다만 `max_connections=100`은 현재 `backend/database.py`의 pool 설정과 worker 증설 계획을 같이 보면 빠듯합니다.

현재 코드:
- `pool_size=10`
- `max_overflow=20`
- 프로세스당 최대 30 connection

`--workers 4` 적용 시 backend만 최대 120 connection을 요구할 수 있습니다. Dramatiq, Alembic, 수동 psql까지 고려하면 `max_connections=100`과 충돌합니다.

판정: **현 single worker 운영은 OK. worker 증설 전에는 pool/connection 계획 선행 필요**

권장:
- worker 증설 전 `pool_size=5`, `max_overflow=5~10` 등으로 조정하거나 Cloud SQL `max_connections`를 먼저 올릴 것.
- PgBouncer 도입 전까지는 worker 수와 pool 총량을 명시적으로 계산.

### CHECK 7: startup migration stderr

9cd70de 이후 enum stderr가 사라졌다는 운영 로그 근거는 유효합니다. `faf87aa`의 `::text` WHERE 보강은 다음 restart의 noise 제거에 적절합니다.

판정: **P0 닫힘 충분**

단, `init_db()`가 non-ignored migration error를 stderr로만 출력하고 부팅은 계속하는 구조는 장기적으로 위험합니다. 컷오버 안정화 기간에는 허용 가능하지만, Alembic 전환 전까지는 "non-ignored migration skipped 발생 시 healthz/readyz 또는 deploy가 실패"하도록 바꾸는 편이 운영적으로 더 안전합니다.

### CHECK 8: Alembic baseline

`No 'script_location' key found in configuration`은 P0는 아니지만, 향후 schema 변경 운영 절차에는 직접 장애입니다. 현재는 `init_db()` inline migration이 있기 때문에 서비스 부팅 자체는 가능하지만, Alembic으로 이행하려면 먼저 deploy package와 서버 작업 디렉터리의 `alembic.ini`/`alembic/` 정합성을 맞춰야 합니다.

판정: **OPR-07 유지. Alembic 이행 전 blocker**

## P0 닫힘 선언

권장 판정:

| 항목 | 판정 | 근거 |
|---|---|---|
| P0 #1 KitchenMode | 닫힘 | 운영 DB + 코드 일치 |
| P0 #2 DATETIME | 닫힘 | 운영 DB 타입 + 코드 수정 |
| P0 #3 seed_data.py | 닫힘 가능 | 코드상 PG SQL로 수정됨. 실행 smoke 권장 |
| P0 #4 reseed_demo.py | 닫힘 가능 | `"table"` + bind param 수정됨. 실행 smoke 권장 |
| P0 #5 PostGIS GIST | 조건부 닫힘 | index plan은 확인. lat/lng 0건이라 성능 검증은 부족 |
| P0 #6 sequences | 닫힘 | 28개 sequence 검증 통과 |

최종적으로 **"P0 앱 부팅/데이터 무결성 리스크는 닫힘, PostGIS 성능 리스크는 추가 nearby 실데이터 검증 후 완전 닫힘"**으로 표현하는 것이 가장 정확합니다.

## restart loop 원인 가설 검토

orphan uvicorn이 8003을 잡고 있었고, systemd의 새 프로세스가 bind 실패로 반복 재시작했다는 결론은 타당합니다. `PPID=1`, `ss -tlnp`, `NRestarts`, kill 이후 정상화 흐름이 원인-결과를 잘 지지합니다.

다만 "deploy.py와 setup_server.sh 사이의 graceful shutdown timing"은 가능성 높은 가설이지 유일 원인으로 확정하기에는 증거가 부족합니다. 특히 `restart_uvicorn.sh`에는 여전히 `nohup ... uvicorn ... &` 패턴이 남아 있고, 과거 수동 실행 또는 setup fallback이 orphan을 만들었을 가능성도 있습니다.

추가로 확인하면 좋은 증거:
- orphan PID의 parent exit 시각 주변 shell history 또는 deploy log
- `journalctl -u qrorder`에서 stop timeout/SIGKILL 여부
- `/proc/<oldpid>/cgroup` 기록은 이미 사라졌겠지만, 다음 발생 시 즉시 캡처

## systemd unit 개선안 검토

방향은 맞습니다.

좋은 점:
- `After/Wants=cloud-sql-proxy.service`는 PG 컷오버 후 의존성으로 타당합니다.
- nohup fallback 제거는 매우 중요합니다.
- `KillMode=mixed` + `TimeoutStopSec=10`은 cgroup 밖 child를 줄이는 데 도움이 됩니다.
- deploy.py가 restart 전에 `sudo fuser -k -n tcp 8003`를 수행하는 것은 orphan 상황에 실효성이 있습니다.

주의할 점:

1. `ExecStartPre`는 `User=verejireh` 컨텍스트로 실행될 가능성이 큽니다. orphan이 같은 유저면 충분하지만, root 또는 다른 유저 프로세스면 kill하지 못하고 실패가 무시됩니다. 이 경우 bind loop가 재발할 수 있습니다.

2. `fuser -k`는 기본 signal이 강합니다. 운영 요청 처리 중인 정상 프로세스를 즉시 죽일 수 있으므로, deploy 경로에서는 괜찮더라도 unit start마다 무조건 실행하는 것은 조심해야 합니다.

3. `Restart=always`는 bind 실패 같은 deterministic failure에서 재시작 폭주를 만들 수 있습니다. `StartLimitIntervalSec`/`StartLimitBurst`가 없으면 이번처럼 NRestarts가 크게 쌓일 수 있습니다.

권장 unit 보강:

```ini
[Unit]
After=network.target cloud-sql-proxy.service
Wants=cloud-sql-proxy.service
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=5
TimeoutStopSec=10
KillMode=mixed
```

포트 정리는 systemd unit 내부보다는 deploy script의 privileged preflight에 두는 편이 더 예측 가능합니다. unit 내부에 남긴다면 TERM 후 짧게 대기하고 KILL fallback을 쓰는 2단계가 낫습니다.

## P1 #8 / #9 승격 여부

### P1 #8 init_db race

현재 single worker에서는 race 자체가 직접 P0는 아닙니다. 그러나 restart loop처럼 부팅이 반복되면 97개 DDL/UPDATE를 반복 실행해 DB와 로그에 부담을 주는 증폭 요인이 됩니다.

판정: **P1 High 유지. 단, `--workers > 1` 적용 전에는 P0 선행조건으로 승격**

권장 순서:
1. Strategy 1(enum cast)은 이미 적용됐으므로 다음 restart에서 stderr 0건 확인.
2. worker 증설 전 Strategy 2(advisory lock) 또는 Alembic 이행 중 하나를 반드시 적용.
3. 장기적으로 Strategy 3(Alembic)이 정답.

### P1 #9 uvicorn workers

restart loop 발견만으로 P0 승격할 필요는 없습니다. 현재 서비스는 single worker로 정상화됐고, worker 증설은 capacity 이슈입니다.

다만 worker 증설은 다음 조건 충족 전까지 보류해야 합니다.

- `init_db()` advisory lock 또는 Alembic 이행
- DB pool 총량 재계산
- Cloud SQL `max_connections` 조정 또는 pool 축소
- p95 audit 기준 통과

판정: **P1 유지. capacity work item으로 별도 분석 필요**

## 누락 가능성이 있는 추가 리스크

1. **Connection pool 총량**
   `pool_size=10`, `max_overflow=20`은 worker 증설과 맞물리면 바로 위험해집니다.

2. **non-ignored migration error swallowing**
   현재 `init_db()`는 예상 밖 migration failure도 로그만 남기고 부팅을 계속합니다. 컷오버 안정화 이후에는 deploy failure로 전환하는 것이 맞습니다.

3. **`restart_uvicorn.sh` legacy nohup**
   파일에 nohup 실행 경로가 남아 있습니다. 운영자가 실수로 실행하면 systemd 밖 orphan이 다시 생길 수 있습니다. 삭제 또는 "legacy/do-not-use"로 이동 권장.

4. **Dockerfile `--reload`**
   컨테이너 운영 경로가 살아 있다면 `--reload`는 production 기본값으로 부적절합니다. systemd 운영에는 직접 영향이 낮지만, 배포 경로가 늘어날 때 재발 가능성이 있습니다.

5. **pg_stat_statements 부재**
   성능 회귀 탐지가 어렵습니다. 안정화 기간에는 P2보다 높게 다루는 편이 낫습니다.

## 추가 SSH 검증 명령

우선순위 순서:

```bash
# 1. 다음 restart 후 enum/DATETIME migration noise 확인
sudo systemctl restart qrorder
sleep 15
journalctl -u qrorder --since "2 minutes ago" --no-pager \
  | grep -Ei "Migration skipped|invalid input value|does not exist|address already in use" || true
```

```bash
# 2. service ownership / cgroup / restart 폭주 확인
systemctl show qrorder -p MainPID -p NRestarts -p ActiveState -p SubState
systemctl status qrorder --no-pager
ps -eo pid,ppid,user,etimes,cmd | grep '[u]vicorn'
ss -tlnp | grep ':8003'
```

```bash
# 3. lat/lng 1건 이상으로 PostGIS plan 재검증
psql "$DATABASE_URL_SYNC" -c "
BEGIN;
UPDATE store
SET latitude = 35.31, longitude = 138.93, allow_public_listing = true
WHERE id = (SELECT id FROM store LIMIT 1);
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM store
WHERE ST_DWithin(
  ST_MakePoint(longitude, latitude)::geography,
  ST_MakePoint(138.93, 35.31)::geography,
  800
)
AND latitude IS NOT NULL AND longitude IS NOT NULL;
ROLLBACK;"
```

```bash
# 4. Alembic package/config 정합성
cd ~/qr-order-system
ls -la alembic.ini alembic
grep -n "script_location" alembic.ini
PYTHONPATH=. ./.venv/bin/python -m alembic current
```

```bash
# 5. pg_stat_statements 상태
psql "$DATABASE_URL_SYNC" -c "SHOW shared_preload_libraries;"
psql "$DATABASE_URL_SYNC" -c "SELECT extname FROM pg_extension WHERE extname='pg_stat_statements';"
```

## 운영 우선순위 제안

1. **즉시**: 다음 restart에서 CHECK 7 재확인. `address already in use`와 enum stderr가 모두 0건이어야 함.
2. **즉시**: `restart_uvicorn.sh` legacy nohup 경로 제거 또는 archive 처리.
3. **1일 내**: CHECK 4를 lat/lng 1건 이상으로 재검증하고 nearby p95를 측정.
4. **1일 내**: pg_stat_statements 활성화 계획 확정.
5. **worker 증설 전**: advisory lock 또는 Alembic 이행, DB pool 총량 조정.
6. **D+7 전**: Alembic baseline 문제 해결.

## 결론

P0 close 선언은 대체로 타당합니다. 다만 문구는 아래처럼 제한을 명시하는 것이 정확합니다.

> "P0 데이터/부팅 호환성 항목은 닫힘. PostGIS GIST는 planner index 사용을 확인했으나 실 좌표 데이터 기반 p95 검증이 남아 있어 성능 리스크는 P1/OPR 후속으로 추적."

restart loop는 이미 복구됐지만 운영 사고에 가까운 신호입니다. root cause는 orphan uvicorn으로 보는 것이 합리적이고, unit 개선 방향도 맞습니다. 다만 worker 증설과 inline migration은 아직 결합하면 위험하므로, P1 #8은 worker 증설의 선행조건으로 다뤄야 합니다.
