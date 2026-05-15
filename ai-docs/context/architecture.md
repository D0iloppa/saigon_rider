# SRE 엔진 통합 지침서 v2 (BFF + Engine 분리 아키텍처)

> 작성일: 2026-05-14  
> 상태: **확정 — 구현 착수 전 필독**  
> 이전 문서: [`engine_intg_deprecated.md`](../_deprecated/engine_intg_deprecated.md) (모놀리식 통합 방식 — 폐기)

---

## 0. 엔진 명세 (`docs/engine/`)
- [SRE 설계서](../engine/sre-design-spec.md) - 8개 모듈 경계, 도메인 범위, 보안 모델
- [SRE 비즈니스 룰](../engine/01-sre-business-rules.md) - RP 계산식, 어뷰징 정책, 멱등성, 보상 교환 정책
- [SRE 기술 스택](../engine/02-sre-tech-stack.md) - 패키지 구조, Alembic, APScheduler, 인증 결정
- [SRE ERD (PostgreSQL)](../engine/sre-erd-mermaid.postgres.md) - 전체 테이블 정의 및 관계 (Mermaid)
- [SRE SQL DDL](../engine/sre-schema.postgres.sql) - PostgreSQL 실제 DDL
- [SRE OpenAPI 명세](../engine/sre-api.openapi.yml) - REST API 전체 스펙 (v1)
- [SRE 미션 룰 매핑](../engine/sre-mission-rule-mapping.md) - 미션↔액션 코드 매핑 테이블
- [SRE 미션 시드 SQL](../engine/sre-mission-seed.sql) - 미션 240개 초기 데이터


## 1. 아키텍처 결정 요약

### 1.1 v1 문서(모놀리식)와의 차이

| 항목 | v1 (폐기) | v2 (현행) |
|---|---|---|
| 배포 단위 | 단일 `saigon_backend` 컨테이너 | `saigon_bff` + `saigon_engine` 분리 |
| SRE 위치 | `backend/app/sre/` 서브패키지 | 독립 `engine/` 디렉터리, 별도 FastAPI 앱 |
| DB | 공유 PostgreSQL (단일 스키마) | 공유 PostgreSQL, 스키마는 논리적 분리 |
| 통신 방식 | 동일 프로세스 내 함수 호출 | HTTP REST (`X-Service-Key` 인증) |
| 책임 | 혼재 | BFF = 앱 API / Engine = RP·미션·보상 |

### 1.2 결정 근거

- **BFF 역할 명확화**: 기존 백엔드는 모바일 앱의 화면 요구(인증·퀘스트·피드·프로필 등)에 집중하는 BFF로 역할을 한정한다.
- **엔진 독립성**: SRE(RP 계산·미션·보상·어뷰징)는 채널 중립(channel-neutral)이어야 하며, BFF 외에도 미래의 웹/파트너 채널이 동일 엔진을 재사용 가능해야 한다.
- **코드 경계 강제**: 동일 프로세스 내 서브패키지는 경계가 느슨해지기 쉬우나, 별도 컨테이너는 HTTP 계약으로 경계를 강제한다.
- **장기 확장성**: 엔진 팀과 BFF 팀이 독립 배포·스케일링 가능한 구조를 초기부터 확보한다.

---

## 2. 전체 아키텍처 다이어그램

```
모바일 앱 / 웹 클라이언트
         │ HTTPS
         ▼
┌─────────────────────────────────────────────────────┐
│  Nginx (:18090) — saigon_nginx                      │
│  /api/*      → bff:8080/api/*                       │
│  /admin/*    → bff:8080/admin/*                     │
│  /engine/*   → engine:8090/v1/*   (내부망 전용)     │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼────────────────────┐
│  saigon_bff         │  │  saigon_engine              │
│  (FastAPI, :8080)   │  │  (FastAPI, :8090)           │
│                     │  │                             │
│  auth / profile     │  │  event_bus / point_ledger   │
│  quests / ride      │──▶  mission / anti_abuse       │
│  feed / users       │  │  tier / diversity / reward  │
│  (앱 화면 BFF)      │  │  admin / audit / jobs       │
└──────────┬──────────┘  └──────────┬──────────────────┘
           │                        │
           └──────────┬─────────────┘
                      ▼
        ┌─────────────────────────────┐
        │  saigon_db                  │
        │  (PostgreSQL 15 + PostGIS)  │
        │  기존 스키마 + SRE 스키마   │
        └─────────────────────────────┘
```

### 통신 규칙

