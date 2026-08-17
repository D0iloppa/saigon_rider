# 키워드 알림 — 자동 테스트 추가 (WB)

W1 감사(§⑤ "테스트 절차 제안") 후속. **프로덕션 코드는 이미 구현 완료** — 이 작업은 테스트만
추가한다. `market.py`/`noti_worker/__main__.py`/`models.py`/`schemas.py`/`search_norm.py` diff 0줄.

## 신규/수정 테스트 파일

- **신규**: `backend/app/tests/test_market_keyword_alerts.py` — GET/POST/PATCH/DELETE 4개 엔드포인트 + 헬퍼(`_keyword_alert_max_count`) 18개 테스트. 기존 `test_market_completion_request.py`/`test_market_sold_terminal.py` 의 `AsyncMock(db)` + `db.execute = AsyncMock(side_effect=[...])` 순차응답 패턴 그대로 미러.
- **수정**: `backend/app/tests/test_noti_worker_idempotency.py` — 기존 `NotificationWorkerIdempotencyTest` 클래스에 3개 테스트 추가(`_SessionContext`/`postgresql.dialect()` 컴파일 검사 패턴, 기존 코드 그대로 재사용). import 1줄 추가(`from app.services.search_norm import norm`). 기존 테스트·클래스 구조는 손대지 않음(순수 추가).

## 불변식 ↔ 테스트 대조표

| # | 불변식 | 테스트 |
|---|---|---|
| 1 | 베트남어 성조 정규화 매칭 (`mu bao hiem` ↔ `Mũ bảo hiểm`) | `test_noti_worker_idempotency.py::test_matching_query_title_norm_matches_vietnamese_diacritic_registration` — 워커가 계산한 `title_norm` 리터럴이 `norm("Mũ bảo hiểm size M") == "mu bao hiem size m"` 과 SQL 리터럴로 일치함을 확인. (기저 `norm()` 자체 케이스는 기존 `test_search_norm.py` 가 이미 커버 — 중복 작성 안 함) |
| 2 | SQL `strpos` (LIKE 아님), `%`/`_` 리터럴 취급 | `test_noti_worker_idempotency.py::test_matching_query_uses_strpos_and_excludes_empty_norm` — payload title `"50% off helmet_sale"` 로 실행 후 컴파일된 statement 에 `strpos(` 존재·` like `(대소문자 무관) 부재 확인 |
| 3 | 빈/NULL `keyword_norm` 매칭 대상 제외 | 위와 동일 테스트에서 컴파일된 SQL에 `keyword_norm != ''`, `keyword_norm IS NOT NULL` 존재 확인 |
| 4a | 최소길이 미달 → 422 `keyword_too_short` | `test_market_keyword_alerts.py::AddKeywordAlertTest::test_too_short_keyword_rejected_before_any_db_call` (db 미호출까지 확인) |
| 4b | 금칙어 → 400 `banned_keyword` (norm 통과 후 비교) | `AddKeywordAlertTest::test_banned_keyword_rejected_after_normalization` — 성조 다른 입력(`cấm từ`)이 정규화된 금칙어(`cam`)와 매치 |
| 4c | 상한 초과 → 422 `keyword_alert_limit` | `AddKeywordAlertTest::test_limit_exceeded_rejects_new_keyword` |
| 4d | 중복 등록(대소문자/성조 무관) → idempotent, 상한 체크 스킵 | `AddKeywordAlertTest::test_duplicate_keyword_is_idempotent_and_skips_cap_check` (execute 호출수=2 로 count 쿼리 미실행 실증), `UpdateKeywordAlertTest::test_duplicate_with_other_row_returns_existing` |
| 5 | 소유권(`user_id != session_uid` → 403) — GET/POST/PATCH/DELETE 전부 | `GetKeywordAlertsOwnershipTest::test_forbidden_for_other_user`, `AddKeywordAlertTest::test_forbidden_when_user_mismatch`, `UpdateKeywordAlertTest::test_forbidden_for_non_owner` + `test_body_user_id_mismatch_forbidden`, `DeleteKeywordAlertTest::test_forbidden_for_non_owner` |
| 6 | 상한값 출처: `app_config(market.keyword_alert_max_count)`, 없으면 20, 비정수도 20 | `KeywordAlertMaxCountTest::test_default_when_no_config_row`, `test_reads_configured_value`, `test_non_integer_value_falls_back_to_default` |
| 7 | 토글 불변식 — 인앱은 항상 기록, off 는 푸시만 게이트 | `test_noti_worker_idempotency.py::test_keyword_alert_off_still_inserts_notification_row` (신규 — 기존엔 `dm`/`event` 타입만 있었고 `keyword_alert` 타입 전용 케이스가 없었음) |

