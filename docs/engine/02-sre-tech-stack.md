# SRE 기술 스택 보완 결정서 v1.0

> 발행일: 2026-05-13
> 대상: Saigon Rider Reward Engine v1
> 전제: `개발환경구성.md`의 기본 스택 (FastAPI + SQLAlchemy async + PostgreSQL 15 + Docker Compose + Nginx) 위에 SRE 운영에 필요한 항목을 추가 결정

기본 스택은 개발환경.md를 따르고, 이 문서는 **SRE를 짜기 위해 추가로 결정해야 하는 항목**만 다룹니다.

---

## 1. 패키지 구조 (모놀리식 내 모듈 분리)

설계서 §10의 v1 전략(같은 DB·같은 앱, 코드만 모듈화)에 맞춰 `backend/app/sre/` 서브패키지로 분리합니다.

```
backend/app/
├── main.py                    # 기존, sre.router 등록 추가
├── database.py                # 기존, SRE도 동일 엔진 사용
├── ...
└── sre/
    ├── __init__.py
    ├── config.py              # SRE 전용 설정 (BaseSettings)
    ├── models.py              # SQLAlchemy ORM (sre_user, action_event, ...)
    ├── schemas.py             # Pydantic 요청/응답
    ├── deps.py                # FastAPI 의존성 (인증, DB 세션)
    ├── enums.py               # Python Enum (DB enum과 1:1)
    ├── exceptions.py          # 비즈니스 예외 (InsufficientRpError 등)
    ├── routers/
    │   ├── events.py          # POST /v1/events
    │   ├── balance.py         # GET  /v1/users/{id}/balance, /transactions
    │   ├── missions.py        # GET  /v1/users/{id}/missions, POST /claim
    │   ├── catalog.py         # GET  /v1/catalog
    │   ├── redemptions.py     # POST /v1/users/{id}/redemptions
    │   └── admin.py           # PUT  /v1/admin/...
    ├── services/
    │   ├── event_bus.py       # 이벤트 라우팅 + 멱등성
    │   ├── point_ledger.py    # rp_transaction / rp_balance / 만료
    │   ├── mission.py         # 진행도 갱신, 완료 처리
    │   ├── reward.py          # 교환 트랜잭션
    │   ├── anti_abuse.py      # 룰 평가
    │   ├── tier.py            # 등급 재평가
    │   ├── diversity.py       # 다양성 계수 계산
    │   └── audit.py           # audit_log 기록
    ├── adapters/
    │   ├── partner.py         # PartnerAdapter Protocol
    │   ├── internal.py        # 즉시 발급
    │   └── stub.py            # 외부 파트너 stub (큐 적재)
    ├── jobs/
    │   ├── expire_rp.py       # 일배치: RP 만료
    │   ├── verify_balance.py  # 일배치: 정합성 검증
    │   ├── cleanup_idem.py    # 일배치: 멱등 키 정리
    │   └── expire_missions.py # 일배치: 미션 만료
    └── tests/
        ├── conftest.py
        ├── test_point_ledger.py
        ├── test_event_bus.py
        └── ...
```

**왜 서비스 분리가 아닌 패키지 분리인가**: v1 트래픽 규모와 팀 크기에서 별도 서비스 운영 비용(배포·DB·모니터링)이 이득보다 큽니다. 패키지 경계만 깨끗하면 추후 분리는 어렵지 않습니다.

---

## 2. DB 마이그레이션 — Alembic

**결정: Alembic 사용.** SQLAlchemy 표준이며, 다른 합리적 선택지가 없습니다.

### 2.1 기존 `database/init/*.sql`과의 관계

개발환경.md의 `database/init/` 하위 SQL은 **컨테이너 최초 기동 시 한 번만** 실행되는 PostgreSQL 공식 이미지 기능입니다. 이 방식은 v1에 SRE를 추가하는 시점부터 한계가 옵니다 (스키마 변경 시 볼륨 삭제 필요).

**전환 전략**:
1. 현재 `001_init_schema.sql`, `002_contents_schema.sql`, `003_profile_avatar.sql`의 누적 상태를 Alembic의 **baseline 리비전**으로 만든다 (`alembic revision --autogenerate -m "baseline"` 후 수동 정리)
2. SRE 스키마는 **새 리비전들**로 추가 (`004_sre_enums`, `005_sre_user`, `006_sre_actions_events`, ...)
3. 이후 `database/init/`는 비워두거나 PostGIS extension 활성화 같은 초기 설정만 유지

