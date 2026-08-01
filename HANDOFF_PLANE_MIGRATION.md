# dev_context DB → Plane API 마이그레이션 핸드오프

## 배경

기존에 `__DEV_context`, `__DEV_features`, `__DEV_todos` 테이블(PostgreSQL)로 관리하던 개발 컨텍스트를 **Plane CE** (https://plane.doil.me) 로 이관 완료했다. 데이터는 이미 Plane에 등록되어 있고, MCP도 Plane API 기반(`/mnt/c/DEV/docker/doil-sb/mcp/`)으로 교체됨. 이제 saigon_rider 내부 코드에서 DB 직접 조회를 Plane API 호출로 전환해야 한다.

## Plane 정보

- **URL**: https://plane.doil.me
- **Workspace slug**: `doil`
- **API 인증**: `x-api-key` 헤더
- **API base**: `https://plane.doil.me/api/v1/workspaces/doil/`
- **Saigon Rider 프로젝트 ID**: `53da5691-c368-4d50-a843-43eb67ec7ab0`
- **Config 파일**: `/mnt/c/DEV/docker/doil-sb/mcp/config.yml`에 API 키, workspace slug 등 기재

### Plane 상태 매핑

| 기존 DB | Plane State | State ID (SGR) |
|---------|-------------|----------------|
| DONE | Done | `683135f5-6fb2-4996-8275-8bad611e12fa` |
| IN_PROGRESS | In Progress | `0d15841e-63b3-434f-b088-ba63ee9b1127` |
| PLANNED | Backlog | `449a54e9-ad3e-421f-a3e1-6e46fd5d59e7` |
| TODO | Todo | `824cd235-9fa2-4807-be99-017ee6171b96` |

### Plane API 주요 엔드포인트

```
GET    /workspaces/{ws}/projects/{proj}/issues/          # list issues (features + todos)
POST   /workspaces/{ws}/projects/{proj}/issues/          # create issue
PATCH  /workspaces/{ws}/projects/{proj}/issues/{id}/     # update issue
GET    /workspaces/{ws}/projects/{proj}/states/           # list states
GET    /workspaces/{ws}/projects/{proj}/labels/           # list labels (= categories)
```

- Features는 label(category)로 구분됨: auth, feed, home, infra, profile, quest, ride, settings
- Priority: `urgent`, `high`, `medium`, `low`, `none`
- Issues에 `start_date`, `due_date` 필드 있음

## 변경 대상 파일

### 1. Wiki UI (최우선)
**`wiki/src/components/DevProgress.tsx`**
- 현재: `/api/bff/dev/summary`, `/api/bff/dev/features`, `/api/bff/dev/todos` fetch
- 변경: Plane API를 래핑한 BFF 엔드포인트로 변경, 또는 BFF가 Plane API를 프록시하도록
- 응답 형식을 Plane 구조에 맞게 파싱 필요

### 2. BFF API Router
**`backend/app/routers/dev_context.py`** — `router` (JSON API)
- 현재: SQLAlchemy ORM으로 `__DEV_*` 테이블 직접 쿼리
- 변경: Plane API를 `httpx`로 호출하는 프록시 레이어로 전환
- 기존 엔드포인트 시그니처 유지 (wiki UI 호환):
  - `GET /api/dev/summary` → Plane issues 조회 후 기존 summary 형식으로 변환
  - `GET /api/dev/features` → Plane issues (label 필터) 조회
  - `GET /api/dev/todos` → Plane issues (priority != none) 조회
  - `POST/PATCH/DELETE` → Plane issue CRUD 프록시

### 3. Admin Router
**`backend/app/routers/dev_context.py`** — `admin_router` (HTML)
- 현재: DB 직접 쿼리 + Jinja2 렌더링
- 변경: Plane API 조회 결과로 렌더링
- `/admin/dev` 대시보드, status cycle, CRUD 모두 Plane API 경유

### 4. MCP Dev 서비스 (비활성화 가능)
**`mcp_dev/` 디렉토리 전체**
- 이미 `/mnt/c/DEV/docker/doil-sb/mcp/`의 Plane MCP로 대체됨
- `.claude/settings.json`도 교체 완료
- `docker-compose.yml`에서 `mcp_dev` 서비스 제거 또는 profile로 격리 가능

### 5. ai-docs 업데이트
- `ai-docs/workflow/dev-context-management.md` — SoT를 Plane으로 변경
- `ai-docs/context/current.md` — DB 대신 Plane 참조로 변경
- `ai-docs/agent-guidelines.md` — get_dev_summary() → Plane MCP 도구 참조로 변경
- `ai-docs/schema/erd.md` — __DEV_* 테이블을 deprecated 표기
- `ai-docs/context/project_todo.md` — Plane 참조로 변경

### 6. 정리 (후순위)
- `backend/app/models.py`에서 `DevContext`, `DevFeature`, `DevTodo` 모델 deprecated 표기
- `backend/app/schemas.py`에서 관련 Pydantic 스키마 deprecated 표기
- DB 테이블(`__DEV_*`)은 삭제하지 않음 (유지)

## 구현 전략

1. **BFF에 Plane API 클라이언트 추가** — `backend/app/services/plane_client.py` 생성
   - `httpx.AsyncClient`로 Plane API 호출
   - config에서 API 키/workspace/project ID 로드
   - 응답을 기존 schema 형식으로 변환하는 어댑터

2. **Router 전환** — `dev_context.py`의 DB 쿼리를 plane_client 호출로 교체
   - 기존 엔드포인트 시그니처 그대로 유지
   - Wiki UI 변경 최소화

3. **Wiki DevProgress 컴포넌트** — API 응답 형식이 유지되면 변경 불필요

4. **mcp_dev 서비스 격리** — docker-compose에서 `profiles: [legacy]`로 이동

## 주의사항

- Plane API는 rate limit이 있음 (연속 호출 시 5900 에러)
- DB는 삭제하지 않음 — fallback 및 히스토리 용도로 유지
- `__DEV_context` (KV 스토어)는 Plane에 직접 대응이 없음 → 프로젝트 description 또는 custom property로 대체하거나, 이 부분만 DB 유지