| 방향 | 방식 | 인증 |
|---|---|---|
| 모바일 앱 → BFF | HTTPS (기존 쿠키 세션) | passcode 세션 |
| BFF → Engine | HTTP (내부 Docker 네트워크) | `X-Service-Key` 헤더 |
| Engine → DB | asyncpg (직접 연결) | DB 크리덴셜 |
| 모바일 앱 → Engine | **불허** (Nginx 차단) | — |

---

## 3. 디렉터리 레이아웃

### 3.1 프로젝트 루트

```
saigon_rider/
├── backend/          ← BFF (기존, 역할 재정의)
├── engine/           ← SRE 엔진 (신규)
├── database/
├── nginx/
├── frontend/
└── docker-compose.yml
```

### 3.2 BFF (`backend/`)

기존 구조 유지. SRE 관련 코드를 **제거**하고, 대신 Engine HTTP 클라이언트만 추가한다.

```
backend/app/
├── main.py
├── database.py
├── models.py
├── schemas.py
├── routers/
│   ├── auth.py
│   ├── profile.py
│   ├── contents.py
│   ├── quests.py          ← 신규 (backend_todo P0)
│   ├── ride.py            ← 신규 + engine_client 호출
│   ├── feed.py            ← 신규
│   ├── notifications.py   ← 신규
│   └── users.py           ← 신규
└── engine_client.py       ← 신규: Engine HTTP 클라이언트
```

**`engine_client.py` 역할**: BFF가 Engine을 호출하는 단일 진입점. `httpx.AsyncClient`를 래핑하며 `X-Service-Key` 헤더를 자동 주입한다.

```python
# backend/app/engine_client.py
import httpx
from app.config import settings

class EngineClient:
    def __init__(self):
        self._client = httpx.AsyncClient(
            base_url=settings.ENGINE_BASE_URL,
            headers={"X-Service-Key": settings.ENGINE_SERVICE_KEY},
            timeout=10.0,
        )

    async def post_event(self, user_uuid: str, action_code: str,
                         occurred_at, payload: dict, idem_key: str) -> dict:
        resp = await self._client.post("/v1/events", json={
            "user_id": user_uuid,
            "action_code": action_code,
            "occurred_at": occurred_at.isoformat(),
            "payload": payload,
            "idempotency_key": idem_key,
        })
        resp.raise_for_status()
        return resp.json()

    async def get_balance(self, user_uuid: str) -> dict:
        resp = await self._client.get(f"/v1/users/{user_uuid}/balance")
        resp.raise_for_status()
        return resp.json()

engine_client = EngineClient()
```

### 3.3 Engine (`engine/`)

```
engine/
├── Dockerfile
├── requirements.txt
└── app/
    ├── main.py                ← FastAPI 앱, /v1 prefix
    ├── database.py            ← asyncpg 엔진 (BFF와 동일 DB, 별도 커넥션 풀)
    ├── config.py              ← SreSettings (BaseSettings)
    ├── models.py              ← SQLAlchemy ORM (sre_user, action_event, ...)
    ├── schemas.py             ← Pydantic 요청/응답
    ├── deps.py                ← verify_service_key, verify_admin_jwt
    ├── enums.py               ← Python Enum (DB ENUM과 1:1)
    ├── exceptions.py          ← 비즈니스 예외
    ├── routers/
    │   ├── events.py          ← POST /v1/events
    │   ├── balance.py         ← GET  /v1/users/{id}/balance, /transactions
    │   ├── missions.py        ← GET  /v1/users/{id}/missions
    │   ├── catalog.py         ← GET  /v1/catalog
    │   ├── redemptions.py     ← POST /v1/users/{id}/redemptions
    │   └── admin.py           ← /v1/admin/...
    ├── services/
    │   ├── event_bus.py       ← RP 계산 파이프라인
    │   ├── point_ledger.py    ← rp_transaction / rp_balance / 만료
    │   ├── mission.py         ← 미션 진행도 갱신
    │   ├── reward.py          ← 교환 트랜잭션
    │   ├── anti_abuse.py      ← 어뷰징 룰 평가
    │   ├── tier.py            ← 등급 재평가
    │   ├── diversity.py       ← 다양성 계수
    │   └── audit.py           ← audit_log
    ├── adapters/
    │   ├── partner.py         ← PartnerAdapter Protocol
    │   ├── internal.py        ← 즉시 발급
    │   └── stub.py            ← 외부 파트너 stub
    ├── jobs/
    │   ├── expire_rp.py       ← 일배치 04:00 VN
    │   ├── expire_missions.py ← 일배치 04:05
    │   ├── cleanup_idem.py    ← 일배치 04:10
    │   └── verify_balance.py  ← 일배치 04:30
    └── tests/
        ├── conftest.py
        ├── test_event_bus.py
        ├── test_point_ledger.py
        └── test_anti_abuse.py
```