### 2.2 마이그레이션 단위

테이블 도메인별로 나눕니다 (한 리비전 = 한 도메인). 롤백 가능성을 높이고 리뷰 단위를 작게 유지하기 위함입니다.

```
004_sre_enums.py
005_sre_user.py
006_sre_actions.py        # action_definition + action_event
007_sre_missions.py
008_sre_points.py         # rp_* 3개
009_sre_diversity_tier.py
010_sre_rewards.py
011_sre_abuse_audit.py
012_sre_seed_static.py    # action_definition, tier_definition, abuse_rule, reward_partner 시드
```

미션 240개 시드는 **마이그레이션이 아닌 별도 데이터 로더**로 분리합니다 (4단계 문서에서 다룸).

---

## 3. 백그라운드 작업 / 스케줄러 — APScheduler (v1) → Celery (v2)

### 3.1 v1 결정: APScheduler

**APScheduler를 FastAPI 앱 lifespan에 임베드**합니다.

**이유**:
- 작업 종류가 일배치 4종뿐 (RP 만료, 정합성 검증, 멱등 키 정리, 미션 만료) — 무거운 인프라 불필요
- v1 배포가 단일 호스트(Docker Compose) — Celery의 분산 장점 없음
- Redis/RabbitMQ 추가 운영 비용 회피
- 잡 자체가 멱등(재실행 안전)이라 분산 락이 크게 필요 없음

### 3.2 단일 인스턴스 가정의 위험과 완화

APScheduler를 단순 임베드하면 **백엔드 컨테이너를 2개로 스케일하는 순간 잡이 중복 실행**됩니다. v1은 단일 인스턴스로 운영하되, 안전장치를 둡니다:

- **PostgreSQL advisory lock 기반 단일 실행 보장**:
  ```python
  async def run_with_lock(lock_id: int, fn):
      async with db.begin() as conn:
          got = await conn.scalar(text("SELECT pg_try_advisory_lock(:id)"), {"id": lock_id})
          if not got:
              return  # 다른 인스턴스가 이미 실행 중
          try:
              await fn()
          finally:
              await conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": lock_id})
  ```
- 각 잡에 고정 `lock_id`를 할당 (예: `expire_rp=1001`, `verify_balance=1002`)
- 이 패턴이면 차후 컨테이너 N개로 스케일해도 안전

### 3.3 스케줄

모두 Asia/Ho_Chi_Minh 기준 (APScheduler에 타임존 전달).

| Job | Cron | lock_id |
|---|---|---|
| `expire_rp` | `0 4 * * *` (매일 04:00) | 1001 |
| `expire_missions` | `5 4 * * *` (매일 04:05) | 1002 |
| `cleanup_idempotency` | `10 4 * * *` (매일 04:10) | 1003 |
| `verify_balance` | `30 4 * * *` (매일 04:30) | 1004 |

### 3.4 v2 전환 트리거

다음 중 하나라도 발생하면 Celery로 전환:
- 백엔드 컨테이너를 의도적으로 2개 이상 스케일해야 할 때
- 외부 파트너 API 호출이 비동기 큐로 가야 할 때 (현재 stub은 큐 불필요)
- 분 단위 또는 초 단위 잡이 필요할 때

---

## 4. 캐시 — v1은 사용하지 않음

**결정: Redis 등 외부 캐시를 v1에 도입하지 않는다.**

| 캐시 후보 | v1 처리 |
|---|---|
| 잔액 | `rp_balance` 테이블 자체가 캐시 (DB 내) |
| 다양성 계수 | `user_diversity_score` 테이블이 캐시 |
| `action_definition`, `tier_definition` | Python `functools.lru_cache` 또는 앱 시작 시 메모리 로드 (행 수 적음, 변경 빈도 낮음) |
| 멱등성 키 | PostgreSQL `idempotency_key` 테이블 (인덱스로 충분히 빠름) |
| 미션 카탈로그 | Python in-memory cache (TTL 60초) |

