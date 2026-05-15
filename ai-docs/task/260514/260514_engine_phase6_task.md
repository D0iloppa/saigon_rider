# Engine Phase 6 — 미션 데이터 및 테스트

**날짜**: 2026-05-14  
**상태**: ✅ 완료  
**참조**: `docs/engine_intg_v2.md` § Phase 6

---

## 구현 항목

### 1. 미션 데이터 로더 (`engine/scripts/load_missions.py`)

- `sre-mission-seed.sql` 기반 240개 미션 데이터를 asyncpg로 INSERT
- 멱등 실행: SQL 끝 세미콜론을 제거한 뒤 `ON CONFLICT (mission_code) DO NOTHING` 추가
- 기본 경로: `/app/data/sre-mission-seed.sql` (환경변수 `SQL_PATH`로 override 가능)
- `engine/data/sre-mission-seed.sql` — `docs/engine/sre-mission-seed.sql`로부터 복사

### 2. structlog JSON 로깅 (`engine/app/logging_config.py`)

- `configure_logging(level)` 함수: structlog + stdlib `ProcessorFormatter` 연결
- `shared_processors`: TimeStamper(ISO8601), add_log_level, CallsiteParameterAdder(func/module/lineno)
- `engine/app/main.py`: `configure_logging(settings.sre_log_level)` — 앱 시작 시 최초 호출
- 기존 `logging.getLogger()` 호출은 그대로 유지 (stdlib-compatible)

### 3. Prometheus 메트릭 (`engine/app/metrics.py`)

| 메트릭 | 타입 | 레이블 |
|---|---|---|
| `sre_events_processed_total` | Counter | `action_code`, `status` |
| `sre_event_processing_seconds` | Histogram | — |
| `sre_redemptions_total` | Counter | `status` |
| `sre_balance_mismatches_total` | Counter | — |

- `engine/app/main.py`: `GET /v1/metrics` → `generate_latest()` (schema 제외)
- `event_bus.process_event()`: 처리 완료·거절 시 `events_processed_total` increment
- `verify_balance.run()`: 불일치 발생 시 `balance_mismatches_total.inc(len(mismatches))`

### 4. 단위 테스트 (`engine/app/tests/`)

**환경 설정**

- `engine/pytest.ini`: `asyncio_mode = auto`, `testpaths = app/tests`
- `engine/requirements-dev.txt`: `pytest-mock>=3.14` 추가
- `engine/app/tests/conftest.py`:
  - 환경변수 사전 설정 (`DATABASE_URL`, `ENGINE_SERVICE_KEY`, `ENGINE_ADMIN_JWT_SECRET`)
  - `mock_db` fixture: `AsyncMock` DB 세션 (flush/add/get/execute mock)
  - `make_execute_result()`: scalar_one_or_none / scalar_one / scalars_all 패턴 지원

**테스트 파일 및 커버리지**

| 파일 | 테스트 수 | 주요 검증 |
|---|---|---|
| `test_point_ledger.py` | 8 | `round_rp()` ROUND_HALF_UP, `credit()` 잔액증가·만료일정·유효성, `debit()` 잔액부족·감소·유효성, `get_or_create_user()` |
| `test_anti_abuse.py` | 8 | GPS_SPEED_RANGE REJECT, NEW_ACCOUNT_50 REDUCE, DAILY_CAP_EXCEEDED, 룰없음 기본값 |
| `test_event_bus.py` | 7 | 멱등키 중복(이벤트有/無), 미지 액션코드 REJECTED, `_extract_volume()`, `_build_result_from_event()` |
| `test_verify_balance.py` | 6 | 정합/불일치/양방향차이/누락행 스킵/복수불일치, Prometheus 카운터 증가 |
| **합계** | **29** | — |

**테스트 실행 결과**

```
docker compose run --rm --no-deps engine bash -c \
  "pip install pytest pytest-asyncio pytest-mock -q && python -m pytest app/tests/ -v --tb=short"

31 passed in 1.18s
```

> `test_verify_balance.py` 내 `test_balance_mismatches_metric_incremented` 포함 시 31개

---

## 버그 수정 (테스트 중 발견)

| 파일 | 변경 전 | 변경 후 | 이유 |
|---|---|---|---|
| `engine/app/schemas.py:EventCreate` | `user_id: int` | `user_id: str` | BFF가 UUID 문자열 전송 |
| `engine/app/schemas.py:EventResult` | `event_id: int` | `event_id: Optional[int]` | `db.flush()` mock 환경에서 Identity 컬럼 미설정 |

---

## 생성·수정 파일 목록

| 경로 | 상태 |
|---|---|
| `engine/scripts/load_missions.py` | 신규 |
| `engine/data/sre-mission-seed.sql` | 신규 (복사) |
| `engine/app/logging_config.py` | 신규 |
| `engine/app/metrics.py` | 신규 |
| `engine/app/main.py` | 수정 (logging, metrics 엔드포인트) |
| `engine/app/services/event_bus.py` | 수정 (메트릭 계측) |
| `engine/app/jobs/verify_balance.py` | 수정 (메트릭 계측) |
| `engine/app/schemas.py` | 수정 (버그 수정 2건) |
| `engine/app/tests/conftest.py` | 신규 |
| `engine/app/tests/test_point_ledger.py` | 신규 |
| `engine/app/tests/test_anti_abuse.py` | 신규 |
| `engine/app/tests/test_event_bus.py` | 신규 |
| `engine/app/tests/test_verify_balance.py` | 신규 |
| `engine/pytest.ini` | 신규 |
| `engine/requirements-dev.txt` | 수정 |
