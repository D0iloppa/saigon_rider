# WE — 코드리뷰 지적 4건 수정 (260817_keyword_alert_audit)

리뷰에서 지적된 4건만 수정. `market.py` 의 `get_listings`/`get_listing`/`create_listing`/`update_listing`
(Q-1/Q-3/Q-8), `banned_keywords.py`, `dm.py` 는 다른 세션 작업이라 손대지 않음.

## F-1 백필 안 된 기존 구독이 조용히 죽는 문제 — 폴백 추가

**수정 지점**: `backend/app/noti_worker/__main__.py`
- import 라인 22: `from sqlalchemy import and_, func, literal, or_, select` (`and_`/`or_` 추가)
- `_handle_listing_created` docstring (약 180~191행)에 F-1 폴백 취지 추가
- WHERE 절 (약 210~226행): `keyword_norm` 유무에 따른 OR 분기

**최종 WHERE 형태** (SQLAlchemy 표현식 → 컴파일 시):
```sql
marketplace_keyword_alerts.user_id NOT IN (...)  -- blocked_by_seller
AND marketplace_keyword_alerts.user_id NOT IN (...)  -- blocking_seller
AND marketplace_keyword_alerts.user_id != :seller_id
AND (
    (
        marketplace_keyword_alerts.keyword_norm IS NOT NULL
        AND marketplace_keyword_alerts.keyword_norm != ''
        AND strpos(:title_norm, marketplace_keyword_alerts.keyword_norm) > 0
    )
    OR (
        marketplace_keyword_alerts.keyword_norm IS NULL
        AND marketplace_keyword_alerts.keyword != ''
        AND strpos(lower(:listing_title), lower(marketplace_keyword_alerts.keyword)) > 0
    )
)
```
- `keyword_norm` 이 있는 행 → 정규화 매칭(기존 동작 유지).
- `keyword_norm` 이 NULL(백필 전 기존 구독) → 원본 `keyword` 로 대소문자 무관 `strpos` 매칭(raw fallback).
- 빈 문자열 방어(`strpos(x, '')` 는 항상 1)는 정규화 쪽·raw 쪽 양쪽 모두 유지.
- SQL 로 `norm()` 재구현 없음 — 폴백 경로는 `lower()`(표준 SQL 함수)만 쓰고 성조 제거는 안 함(그건 백필 후에나 적용됨. 폴백은 "죽지 않게"가 목적이지 성조 정규화까지 대신하지 않음 — 확정 방침대로 SQL 에 정규화 로직 미이식).

**근거**: migration 180 은 `bff_migrate` 로 자동 실행되지만 백필 스크립트는 수동이라, 배포 직후~백필 전 구간에 기존 구독(`keyword_norm IS NULL`)이 매처의 `keyword_norm IS NOT NULL` 조건에 걸려 전건 매칭 불가였음. 폴백으로 이 구간에도 알림이 계속 나가게(단, 정규화 이점만 없이) 함.

또한 `backend/scripts/backfill_keyword_alert_norm.py` docstring 에 운영 배포 시 마이그레이션 180 적용 후 반드시 1회 실행하라는 안내와, 미실행 시 raw fallback 으로 동작(끊기지 않으나 정규화 이점 소실)한다는 취지 2줄 추가.

## F-2 PATCH 에 advisory lock 부재 — 추가

**수정 지점**: `backend/app/routers/market.py:1287~` `update_keyword_alert`, 소유권 검사(`if alert.user_id != session_uid or alert.user_id != body.user_id`) 통과 직후·중복조회(`existing = ...`) 직전에 삽입:
```python
await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key)::bigint)"), {"key": f"kw_alert:{body.user_id}"})
```
POST(`add_keyword_alert`)가 쓰는 것과 완전히 동일한 락 패턴·키(`kw_alert:{user_id}`). 새 방식 발명 없음.

**근거**: read-then-write 로 `uq_mp_kw_alert(user_id, keyword_norm)` 에 쓰는 경로가 락 없이 동시 PATCH×POST 수렴 시 양쪽 다 `existing is None` 을 보고 두 번째 커밋이 unique 위반 500. 락으로 직렬화해 두 번째 요청이 첫 번째 커밋 후의 `existing` 을 보게 함.

## F-3 `keyword` 최대길이 미검증 → 500 — 수정

**수정 지점**: `backend/app/schemas.py`
- `MarketplaceKeywordAlertCreateRequest.keyword` (약 318~320행): `keyword: str` → `keyword: str = Field(max_length=60)`
- `MarketplaceKeywordAlertUpdateRequest.keyword` (약 327~329행): 동일하게 `Field(max_length=60)`