**Redis 도입 트리거**: 일일 활성 사용자 100k 이상, 또는 다양성 계수 조회가 hot path가 되어 DB 부하가 보일 때.

---

## 5. 인증 / 인가

설계서 §9에 따라 모바일 앱은 SRE를 직접 호출하지 않고 **앱 백엔드 게이트웨이**가 중계합니다. SRE 입장에서 호출자는 세 종류입니다.

| 호출자 | 인증 방식 | 신뢰 범위 |
|---|---|---|
| 게이트웨이 (`/v1/events`, `/v1/users/...`) | **서비스 API Key** (`X-Service-Key` 헤더) | 헤더로 전달된 `X-User-Id`를 신뢰 |
| 관리자 (`/v1/admin/...`) | **JWT** (별도 admin 토큰) | JWT의 `sub`를 actor로 기록 |
| 외부 파트너 콜백 (v2) | API Key + 서명 검증 | — |

### 5.1 게이트웨이 ↔ SRE: API Key

- 환경변수 `SRE_SERVICE_API_KEY`에 저장 (운영은 secret manager)
- 모든 `/v1/*` (admin 제외)에 dependency로 검증
- v1은 단일 키, v2에서 게이트웨이별 다중 키로 확장

```python
# sre/deps.py
async def verify_service_key(x_service_key: str = Header(...)):
    if x_service_key != settings.SRE_SERVICE_API_KEY:
        raise HTTPException(401, "Invalid service key")
```

### 5.2 사용자 식별

게이트웨이가 `X-User-Id` 헤더로 SRE의 내부 `sre_user.user_id`를 전달합니다. SRE는 이 값을 신뢰합니다 (게이트웨이가 사용자 인증을 완료했다고 가정).

**왜 path parameter가 있는데 헤더도 보내는가**: `/v1/users/{user_id}/balance`처럼 path에 user_id가 있을 때, 게이트웨이가 인증한 사용자와 path의 사용자가 일치하는지 검증해야 합니다. 불일치 시 403.

### 5.3 관리자 — JWT + 별도 admin_user 테이블

설계서 §9에 "Admin Token + RBAC" 언급만 있고 구체화되어 있지 않아 v1 결정이 필요합니다.

**v1 단순화**: 별도 `sre_admin_user` 테이블을 두지 않고, 환경변수 `SRE_ADMIN_JWT_SECRET`로 서명된 JWT를 받습니다. JWT payload:

```json
{ "sub": "admin@saigonrider.com", "roles": ["RULE_EDITOR", "REWARD_OPS"], "exp": ... }
```

토큰 발급은 v1에서 운영자가 수동 발급 (스크립트). 자체 admin 로그인 UI는 v2에서 별도 admin 서비스로 분리.

**RBAC**: 라우터별로 필요한 role을 dependency로 명시.
```python
require_role("RULE_EDITOR")  # action_definition 수정
require_role("REWARD_OPS")   # 수동 발급, ADJUST_*
require_role("ABUSE_ANALYST")  # abuse_rule 조회/수정
```

---

## 6. 설정 관리 — Pydantic BaseSettings

```python
# sre/config.py
from pydantic_settings import BaseSettings
from zoneinfo import ZoneInfo

class SreSettings(BaseSettings):
    # 인증
    sre_service_api_key: str
    sre_admin_jwt_secret: str

    # 비즈니스 룰 (1단계 문서의 결정값)
    sre_timezone: str = "Asia/Ho_Chi_Minh"
    sre_rp_expiry_months: int = 3
    sre_daily_cap_standard: int = 250
    sre_daily_cap_driver: int = 2000
    sre_new_account_penalty_days: int = 3
    sre_new_account_multiplier: float = 0.5
    sre_idempotency_ttl_days: int = 7

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.sre_timezone)

    class Config:
        env_prefix = ""  # SRE_ 접두어는 변수명에 포함
        env_file = ".env"
```

**비즈니스 룰을 환경변수로 빼는 이유**: 운영 중에도 룰 조정이 잦을 수 있고, 코드 수정 없이 재배포만으로 바꿀 수 있어야 합니다. 다만 `action_definition.base_rp`처럼 행동별 값은 DB(관리자 API)로 관리합니다.

