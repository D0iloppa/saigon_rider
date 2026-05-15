# Engine Phase 3 — 핵심 서비스 레이어

> 작업일: 2026-05-14  
> 상태: ✅ 완료  
> 참조: [`docs/engine_intg_v2.md`](../../context/architecture.md) Phase 3

---

## 작업 범위

`engine_intg_v2.md` Phase 3 체크리스트 전체 구현.  
ORM 모델, Pydantic 스키마, 의존성, 서비스 레이어(7종)를 구현한다.

---

## 산출물

| 파일 | 설명 |
|---|---|
| `engine/app/models.py` | SQLAlchemy ORM 전체 모델 (16개 테이블) |
| `engine/app/schemas.py` | Pydantic 요청/응답 스키마 (OpenAPI 스펙 기준) |
| `engine/app/deps.py` | `verify_service_key`, `verify_admin_jwt`, `get_session` |
| `engine/app/services/audit.py` | `audit_log` INSERT 헬퍼 |
| `engine/app/services/point_ledger.py` | RP 원장 — credit / debit / refund / admin_adjust / lock_balance / FIFO 소진 |
| `engine/app/services/anti_abuse.py` | 어뷰징 룰 평가 (REJECT → REDUCE → CAP 순) |
| `engine/app/services/diversity.py` | 다양성 계수 — log_category / get_multiplier / recalculate |
| `engine/app/services/tier.py` | 등급 재평가 (EARN 후 동기 호출) |
| `engine/app/services/mission.py` | 미션 진행도 갱신 및 완료 보상 적립 |
| `engine/app/services/event_bus.py` | RP 계산 파이프라인 오케스트레이터 (11단계) |
| `engine/requirements.txt` | `python-dateutil>=2.9` 추가 (relativedelta용) |

---

## 주요 구현 결정

### models.py
- `Enum(..., create_type=False)` 사용 — Alembic이 이미 ENUM 생성 완료, ORM 단계에서 재생성 방지
- 모든 timestamp 컬럼은 `TIMESTAMP(timezone=True)` (PostgreSQL TIMESTAMPTZ)

### deps.py
- `X-Service-Key` 헤더: 평문 문자열 비교 (env `ENGINE_SERVICE_KEY`)
- `X-Admin-Token` 헤더: PyJWT HS256 검증 (env `ENGINE_ADMIN_JWT_SECRET`)

### event_bus.py (RP 계산 파이프라인)
- 멱등성 키 중복 시 원본 응답 재현 (처리 안 함)
- REJECT 이벤트도 `action_event` 행으로 저장 (감사 가능)
- RP = 0 일 때 `rp_transaction` 미생성 (DAILY_CAP_EXCEEDED 포함)
- commit을 event_bus 내부에서 직접 호출

### point_ledger.py
- `SELECT FOR UPDATE` row-level lock으로 동시성 제어
- `relativedelta`로 3개월 만료 계산 (월 경계 정확)
- FIFO 만료 소진은 `expires_at ASC, expire_id ASC` 정렬

### diversity.py
- 첫 카테고리 진입 시 동기 UPSERT (business-rules §2.2 예외)
- PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` 사용

---

## 검증 결과

```
docker compose run engine python -c "from app.services import event_bus; print('OK')"
→ ALL IMPORTS OK
```

---

## 다음 단계

- **Phase 4**: API 라우터 (`events`, `balance`, `missions`, `catalog`, `redemptions`, `admin`) + APScheduler 배치 4종