부가 커버: PATCH/DELETE 404(`test_not_found` 각 2건), PATCH/POST 성공 시 `keyword_norm` 컬럼 저장 확인(`test_new_keyword_under_cap_is_created`, `test_success_updates_keyword_and_norm`), DELETE 성공 시 `db.delete`/`db.commit` 호출 확인.

## 실행 결과 (그대로 붙여넣기)

```
$ docker exec -w /app saigon_bff python -m unittest app.tests.test_market_keyword_alerts -v
Ran 18 tests in 0.054s
OK

$ docker exec -w /app saigon_bff python -m unittest app.tests.test_noti_worker_idempotency -v
Ran 14 tests in 0.268s
FAILED (errors=2)   ← 아래 "발견했지만 고치지 않은 문제" 참조. 신규 추가 3건은 전부 ok.
```

신규 추가 3건 개별 결과(같은 실행 로그에서 발췌):
```
test_keyword_alert_off_still_inserts_notification_row ... ok
test_matching_query_title_norm_matches_vietnamese_diacritic_registration ... ok
test_matching_query_uses_strpos_and_excludes_empty_norm ... ok
```

합산 실행:
```
$ docker exec -w /app saigon_bff python -m unittest app.tests.test_market_keyword_alerts app.tests.test_noti_worker_idempotency -v
Ran 32 tests in 0.130s
FAILED (errors=2)
```

## 발견했지만 고치지 않은 문제

- `test_noti_worker_idempotency.py` 의 **기존(내가 작성하지 않은) 2개 테스트**가 이 컨테이너 환경에서 이미 실패 중이었다:
  - `test_fresh_init_migration_matches_model_contract`, `test_compose_applies_migration_before_bff_and_worker`
  - 원인: `Path(__file__).resolve().parents[3]` 로 리포 루트를 추정해 `docker-compose.yml`/`database/init/*.sql` 를 읽으려 하는데, `saigon_bff` 컨테이너의 `/app` 아래엔 그 파일들이 마운트돼 있지 않음(`FileNotFoundError: /docker-compose.yml`, `/database/init/...`).
  - `git show HEAD -- backend/app/tests/test_noti_worker_idempotency.py` 로 확인 — 이 두 테스트는 내가 손대지 않은 기존 코드 그대로이고, 내 신규 테스트 3건과 무관한 사전 존재 실패다(컨테이너 마운트/경로 구성 이슈로 추정, 코드 버그 여부는 이 과업 범위 밖 — 프로덕션 코드 수정 금지 지침에 따라 손대지 않았고, 이 테스트 파일도 그 두 테스트 자체는 건드리지 않았다).
  - **조치 안 함**: 과업 범위(신규 테스트 추가) 밖이며, 원인이 테스트 코드가 아니라 컨테이너 마운트 구성일 가능성이 커서 원인 확정 없이 손대는 것은 과잉수정. 보고만 한다.
- `add_keyword_alert` 의 `pg_advisory_xact_lock` 직렬화는 실제 동시성(레이스) 자체를 테스트하지 못했다(단위 테스트 레벨에서 advisory lock 은 그냥 통과되는 모킹 호출이라, 진짜 동시 요청 레이스 재현은 이 스위트의 기존 아키텍처(전부 mocked-db 유닛테스트, 실제 Postgres 붙는 통합테스트 프레임워크 자체가 이 리포에 없음) 밖의 별도 통합/부하테스트가 필요 — 발명 금지 지침에 따라 새 프레임워크를 만들지 않았다).

## 미완 항목

- 없음 — 요청된 불변식 1~7 전부 커버.

## 요약 (최종 응답과 동일)

신규 파일 `backend/app/tests/test_market_keyword_alerts.py`(18 tests, 전부 OK) + 기존 파일 `backend/app/tests/test_noti_worker_idempotency.py` 에 3개 테스트 추가(전부 OK). 커버 불변식 1~7 전부 최소 1개 테스트로 고정. 프로덕션 코드 diff 0줄. 기존 관례(AsyncMock(db) + side_effect 순차응답, `_SessionContext` + `postgresql.dialect()` 컴파일 검사)를 그대로 미러링했고 새 픽스처/프레임워크는 만들지 않았다. `test_noti_worker_idempotency.py` 의 기존 2개 테스트(`test_fresh_init_migration_matches_model_contract`, `test_compose_applies_migration_before_bff_and_worker`)가 이 컨테이너 환경에서 파일 경로(`/docker-compose.yml` 등 마운트 부재)로 실패 중이었으나 내가 작성한 테스트와 무관한 사전 존재 이슈로 확인, 프로덕션/테스트 코드 모두 수정하지 않고 보고만 한다.