`models.py:565` (`String(60)`) 과 정합 맞춤. 파일 내 기존 관례(`intro: str | None = Field(default=None, max_length=500)`, 1119/1130행)와 같은 표기법. 61자 이상 입력 시 이제 pydantic 422 로 떨어지고, DB `value too long` 500 은 발생하지 않음.

## F-4 SQL 파일 헤더 주석 파일명 오기 — 수정

**수정 지점**: `database/init/181_keyword_alert_max_count.sql:2` — 주석의 `180_keyword_alert_max_count.sql` → `181_keyword_alert_max_count.sql` 로 정정. 본문(INSERT 문)은 미변경.

## 테스트

### 기존 테스트 갱신 (F-2 락 추가로 인한 side-effect 순서 변경)

`backend/app/tests/test_market_keyword_alerts.py` 의 `UpdateKeywordAlertTest` 중 아래 2건 — 이제 `update_keyword_alert` 가 dedup 조회 전에 advisory-lock 1회 `db.execute` 를 추가로 호출하므로, 기존 `db.execute = AsyncMock(return_value=...)` (단일 응답) 로는 락 호출이 dedup 결과를 받아버려 깨짐. POST 테스트들이 이미 쓰는 `side_effect=[lock, dedup]` 리스트 패턴으로 갱신:
- `test_duplicate_with_other_row_returns_existing`
- `test_success_updates_keyword_and_norm`

사유: 버그가 아니라 F-2 로 의도적으로 추가된 새 불변식(락 선행 호출)이라 테스트를 새 동작 기준으로 갱신함.

### 신규 테스트 추가

1. `backend/app/tests/test_market_keyword_alerts.py::UpdateKeywordAlertTest::test_concurrent_patch_uses_same_advisory_lock_key_as_post` — PATCH 도 POST 와 동일한 `pg_advisory_xact_lock(hashtext(:key)::bigint)` SQL·키(`kw_alert:{user_id}`) 를 쓰는지 컴파일된 SQL 텍스트로 검증(F-2).
2. `backend/app/tests/test_noti_worker_idempotency.py::NotificationWorkerIdempotencyTest::test_listing_match_query_falls_back_to_raw_keyword_when_norm_is_null` — `test_atomic_insert_returns_whether_row_is_new` 의 컴파일된-SQL 검사 패턴을 미러링. `session.execute.await_args.args[0]` 를 postgresql dialect 로 컴파일해 `keyword_norm IS NULL`, `lower(marketplace_keyword_alerts.keyword)`, `keyword_norm IS NOT NULL` 이 모두 WHERE 절에 존재하는지 확인(F-1 폴백 고정).

### 실행 결과

```
$ docker exec -w /app saigon_bff python -m unittest app.tests.test_market_keyword_alerts app.tests.test_noti_worker_idempotency
----------------------------------------------------------------------
Ran 34 tests in 0.144s

OK
```

(컨테이너에 `docker-compose.yml`/`database/init` 이 마운트 안 돼 있어 `test_compose_applies_migration_before_bff_and_worker`/`test_fresh_init_migration_matches_model_contract` 가 FileNotFoundError 로 먼저 실패 — 안내된 대로 `docker cp` 로 두 파일을 컨테이너에 넣은 뒤 재실행해 통과 확인.)

### ruff

호스트 `ruff` (`/home/doil/.local/bin/ruff`) 로 변경 파일 전부 검사, 최초 1회 자작 코멘트에 쓴 전각 `×` 문자가 RUF002/RUF003(ambiguous unicode) 로 걸려 `x` 로 교체 후 클린:
```
$ ruff check app/routers/market.py app/schemas.py app/noti_worker/__main__.py \
    app/tests/test_market_keyword_alerts.py app/tests/test_noti_worker_idempotency.py \
    scripts/backfill_keyword_alert_norm.py
All checks passed!
```
(`.sql` 파일은 ruff 대상 아님 — E902 무시.)

### 컨테이너 재빌드/헬스체크

```
$ docker compose --env-file .env up --build -d bff noti_worker
```
최초 시도에서 Docker Desktop(WSL2) bind-mount 캐시 문제로 `saigon_bff_migrate` 컨테이너 생성이 `no such file or directory` 로 실패(신규 파일 `181_keyword_alert_max_count.sql` 관련, 내 변경과 무관한 환경 이슈) — `docker rm -f saigon_bff_migrate` 후 재시도로 해결. migrate 로그에서 180/181 마이그레이션 정상 적용 확인. 최종 `saigon_bff`/`saigon_noti_worker` 둘 다 healthy.

## 미완 항목

없음. 4건 전부 반영, 목표 조건 1~4 전부 충족.
