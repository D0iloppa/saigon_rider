# Engine Phase 2 — DB 마이그레이션

> 작업일: 2026-05-14  
> 상태: ✅ 완료  
> 참조: [`docs/engine_intg_v2.md`](../engine_intg_v2.md) Phase 2

---

## 작업 범위

`engine_intg_v2.md` Phase 2 체크리스트 전체 구현.  
Engine DB 마이그레이션 체계(Alembic)를 확립하고, SRE 전체 스키마를 001~009 리비전으로 적용한다.

---

## 산출물

### 신규 파일

| 파일 | 설명 |
|---|---|
| `engine/alembic.ini` | Alembic 설정 (DATABASE_URL env var 동적 주입) |
| `engine/alembic/env.py` | asyncpg async 마이그레이션 환경 |
| `engine/alembic/script.py.mako` | 리비전 파일 템플릿 |
| `engine/alembic/versions/001_sre_enums.py` | PostgreSQL ENUM 10종 + set_updated_at 트리거 함수 |
| `engine/alembic/versions/002_sre_user.py` | `sre_user` 테이블 |
| `engine/alembic/versions/003_sre_actions.py` | `action_definition`, `action_event` |
| `engine/alembic/versions/004_sre_missions.py` | `mission_definition`, `user_mission_progress`, `mission_recommendation` |
| `engine/alembic/versions/005_sre_points.py` | `rp_balance`, `rp_transaction`, `rp_expiration_schedule` |
| `engine/alembic/versions/006_sre_diversity_tier.py` | `behavior_category_log`, `user_diversity_score`, `tier_definition`, `user_tier` |
| `engine/alembic/versions/007_sre_rewards.py` | `reward_partner`, `reward_catalog`, `reward_redemption` |
| `engine/alembic/versions/008_sre_abuse_audit.py` | `abuse_rule`, `abuse_event`, `idempotency_key`, `audit_log` |
| `engine/alembic/versions/009_sre_seed_static.py` | 정적 시드: tier 5행, action 12종, abuse_rule 4종, partner 3종, catalog 6종 |

---

## 주요 결정 사항

- **모든 리비전 파일을 `op.execute()` raw SQL 방식으로 작성**  
  SQLAlchemy `sa.Enum(create_type=False)`가 PostgreSQL asyncpg 드라이버에서 이미 존재하는 ENUM 타입을 재생성하려 시도하는 문제 발생. 원인: SQLAlchemy가 내부적으로 ENUM 존재 여부와 무관하게 DDL을 생성함.  
  → `op.execute()` 방식으로 100% raw DDL 제어.

- **리비전 ID**: `sre001` ~ `sre009` (순차 명명, 사람이 읽기 쉬운 형식)

- **시드 리비전(009)에서 `%%` 이스케이프**: Python 포맷 문자열에서 `%` 리터럴을 `%%`로 이스케이프 (abuse_rule 시드의 "신규 3일 50%% 적립" 등)

---

## 검증 결과

```
alembic current  →  sre009 (head)
alembic history  →  <base> -> sre001 -> sre002 -> ... -> sre009 (head)
```

`alembic upgrade head` 최종 실행 결과: 9개 리비전 전부 정상 적용 완료.

---

## 다음 단계

- **Phase 3**: Engine 핵심 서비스 레이어 (`models.py`, `schemas.py`, `deps.py`, `services/`)
