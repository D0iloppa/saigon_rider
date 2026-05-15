# Engine Phase 4 — API 라우터 및 배치 구현

> 작업일: 2026-05-14  
> 상태: ✅ 완료  
> 연관 문서: [SRE 엔진 통합 지침서 v2](../../context/architecture.md)

---

## 목표

Engine FastAPI 앱에 REST API 라우터 6종, 파트너 어댑터 3종, APScheduler 배치 잡 4종을 구현하고 `main.py`에 통합한다.

---

## 구현 내용

### 라우터 (`engine/app/routers/`)

| 파일 | 엔드포인트 | 설명 |
|---|---|---|
| `events.py` | `POST /v1/events`, `GET /v1/events/{id}` | 이벤트 수신 → `event_bus.process_event()` 호출 |
| `balance.py` | `GET /v1/users/{id}/balance`, `GET /v1/users/{id}/transactions`, `GET /v1/users/{id}/expirations` | RP 잔액·거래내역·만료일정 조회 |
| `missions.py` | `GET /v1/users/{id}/missions`, `GET /v1/users/{id}/missions/{mid}`, `POST .../abandon` | 미션 목록·상세·포기 |
| `catalog.py` | `GET /v1/catalog`, `GET /v1/catalog/{cid}` | 보상 카탈로그 목록·상세 |
| `redemptions.py` | `POST /v1/users/{id}/redemptions`, `GET /v1/users/{id}/redemptions`, `GET .../redemptions/{rid}` | 보상 교환·조회 |
| `admin.py` | `GET /v1/admin/users/{id}/summary`, `POST /v1/admin/users/{id}/adjust`, `GET /v1/admin/abuse-rules`, `GET /v1/admin/audit-logs` | 관리자 전용 |

**합계: 25개 라우트** (`app.routes()` 검증 완료)

### 어댑터 (`engine/app/adapters/`)

| 파일 | 클래스 | 설명 |
|---|---|---|
| `partner.py` | `PartnerAdapter` (Protocol), `VoucherResult` (dataclass) | 어댑터 인터페이스 정의 |
| `internal.py` | `InternalAdapter` | `INTERNAL` 타입: `INT-{uuid16}` 즉시 발급 |
| `stub.py` | `StubPartnerAdapter` + `get_adapter()` | 외부 파트너 Stub (success=True, voucher_code=None) + 팩토리 |

### 배치 잡 (`engine/app/jobs/`)

| 파일 | 실행 시각 (VN) | 동작 |
|---|---|---|
| `expire_rp.py` | 04:00 | PENDING/PARTIALLY_USED 만료 스케줄 처리 → EXPIRE 트랜잭션 생성 |
| `expire_missions.py` | 04:05 | ACTIVE 미션 중 `expires_at` 초과 → EXPIRED 상태 전환 |
| `cleanup_idem.py` | 04:10 | `idempotency_key.expires_at < NOW()` 레코드 삭제 |
| `verify_balance.py` | 04:30 | rp_transaction 합계와 rp_balance 캐시 비교, 불일치 시 WARNING 로그 |

### `main.py` 통합

- APScheduler `AsyncIOScheduler` lifespan 관리 (start → yield → shutdown)
- 6개 라우터 `include_router()` 등록
- 전역 예외 핸들러: `InsufficientBalanceError` (402), `RewardUnavailableError` (409)

---

## 검증 결과

```
App title: Saigon SRE Engine
Route count: 25
Scheduler jobs: 4 (expire_rp, expire_missions, cleanup_idem, verify_balance)
STARTUP OK — engine is ready to serve
```

`docker compose run --rm engine python -c "..."` 로 컨테이너 내부에서 import 및 앱 초기화 검증 완료.

---

## 산출 파일 목록

```
engine/app/routers/events.py
engine/app/routers/balance.py
engine/app/routers/missions.py
engine/app/routers/catalog.py
engine/app/routers/redemptions.py
engine/app/routers/admin.py
engine/app/adapters/partner.py
engine/app/adapters/internal.py
engine/app/adapters/stub.py
engine/app/jobs/expire_rp.py
engine/app/jobs/expire_missions.py
engine/app/jobs/cleanup_idem.py
engine/app/jobs/verify_balance.py
engine/app/main.py  (업데이트)
```
