# SRE 엔진 통합 지침서 (Engine Integration Guide) — DEPRECATED

> 작성일: 2026-05-14  
> 작성자: AI Agent (Claude)  
> 상태: **⚠️ DEPRECATED — 2026-05-14 아키텍처 재검토로 폐기**  
> 대체 문서: [`engine_intg_v2.md`](../engine_intg_v2.md)

---

## 폐기 사유

이 문서는 엔진을 기존 FastAPI 백엔드 컨테이너에 **모놀리식으로 통합**하는 방식(옵션 A)을 채택한 초안입니다.

재검토 결과, 기존 백엔드를 **BFF(Backend For Frontend)** 역할로 명확히 분리하고,
SRE 엔진은 **독립 컨테이너**(`saigon_engine`)로 운영하는 방식이 책임 분리와
장기 확장성 측면에서 더 적합하다고 판단하였습니다.

아래에 원문 내용을 보존합니다. 구조 설계 검토 이력 참조 목적으로만 활용하세요.

---

# SRE 엔진 통합 지침서 (Engine Integration Guide)

> 작성일: 2026-05-14  
> 작성자: AI Agent (Claude)  
> 상태: **확정 — 구현 착수 전 필독**

이 문서는 `docs/engine/` 하위의 **SRE(Saigon Rider Reward Engine) 설계 명세**와
현재 운영 중인 **FastAPI 백엔드 컨테이너**를 실제로 연계·구현하기 위한 통합 지침입니다.

---

## 1. 엔진 개요 및 참조 문서 맵

| 문서 | 경로 | 역할 |
|---|---|---|
| SRE 설계서 | `docs/engine/sre-design-spec.md` | 8개 모듈 경계, 도메인 범위, 보안 모델 |
| 비즈니스 룰 | `docs/engine/01-sre-business-rules.md` | RP 계산식, 어뷰징 룰, 멱등성, 보상 교환 정책 |
| 기술 스택 | `docs/engine/02-sre-tech-stack.md` | 패키지 구조, Alembic, APScheduler, 인증 결정 |
| ERD | `docs/engine/sre-erd-mermaid.postgres.md` | 전체 테이블 정의 및 관계 |
| SQL DDL | `docs/engine/sre-schema.postgres.sql` | PostgreSQL 실제 DDL |
| OpenAPI | `docs/engine/sre-api.openapi.yml` | REST API 전체 명세 |
| 미션 규칙 매핑 | `docs/engine/sre-mission-rule-mapping.md` | 미션↔액션 코드 매핑 |
| 미션 목록 (12M) | `docs/engine/sre-mission-list-12m.csv` | 미션 240개 원본 데이터 |
| 미션 시드 SQL | `docs/engine/sre-mission-seed.sql` | 미션 초기 데이터 INSERT |

---

## 2. 배포 아키텍처 결정: 모놀리식 통합 (Monolith-First)

### 2.1 검토 대상 옵션

엔진을 백엔드에 탑재하는 방식으로 다음 두 가지를 검토했습니다.

#### 옵션 A — 기존 FastAPI 컨테이너에 `sre/` 서브패키지로 통합

```
saigon_backend (기존 컨테이너)
└── backend/app/
    ├── main.py          ← sre.router 등록 추가
    ├── routers/         ← 기존 auth, profile, contents 등
    └── sre/             ← 신규: SRE 모듈 서브패키지
        ├── routers/
        ├── services/
        ├── adapters/
        └── jobs/
```

#### 옵션 B — 별도 엔진 전용 컨테이너 (`saigon_engine`)

```
docker-compose.yml
├── saigon_backend    (기존: auth, profile, quests, ride 등)
└── saigon_engine     (신규: SRE 전용 FastAPI 앱, 별도 포트)
```

### 2.2 검토 결과

| 비교 항목 | 옵션 A (통합) | 옵션 B (분리) |
|---|---|---|
| 인프라 비용 | 추가 컨테이너 없음 | 컨테이너 + DB 마이그레이션 관리 이원화 |
| DB 접근 | 동일 PostgreSQL, 동일 엔진 — 트랜잭션 보장 | 네트워크 호출 + 분산 트랜잭션 복잡도 증가 |
| 코드 경계 | `sre/` 패키지 격리로 논리적 분리 가능 | 물리적 분리이나 현 단계에서 과도한 복잡성 |
| 배포 복잡도 | 기존 `--profile backend` 유지 | 새 profile/compose 서비스 추가 필요 |
| v2 분리 용이성 | 패키지 경계가 깨끗하면 분리 어렵지 않음 | 처음부터 분리되어 있어 유리 |
| 현재 트래픽 규모 | v1 초기 — 분산 이점 없음 | 과잉 설계 |

> **결정: 옵션 A — 기존 `saigon_backend` 컨테이너에 `sre/` 서브패키지로 통합**

**근거:**
- SRE 설계서(`sre-design-spec.md §10`)의 마이그레이션 전략이 명확히 "v1: 같은 DB·같은 앱, 코드만 모듈화"를 규정함
- 기술 스택 문서(`02-sre-tech-stack.md §1`)도 동일한 모놀리식 패키지 분리를 결정함
- 현재 v1은 단일 호스트 Docker Compose 환경 — 별도 서비스 운영 비용이 이득을 초과
- RP 계산→잔액 갱신→감사 로그가 **단일 PostgreSQL 트랜잭션**으로 처리되어야 정합성 보장 가능

**v2 전환 트리거:** 일일 활성 사용자 100k 이상 또는 별도 팀이 SRE를 독립 운영할 필요가 생기면 별도 컨테이너로 분리.

---

## 3~11. (원문 보존 — 이하 생략)

> 전체 원문은 Git 이력 또는 `engine_intg_v2.md` 작성 이전 커밋에서 확인 가능합니다.
> 이 문서의 §3~§11은 모놀리식 통합 기준의 파일 레이아웃·DB 마이그레이션·Nginx·연계 지점·Task Plan을 담고 있으며,
> 구조 결정 이력 참조 목적으로만 활용하십시오.

---

(끝 — DEPRECATED)