---

## 7. 시간대 처리

- DB 컬럼은 모두 `TIMESTAMPTZ` (DDL에서 결정)
- Python은 **timezone-aware datetime만 사용** (`datetime.now(tz=UTC)` 또는 `zoneinfo`)
- `month_key` 같은 파생값은 항상 `Asia/Ho_Chi_Minh` 기준
- API 응답의 datetime은 ISO 8601 UTC (`2026-05-13T10:23:45.123Z`)
- 프론트가 표시 시점에 로컬 변환

**금지 패턴**: `datetime.now()` (naive). 코드 리뷰 시 차단하고, `ruff` 또는 `pre-commit`에서 검사하는 규칙 추가.

---

## 8. 로깅 / 모니터링

### 8.1 로깅

- **`structlog`** + JSON formatter
- 모든 트랜잭션 처리 시작·종료 로그 (idempotency_key 포함)
- 어뷰징 룰 매칭 시 INFO, REJECT 시 WARNING
- 정합성 검증 불일치 시 ERROR

```python
import structlog
logger = structlog.get_logger()
logger.info("event_received", user_id=..., action_code=..., idem_key=...)
```

### 8.2 메트릭

- **prometheus-client** 라이브러리로 메트릭 노출
- 핵심 지표:
  - `sre_events_processed_total{action_code, status}` (Counter)
  - `sre_rp_issued_total` (Counter)
  - `sre_rp_redeemed_total` (Counter)
  - `sre_event_processing_seconds` (Histogram)
  - `sre_balance_verification_drift` (Gauge — 불일치 사용자 수)
  - `sre_abuse_events_total{rule_code}` (Counter)
- `/metrics` 엔드포인트 노출 (인증 별도, 내부망만)

### 8.3 트레이싱

v1은 미도입. v2에서 OpenTelemetry로 도입.

---

## 9. 테스트 / 코드 품질

| 항목 | 도구 |
|---|---|
| 단위·통합 테스트 | `pytest` + `pytest-asyncio` |
| HTTP 테스트 | `httpx` (FastAPI `TestClient` 대체, async 친화) |
| 테스트 DB | Docker로 별도 PostgreSQL 컨테이너 (`testcontainers-python` 또는 docker-compose.test.yml) |
| 픽스처 | `pytest` fixtures + `pytest-postgresql` 또는 truncate 기반 |
| Linter / Formatter | `ruff` (lint + format 통합) |
| 타입체크 | `mypy` (strict 모드는 sre 패키지 한정) |
| pre-commit | `ruff`, `mypy`, conventional-commit 메시지 검사 |

**테스트 커버리지 목표**: v1에서 `services/` 패키지 80% 이상, 전체 70% 이상.

---

## 10. API 문서 — FastAPI 자동 OpenAPI

FastAPI의 자동 OpenAPI 생성을 활용합니다. 별도 도구 불필요.

- Pydantic 스키마에 `description`, `example` 충실히 작성
- 라우터에 `tags`, `summary`, `response_model`, `responses` 명시
- 에러 응답도 `responses={400: {"model": ErrorResponse}}` 형태로 명시

3단계 문서에서 모든 엔드포인트의 스키마를 확정한 뒤, 코드에 반영하면 `/api/docs`에서 Swagger UI로 자동 생성됩니다.

---

## 11. 다국어 — 미션 텍스트 처리

스키마의 `mission_definition.title`, `description`은 현재 `VARCHAR` 단일 컬럼입니다. 프론트엔드가 ko/vi/en 3개 언어를 지원하므로 SRE도 다국어 대응이 필요합니다.

**옵션 비교**:
| 방식 | 장점 | 단점 |
|---|---|---|
| 컬럼 분리 (title_ko/vi/en) | SQL 단순 | 언어 추가 시 마이그레이션 |
| **JSONB 컬럼 (`{"ko":..,"vi":..}`)** | 언어 추가 자유, 부분 채움 가능 | 인덱싱 약간 복잡 |
| 별도 i18n 테이블 | 정규화, 부분 번역 추적 | 조인 비용 |

**결정: JSONB 컬럼으로 변경.** v1 마이그레이션에서 다음과 같이 컬럼 타입을 변경합니다.