---

## 4. Docker Compose 변경

```yaml
# docker-compose.yml 추가/변경 사항

services:

  # ── BFF (기존 backend, 역할 재정의) ──────────────────────
  bff:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: saigon_bff
    profiles: [backend]
    ports:
      - "${BACKEND_PORT}:8080"
    volumes:
      - ./backend:/app
      - ./contents:/data
    networks:
      - dev-net
    depends_on:
      database:
        condition: service_healthy
      engine:
        condition: service_started
    environment:
      - DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@database:5432/${DB_NAME}
      - ENGINE_BASE_URL=http://engine:8090
      - ENGINE_SERVICE_KEY=${ENGINE_SERVICE_KEY}
      - CONTENTS_BASE_PATH=/data
      - IMGPROXY_BASE_URL=${IMGPROXY_BASE_URL}
      - IMGPROXY_KEY=${IMGPROXY_KEY:-}
      - IMGPROXY_SALT=${IMGPROXY_SALT:-}
    restart: unless-stopped

  # ── Engine (SRE, 신규) ────────────────────────────────────
  engine:
    build:
      context: ./engine
      dockerfile: Dockerfile
    container_name: saigon_engine
    profiles: [backend]
    ports:
      - "${ENGINE_PORT:-8090}:8090"
    volumes:
      - ./engine:/app
    networks:
      - dev-net
    depends_on:
      database:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@database:5432/${DB_NAME}
      - ENGINE_SERVICE_KEY=${ENGINE_SERVICE_KEY}
      - ENGINE_ADMIN_JWT_SECRET=${ENGINE_ADMIN_JWT_SECRET}
      - SRE_TIMEZONE=Asia/Ho_Chi_Minh
      - SRE_RP_EXPIRY_MONTHS=3
      - SRE_DAILY_CAP_STANDARD=250
      - SRE_DAILY_CAP_DRIVER=2000
      - SRE_NEW_ACCOUNT_PENALTY_DAYS=3
      - SRE_NEW_ACCOUNT_MULTIPLIER=0.5
      - SRE_IDEMPOTENCY_TTL_DAYS=7
      - SRE_LOG_LEVEL=INFO
    restart: unless-stopped
```

> **기존 `backend` 서비스명은 `bff`로 변경**한다. `container_name`도 `saigon_bff`로 변경.
> Nginx 설정의 `proxy_pass http://backend:8080` → `http://bff:8080`으로 일괄 수정 필요.

---

## 5. Nginx 라우팅 변경

```nginx
# nginx/conf.d/default.conf

# 기존 /api/ → BFF
location /api/ {
    proxy_pass http://bff:8080/api/;
}

location /admin/ {
    proxy_pass http://bff:8080/admin/;
}

# 신규: Engine 내부 경로 (외부 직접 접근 차단 — 내부망에서만 허용)
# 운영환경에서는 이 블록을 Nginx에 노출하지 않거나 IP 화이트리스트 적용
location /engine/ {
    # 외부 접근 차단 (내부 Docker 네트워크만 허용)
    allow 172.16.0.0/12;
    deny all;
    proxy_pass http://engine:8090/v1/;
    proxy_set_header X-Service-Key $http_x_service_key;
}
```

---

## 6. 환경변수 추가 (.env / .env.example)

```bash
# ── Engine 서비스 ──────────────────────────────────────
ENGINE_PORT=8090
ENGINE_SERVICE_KEY=<32바이트 랜덤 hex>    # BFF→Engine 서비스 인증 키
ENGINE_ADMIN_JWT_SECRET=<32바이트 랜덤 hex>

# ── SRE 비즈니스 룰 ────────────────────────────────────
SRE_TIMEZONE=Asia/Ho_Chi_Minh
SRE_RP_EXPIRY_MONTHS=3
SRE_DAILY_CAP_STANDARD=250
SRE_DAILY_CAP_DRIVER=2000
SRE_NEW_ACCOUNT_PENALTY_DAYS=3
SRE_NEW_ACCOUNT_MULTIPLIER=0.5
SRE_IDEMPOTENCY_TTL_DAYS=7
SRE_LOG_LEVEL=INFO
SRE_METRICS_ENABLED=true
```

---

## 7. BFF → Engine 연계 지점

BFF의 각 라우터가 Engine을 호출하는 지점:

