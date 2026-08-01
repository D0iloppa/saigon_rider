# Engine Phase 1 — 컨테이너 기반 구축

> 작업일: 2026-05-14  
> 상태: ✅ 완료  
> 참조: [`docs/engine_intg_v2.md`](../../context/architecture.md) Phase 1

---

## 작업 범위

`engine_intg_v2.md` Phase 1 체크리스트 전체 구현.  
BFF + Engine 분리 아키텍처의 컨테이너 기반을 확립한다.

---

## 산출물

### 신규 파일

| 파일 | 설명 |
|---|---|
| `engine/Dockerfile` | Engine 컨테이너 빌드 정의 (python:3.12-slim, port 8090) |
| `engine/requirements.txt` | 운영 패키지 (fastapi, sqlalchemy, alembic, apscheduler 등) |
| `engine/requirements-dev.txt` | 개발 패키지 (pytest, ruff, mypy 등) |
| `engine/app/__init__.py` | 패키지 초기화 |
| `engine/app/main.py` | FastAPI 앱 진입점, `/v1/health` 엔드포인트 |
| `engine/app/config.py` | `SreSettings` (pydantic-settings BaseSettings) |
| `engine/app/enums.py` | DB ENUM 10종 Python Enum 매핑 |
| `engine/app/exceptions.py` | 비즈니스 예외 클래스 및 HTTP 변환 헬퍼 |
| `engine/app/database.py` | SQLAlchemy async 엔진, `get_db` 의존성 |

### 수정 파일

| 파일 | 변경 내용 |
|---|---|
| `docker-compose.yml` | `backend` → `bff` (container_name: `saigon_bff`), `engine` 서비스 신규 추가 |
| `.env` | `ENGINE_PORT`, `ENGINE_SERVICE_KEY`, `ENGINE_ADMIN_JWT_SECRET` 추가 |
| `.env.example` | 동일 키 추가 (주석 포함) |
| `nginx/conf.d/default.conf` | `http://backend:8080` → `http://bff:8080` 전체 변경, `/engine/` 라우팅 블록 추가 |

---

## 주요 결정 사항

- Engine 포트: **8090** (BFF 8080과 구분)
- Nginx `/engine/` 경로: `172.16.0.0/12` 내부망만 허용, 외부 직접 접근 차단
- `.env`의 `ENGINE_SERVICE_KEY` / `ENGINE_ADMIN_JWT_SECRET`은 개발용 플레이스홀더 — 운영 배포 전 `openssl rand -hex 32`로 교체 필수
- `engine/app/` 하위 `routers/`, `services/`, `adapters/`, `jobs/`, `tests/` 디렉터리는 골격만 생성, Phase 3~4에서 채움

---

## 다음 단계

- **Phase 2**: Alembic 초기화 + SRE 리비전 001~009 작성 및 `alembic upgrade head` 검증