```sql
ALTER TABLE mission_definition
  ALTER COLUMN title TYPE JSONB USING jsonb_build_object('vi', title),
  ALTER COLUMN description TYPE JSONB USING
    CASE WHEN description IS NULL THEN NULL
         ELSE jsonb_build_object('vi', description) END;
```

API 응답에서는 `Accept-Language` 헤더 또는 `?lang=vi` 쿼리로 선택, 폴백 순서는 `요청 언어 → vi → ko → en → 첫 번째 값`.

**v1 범위**: 미션 240개의 베트남어(`vi`) 텍스트만 채우고 ko/en은 비워둡니다. 4단계 문서에서 다룹니다.

---

## 12. 환경변수 추가 사항

기존 `.env`에 추가:

```bash
# SRE 인증
SRE_SERVICE_API_KEY=<32바이트 랜덤>
SRE_ADMIN_JWT_SECRET=<32바이트 랜덤>

# SRE 비즈니스 룰 (1단계 결정값)
SRE_TIMEZONE=Asia/Ho_Chi_Minh
SRE_RP_EXPIRY_MONTHS=3
SRE_DAILY_CAP_STANDARD=250
SRE_DAILY_CAP_DRIVER=2000
SRE_NEW_ACCOUNT_PENALTY_DAYS=3
SRE_NEW_ACCOUNT_MULTIPLIER=0.5
SRE_IDEMPOTENCY_TTL_DAYS=7

# 관측성
SRE_LOG_LEVEL=INFO
SRE_METRICS_ENABLED=true
```

`.env.example`에 추가하고, 실제 키는 운영 환경에서 발급.

---

## 13. requirements.txt 추가 패키지

기존 backend/requirements.txt에 추가될 항목:

```
alembic>=1.13              # DB 마이그레이션
apscheduler>=3.10          # 백그라운드 스케줄러
structlog>=24.1            # 구조화 로깅
prometheus-client>=0.20    # 메트릭
pyjwt[crypto]>=2.8         # 관리자 JWT
python-jose는 사용하지 않음 (보안 이슈 권고)
# pydantic, pydantic-settings는 FastAPI 기본 의존
# pytest, ruff, mypy는 requirements-dev.txt에 분리 권장
```

---

## 14. 결정 사항 한눈 보기

| # | 항목 | 결정 |
|---|---|---|
| 1 | 모듈화 전략 | `backend/app/sre/` 패키지 분리 (단일 FastAPI 앱) |
| 2 | DB 마이그레이션 | Alembic (`database/init/`는 baseline 후 비활성) |
| 3 | 백그라운드 작업 | APScheduler + advisory lock (v2에서 Celery) |
| 4 | 캐시 | v1은 외부 캐시 미사용 (DB + 메모리 lru_cache) |
| 5.1 | 게이트웨이↔SRE 인증 | `X-Service-Key` 헤더 (API Key) |
| 5.2 | 사용자 식별 | `X-User-Id` 헤더 신뢰 (path와 일치 검증) |
| 5.3 | 관리자 인증 | JWT (자체 admin 테이블 없이 환경변수 secret) + RBAC |
| 6 | 설정 관리 | Pydantic `BaseSettings` (룰값은 env로 노출) |
| 7 | 시간대 | timezone-aware datetime 강제, `Asia/Ho_Chi_Minh` 기준 |
| 8.1 | 로깅 | structlog + JSON |
| 8.2 | 메트릭 | prometheus-client, `/metrics` 엔드포인트 |
| 8.3 | 트레이싱 | v1 미도입 |
| 9 | 테스트 | pytest + httpx + testcontainers, ruff + mypy |
| 10 | API 문서 | FastAPI 자동 OpenAPI |
| 11 | 다국어 | `title`/`description`을 JSONB로 변경, v1은 vi만 |

---

## 15. 보류 — 외부 파트너 연동 후 결정할 항목

- 외부 파트너 호출용 HTTP 클라이언트 (`httpx.AsyncClient` 공유 vs 파트너별 분리)
- 외부 호출 재시도 라이브러리 (`tenacity`)
- 외부 콜백 endpoint의 IP 화이트리스트 / mTLS
- 외부 파트너별 rate limit 정책

---

(끝)