| BFF 라우터 | 엔드포인트 | Engine 호출 | Engine 액션 코드 |
|---|---|---|---|
| `ride.py` | `POST /api/ride/submit` | `engine_client.post_event()` | `RIDE_KM`, `QUEST_COMPLETE` |
| `feed.py` | `POST /api/feed` | `engine_client.post_event()` | `SHARE_SNS` |
| `users.py` | 친구 초대 (미정) | `engine_client.post_event()` | `REFERRAL` |
| `profile.py` | `GET /api/profile` | `engine_client.get_balance()` | — (조회) |
| `quests.py` | `GET /api/quests/{id}` | — | 직접 호출 없음 |

**호출 예시** (`ride.py`):

```python
from app.engine_client import engine_client

@router.post("/submit")
async def submit_ride(data: RideSubmit, db: AsyncSession = Depends(get_db)):
    # 1. ride_sessions INSERT (BFF 로컬 DB)
    session = await save_ride_session(db, data)

    # 2. Engine 이벤트 발행 (HTTP)
    await engine_client.post_event(
        user_uuid=str(data.user_id),
        action_code="RIDE_KM",
        occurred_at=session.ended_at,
        payload={"distance_km": data.distance_km, "ride_id": session.id},
        idem_key=f"ride-{session.id}-km",
    )
    if data.quest_id and data.quest_completed:
        await engine_client.post_event(
            user_uuid=str(data.user_id),
            action_code="QUEST_COMPLETE",
            occurred_at=session.ended_at,
            payload={"quest_id": data.quest_id, "ride_id": session.id},
            idem_key=f"ride-{session.id}-quest-{data.quest_id}",
        )
    return {"session_id": session.id}
```

---

## 8. DB 마이그레이션 전략

두 서비스가 **동일 PostgreSQL 인스턴스**를 사용하되, Alembic은 각각 독립적으로 운영한다.

| 항목 | BFF (`backend/`) | Engine (`engine/`) |
|---|---|---|
| 마이그레이션 도구 | Alembic (신규 전환) | Alembic (신규) |
| 관리 스키마 | 기존 앱 테이블 (users, quests 등) | SRE 테이블 (sre_user, rp_* 등) |
| 테이블 접두사 | 없음 (기존 유지) | `sre_` 접두사 또는 별도 PostgreSQL schema |
| baseline | `001~003` SQL 기준 | 없음 (새로 시작) |

**SRE Alembic 리비전 순서** (Engine 내부):

| 리비전 | 내용 |
|---|---|
| `001_sre_enums.py` | PostgreSQL ENUM 타입 10종 |
| `002_sre_user.py` | `sre_user` |
| `003_sre_actions.py` | `action_definition`, `action_event` |
| `004_sre_missions.py` | `mission_definition`, `user_mission_progress`, `mission_recommendation` |
| `005_sre_points.py` | `rp_balance`, `rp_transaction`, `rp_expiration_schedule` |
| `006_sre_diversity_tier.py` | `behavior_category_log`, `user_diversity_score`, `tier_definition`, `user_tier` |
| `007_sre_rewards.py` | `reward_partner`, `reward_catalog`, `reward_redemption` |
| `008_sre_abuse_audit.py` | `abuse_rule`, `abuse_event`, `idempotency_key`, `audit_log` |
| `009_sre_seed_static.py` | action_definition 12종, tier 5행, abuse_rule 3종 시드 |

> 미션 240개 시드(`sre-mission-seed.sql`)는 별도 데이터 로더 스크립트로 분리.

---

## 9. Engine 패키지 목록 (`engine/requirements.txt`)

```
fastapi>=0.115
uvicorn[standard]>=0.32
asyncpg>=0.30
sqlalchemy[asyncio]>=2.0
alembic>=1.13
apscheduler>=3.10
structlog>=24.1
prometheus-client>=0.20
pyjwt[crypto]>=2.8
pydantic-settings>=2.0
python-dotenv>=1.0
```

`engine/requirements-dev.txt`:
```
pytest>=8.0
pytest-asyncio>=0.23
httpx>=0.27
ruff>=0.4
mypy>=1.10
```

---

## 10. 구현 단계별 Task Plan

### Phase 1 — Engine 컨테이너 기반 구축 ✅ 완료 (2026-05-14)

- [x] `engine/` 디렉터리 및 `Dockerfile` 생성
- [x] `engine/requirements.txt` 작성
- [x] `engine/app/` 골격 생성 (`main.py`, `config.py`, `enums.py`, `exceptions.py`, `database.py`)
- [x] `docker-compose.yml`에 `engine` 서비스 추가 (`saigon_bff`로 기존 backend 서비스명 변경)
- [x] `.env` / `.env.example` Engine 환경변수 추가
- [x] Nginx `bff` → 프록시 업데이트

### Phase 2 — Engine DB 마이그레이션 ✅ 완료 (2026-05-14)

- [x] Alembic 초기화 (`engine/` 기준)
- [x] SRE 리비전 001~008 작성 및 `alembic upgrade head` 검증
- [x] 정적 시드 리비전 009 작성

### Phase 3 — Engine 핵심 서비스 레이어 ✅ 완료 (2026-05-14)

- [x] `engine/app/models.py` — SQLAlchemy ORM (ERD 기준)
- [x] `engine/app/schemas.py` — Pydantic (OpenAPI 스펙 기준)
- [x] `engine/app/deps.py` — `verify_service_key`, `verify_admin_jwt`
- [x] `services/audit.py` → `point_ledger.py` → `anti_abuse.py` → `diversity.py` → `tier.py` → `event_bus.py` → `mission.py` 순서로 구현

### Phase 4 — Engine API 라우터 및 배치 ✅ 완료 (2026-05-14)

- [x] `routers/events.py` — `POST /v1/events`
- [x] `routers/balance.py`, `missions.py`, `catalog.py`, `redemptions.py`
- [x] `routers/admin.py`
- [x] `adapters/internal.py`, `adapters/stub.py`
- [x] `jobs/*.py` — APScheduler 4개 일배치

### Phase 5 — BFF Engine 클라이언트 연동 ✅ 완료 (2026-05-14)

- [x] `backend/app/engine_client.py` 작성 (httpx AsyncClient 래핑)
- [x] `backend/requirements.txt`에 `httpx>=0.27` 추가
- [x] `ride.py` → `engine_client.post_event()` 연동 (RIDE_KM, QUEST_COMPLETE)
- [x] `feed.py` → SNS 공유 이벤트 연동 (SHARE_SNS)
- [x] 기존 `backend_todo.md` P0~P1 엔드포인트 구현과 병행 (A-1, A-2, Q-1~Q-7, R-1~R-4, F-1~F-6)

### Phase 6 — 미션 데이터 및 테스트

- [x] ✅ 완료 (2026-05-14) 미션 240개 데이터 로더 스크립트 (`sre-mission-seed.sql` 기반)
- [x] ✅ 완료 (2026-05-14) `engine/app/tests/` 단위 테스트 (point_ledger, event_bus, anti_abuse)
- [x] ✅ 완료 (2026-05-14) Engine `/v1/metrics` Prometheus 엔드포인트
- [x] ✅ 완료 (2026-05-14) structlog JSON 로깅 설정
- [x] ✅ 완료 (2026-05-14) 잔액 정합성 검증 배치 테스트

---

## 11. 주의사항 및 운영 가이드

1. **`sre_user.external_user_uuid`** — BFF의 `users.user_id`(UUID)를 Engine에 전달하는 유일한 연결 키. Engine은 이 UUID로 내부 `sre_user`를 자동 생성(없으면 INSERT)한다.
2. **`datetime.now()` (naive) 사용 금지** — Engine 전체에서 timezone-aware datetime 강제. `ruff` pre-commit으로 검사.
3. **APScheduler 단일 인스턴스 가정** — Engine 컨테이너를 2개 이상 스케일할 경우 PostgreSQL advisory lock 패턴 적용 필수 (`02-sre-tech-stack.md §3.2`).
4. **BFF는 Engine DB 테이블에 직접 접근하지 않는다** — 오직 `engine_client`의 HTTP API를 통해서만 SRE 데이터를 읽고 쓴다.
5. **Engine 포트(8090)는 Nginx 외부 노출 최소화** — 운영환경에서 `/engine/` 경로는 내부망 IP만 허용하거나 Nginx 레벨에서 완전 차단한다.

---

## 12. 참조 문서

| 문서 | 경로 |
|---|---|
| SRE 설계서 | `docs/engine/sre-design-spec.md` |
| SRE 비즈니스 룰 | `docs/engine/01-sre-business-rules.md` |
| SRE 기술 스택 | `docs/engine/02-sre-tech-stack.md` |
| SRE ERD | `docs/engine/sre-erd-mermaid.postgres.md` |
| SRE SQL DDL | `docs/engine/sre-schema.postgres.sql` |
| SRE OpenAPI | `docs/engine/sre-api.openapi.yml` |
| 기존 백엔드 TODO | `docs/backend_todo.md` |
| ERD (앱 스키마) | `docs/erd.md` |
| 인증 구조 | `docs/auth.md` |
| v1 아키텍처 (폐기) | `docs/engine_intg_deprecated.md` |

---

(끝)
