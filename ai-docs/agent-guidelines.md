# AI Agent Guideline

새 스레드에서 AI가 따라야 할 운용 규칙. 산출물 색인은 [`INDEX.md`](INDEX.md), 현재 작업 상태는 [`context/current.md`](context/current.md). 행동 원칙(카파시 4원칙)은 [`/CLAUDE.md`](../CLAUDE.md).

## 1. 기본 작업 워크플로우 (모든 구현 작업에 자동 적용)

별도 지시가 없더라도 구현 작업을 받으면 **항상** 아래 순서를 따른다. 착수·오케스트레이션은 **`/doil-supervise`** 로 수행한다(감독은 이해·라우팅·리뷰·종합만 하고 구현은 서브에이전트에 위임).

### A. 착수 — 태스크 등록

1. **Feature 등록/확인 (Plane)** — 해당 기능이 없으면 등록, 있으면 `IN_PROGRESS`로 전환. Plane에 해당 label이 없으면 **label을 먼저 생성**한 뒤 Feature에 연결한다. 접근 방법은 [§6 Plane 접근 — REST API](#plane-접근--rest-api-직접-호출-mcp-아님) (**MCP 아님 — `curl` 직접 호출**).
2. **태스크 문서 생성** — `ai-docs/task/active/${YYMMDD}_${title}_task.md`에 상세 문서(목적·Phase·서브태스크 목록·제약사항) 작성. 이 md 파일이 **SoT**.
3. **서브 Todo 등록 (Plane)** — 서브태스크를 Plane에 각각 등록. 서브태스크는 검증 가능한 단위로 나눈다.
   - 예: `[P1-1] CSS 재작성` → `[P1-2] TSX 재작성` → `[P1-3] i18n 적용` → `[P1-4] 빌드 검증`
   - **이슈 description 에는 md SoT 경로를 직접 기재한다** — `SoT: ai-docs/task/active/…`. (종전엔 Notion URL 을 넣었으나 Notion 미러는 폐기됐다 — [§3-B](#3-b-notion-미러--폐기-2026-08-13))
   - Feature 이슈 description 에도 동일한 md SoT 경로를 기재한다.
4. **티켓 발행 (`doil-context` MCP)** — 메인 티켓 1개 + 서브 티켓(Phase 단위) N개. `/doil-supervise` 가 라우팅·이어받기에 쓴다. 상세 사용법은 [§1-D](#d-티켓-발행-doil-context).
5. **Context 갱신** — `current_focus`를 🔧 상태로 갱신.
6. **`current.md` 활성 태스크 라인 추가** — 근본 원인·P0 항목·미결 결정을 한 항목으로 요약([§2](#2-파일-작성-위치-sot-매핑) SoT 매핑).

> **역할 분담**
>
> | 시스템 | 역할 | 누가 보나 |
> |---|---|---|
> | `ai-docs/task/active/*.md` | **SoT** — 상세 내용·검증 기준·제약 | AI 세션·개발자 |
> | Plane Issues | **진행 상태 추적** — Feature/Todo 상태·우선순위 | 팀·외부(위키·어드민) |
> | `doil-context` 티켓 | **라우팅 계획 + 세션 간 이어받기** — 모델 배분·가정·의존관계 | `/doil-supervise` |
> | `current.md` | 맥락적 판단·외부 의존·대기 항목 | 다음 세션 |
>
> Plane 과 `doil-context` 는 **겹치지 않는다** — Plane 은 *무엇이 어느 단계인가*(사람이 보는 상태판), `doil-context` 는 *어떻게 실행할 것인가*(감독이 쓰는 실행 계획)다. 어느 쪽에도 상세 내용을 쓰지 않고 md SoT 경로를 가리킨다.
>
> **Notion 미러만 폐기됐다**(2026-08-13, [§3-B](#3-b-notion-미러--폐기-2026-08-13)).

### B. 진행 — 단계별 실행

1. 서브태스크를 순서대로 진행하며, 착수 시 해당 **서브 Todo(Plane)를 `IN_PROGRESS`** 로, **서브 티켓(`doil-context`)의 `context.status`** 도 함께 전환.
2. 서브태스크 완료 시 양쪽 모두 `DONE` 으로 전환하고, 검증 결과(테스트 PASS·커밋 해시 등)를 티켓 `context` 에 기록.
3. 작업 중 추가 서브태스크가 발생하면 즉시 등록(Plane Todo + 서브 티켓).

### C. 완료 — 갱신 + 리빌드

1. 모든 서브 Todo·서브 티켓 `DONE` 확인.
2. 메인 Todo·메인 티켓 → `DONE`.
3. Feature → `DONE` (해당 Feature의 모든 작업이 완료된 경우).
4. `current_focus` status를 ✅로 전환.
5. **리빌드** — 프론트/백엔드 변경분에 따라 컨테이너 재빌드.
6. **`__DEV Context` + `current.md` 현행화 (필수, 생략 금지)** — 이 두 가지는 독립적인 갱신 대상이다. DB(`__DEV_features`/`__DEV_todos`/`__DEV_context`)는 추적 SoT, `current.md`는 DB에 담기 어려운 맥락(외부 의존·결정사항·대기 항목)을 기록한다. 어느 한쪽만 갱신하고 다른 쪽을 빠뜨리면 다음 세션이 불완전한 상태로 시작된다. DONE 항목은 `current.md`에 남기지 않고 `history.md`로 이관한다.
7. **명세 반영** — 구현 완료된 기능은 `/README.md`(사용자 시점)와 `ai-docs/spec/overview.md`(명세 시점)에 반영.
8. **완료 태스크 문서 이관** — `ai-docs/task/active/` → `ai-docs/task/${YYMMDD}/` + `task/archive.md` 색인([§2](#2-파일-작성-위치-sot-매핑)).

### D. 티켓 발행 (`doil-context`)

`/doil-supervise` 가 세션 간 이어받기·워커 라우팅에 쓰는 티켓 저장소다. **모든 `*_put`/`*_get` 호출에 `workspace: /mnt/c/DEV/saigon_rider` 를 넘긴다** (workspace 가 티켓 격리 단위).

| MCP 도구 | 용도 |
|---|---|
| `task_context_put` | 메인 티켓(`sub_id` 생략) 또는 서브 티켓(`sub_id` 지정) upsert |
| `task_context_get` | 티켓 하나 조회 |
| `task_context_find_recent` | 최근 메인 티켓 목록 — **이어받을 대상을 찾을 때** |
| `task_context_find_subs` | 특정 메인 티켓의 서브 티켓 전체 |
| `task_context_export_md` | 티켓을 md 로 내보내기 (핸드오프·보고용) |
| `task_context_del` / `task_context_vacuum` | 삭제 / 오래된 티켓 정리 |

**slug 규약** — `task_id` 는 `${YYYY-MM-DD}-${kebab-slug}` (예: `2026-08-13-location-gate`), `sub_id` 는 Phase 식별자 (예: `p1-gate`, `p2-report`). 태스크 md 파일명과 대응시켜 추적한다.

**메인 티켓 `context` 에 담을 것** (자유 형식 JSON이지만 아래는 관례):

| 키 | 내용 |
|---|---|
| `status` | `READY_TO_START` / `IN_PROGRESS` / `BLOCKED` / `DONE` |
| `sot` | 태스크 md 경로 — **상세는 티켓에 쓰지 않고 md 를 가리킨다** |
| `goal` | 검증 가능한 목표 1~2줄 (카파시 #4) |
| `assumptions` | 명시한 가정 (카파시 #1) |
| `decisions` / `open_decisions` | 확정된 결정 / 승인 대기 결정 |
| `routing_plan` | Phase → 모델(Fable/Sonnet/Haiku) + **근거** (CLAUDE.md §5) |
| `constraints` | 어기면 회귀가 나는 제약 |

**서브 티켓 `context` 에 담을 것**: `status`, `model` + `model_rationale`, `subtasks`(검증 가능한 단위), `verify`(검증 방법), `depends_on`, 필요 시 `caution`(머니 경로·기존 불변식 등).

**세션 이어받기** — 새 스레드에서 진행 중 작업을 이어받을 때는 `task_context_find_recent` 로 대상을 찾고, `sot` 가 가리키는 md 를 읽어 맥락을 복원한다. 티켓에는 상태·라우팅만, 상세는 md 에 있다.

### 자주 쓰는 빌드 명령

```bash
docker compose --env-file .env up --build -d frontend   # 프론트 재배포
./wikidoc_publish.sh                                     # 위키 동기화
```

`backend/` 코드 변경은 `bff` 뿐 아니라 **`noti_worker` 도 재시작/재빌드**해야 반영된다 — 워커는 바인드 마운트로 돌지만 자동 리로드가 없어, `bff` 만 재빌드하면 알림 문안 등 워커 경로는 옛 코드가 계속 나간다 (`docker compose --env-file .env up --build -d bff noti_worker`).

dev 에서 모델 컬럼 추가 시 마이그레이션(`up bff_migrate`)을 먼저 적용한 뒤 `models.py` 를 편집한다 — bff 핫리로드가 모델을 즉시 살려 컬럼 없음 오류로 전 요청이 실패한다.

---

## 2. 파일 작성 위치 (SoT 매핑)

| 종류 | 파일 위치 | 색인 갱신 |
|---|---|---|
| 활성 태스크 | `ai-docs/task/active/${YYMMDD}_${title}.md` | `current.md` 활성 태스크 라인 |
| 완료 태스크 | `ai-docs/task/${YYMMDD}/${file}.md` | `task/archive.md` |
| 트러블슈팅 | `ai-docs/trouble/${YYMMDD}/${YYMMDD}_${title}_troubleshooting.md` | `trouble/index.md` |
| 다영역 협업 후속 TODO | `ai-docs/context/project_todo.md` 카테고리 섹션에 항목 추가 | `INDEX.md` (이미 색인됨) |
| 체크리스트 항목 변경 | `TEST/checklist/s${N}_*.md` 상태 컬럼 | — |
| 결함 발견 | `TEST/issues.md` 표에 행 추가 | `current.md` 미해결 결함 라인 |
| 진척률 변경 | `TEST/progress.md` 표 갱신 | — |
| 신규 영구 산출물 | 적절한 디렉터리 + `INDEX.md` 색인 | `INDEX.md` |
| 반복 태스크 절차 | `ai-docs/workflow/${name}.md` | `workflow/README.md` + `INDEX.md` |

**중복 금지**: 한 사실은 한 곳에만. 진척률은 `progress.md`만, 현재 상태는 `current.md`만, 산출물 위치는 `INDEX.md`만.

## 3. 문서 관리 정책

### 3-A. git 추적

`ai-docs/` 는 표준 정책상 로컬 전용 디렉터리지만, 본 프로젝트는 **private repo 운영 중이라 git 추적을 의도적으로 허용**한다. 환경 마이그레이션 시 컨텍스트가 함께 이동하는 이점을 위해 유지하는 예외이므로, "추적되지 말아야 한다"는 지적·정리를 시도하지 않는다.

### 3-B. Notion 미러 — 폐기 (2026-08-13)

`ai-docs/` 를 Notion 워크스페이스에 미러링하던 규약은 **폐기됐다**. `ai-docs/*.md`(git)가 유일한 문서 SoT다.

- **신규 문서를 Notion 에 만들지 않는다.** 손으로 동기화하는 비용이 팀 열람 편의보다 컸고, 미러가 밀리면 어느 쪽이 최신인지 모르는 상태가 됐다.
- 대표·비개발자 열람용 산출물이 필요하면 **HTML/PDF 를 그때그때 만들어 전달한다**(`ai-docs/research/` 선례). 상시 동기화 대상을 만들지 않는다.
- **Plane 이슈 description 에는 md SoT 경로를 직접 기재한다** — 종전엔 Notion URL 을 넣었다([§1-A](#a-착수--태스크-등록) 3번). Plane 은 그대로 쓴다(폐기된 것은 Notion 미러뿐).
- **요청받았을 때만** Notion MCP(`notion-create-pages` 등)를 쓴다.

## 4. 보안 / 환경 변수

`.env` 와 `.env.example` 두 파일을 짝으로 운영한다. **위반은 곧 비밀 누출** 이므로 예외 없이 따른다.

| 파일 | git 추적 | 용도 |
|---|---|---|
| `.env` | ❌ (`.gitignore`) | 로컬·서버에 채워 넣는 **실제 값**. 절대 커밋·복사·로그 출력·메신저 공유 금지. |
| `.env.example` | ✅ | 키 인터페이스 템플릿. 값은 `change_me_*` placeholder 또는 공개 가능한 기본값만. |

**규칙**

1. **`.env` 절대 노출 금지** — git 커밋, PR 첨부, 위키 페이지, 로그, 채팅, AI 프롬프트 어디에도 실제 값을 붙여 넣지 않는다. 디버깅 시에도 키 이름만 노출.
2. **두 파일의 키셋은 항상 동일한 인터페이스를 가진다** — 배포 시 `.env.example` 만 함께 나가므로, `.env` 에만 키가 있고 `.env.example` 에 없으면 배포본이 부팅에 실패한다. 한쪽에 키를 추가/삭제/이름변경하면 **즉시** 반대쪽도 동일하게 갱신한다.
3. **보안 정보 하드코딩 금지** — JWT 시크릿, DB 비밀번호, ADMIN 자격, ENGINE_SERVICE_KEY, imgproxy KEY/SALT, OAuth 시크릿 등은 **반드시** `.env` 값을 코드/설정에서 `os.getenv()` / `import.meta.env` / `process.env` / `${VAR}` 보간 등으로 참조한다. 소스 파일·docker-compose.yml·nginx.conf 어디에도 평문으로 적지 않는다.
4. **신규 비밀이 필요할 때** — 먼저 `.env.example` 에 키와 `change_me_*` placeholder 추가 → `.env` 에 실제 값 추가 → 코드는 그 키만 참조. 순서를 지키면 한쪽에만 들어가는 사고를 막을 수 있다.
5. **샘플 값 정책** — `.env.example` 의 비밀 항목 값은 `change_me_*` 로 통일(기존 컨벤션). 포트·타임존 등 공개 가능한 항목은 합리적 기본값을 적어 즉시 사용 가능하게 한다.

위반을 발견하면 즉시 (a) 비밀 회전, (b) git 히스토리 정리(`git filter-repo` 등), (c) 외부 노출 경위 추적 순으로 대응한다.

### 키 파일 (.p8 / .pem) 보관 위치

`.env`로 관리할 수 없는 파일형 비밀(Apple .p8, TLS 인증서 등)은 아래 규칙을 따른다.

| 위치 | 용도 |
|---|---|
| `_secrets/` (프로젝트 루트, `.gitignore`) | 로컬 작업본. git 추적 제외. |
| 운영 서버 `~/secrets/` | 서버 작업본. |

**현재 등록된 키 파일**

| 파일명 | 용도 | Key ID | 발급일 |
|---|---|---|---|
| `AuthKey_XW649V7JXK.p8` | Apple Sign In with Apple (ES256) | `XW649V7JXK` | 2026-06-19 |

> ⚠ `.p8` 파일은 Apple Developer Portal에서 **단 한 번만 다운로드** 가능. 분실 시 재발급(기존 키 폐기)이 필요하다. `_secrets/` 외에 패스워드 매니저 등 오프라인 백업을 권장한다.

## 5. 린터

코드 품질은 린터로 자동 관리한다. `pre-commit` 훅이 커밋 시 자동 실행되므로 별도 워크플로우 없이 동작한다.

### 설정 파일

| 영역 | 도구 | 설정 위치 |
|---|---|---|
| Frontend (TS/React) | ESLint v9 (flat config) | `frontend/eslint.config.js` |
| Backend (Python) | ruff | `backend/pyproject.toml` `[tool.ruff]` |
| Git hook | pre-commit | `.pre-commit-config.yaml` |

### 규칙

1. **커밋 전 린트 통과 필수** — `pre-commit` 훅이 자동 실행. error 0건이어야 커밋 가능. warning은 점진적으로 제거.
2. **새 규칙 추가 시** — 설정 파일에 규칙 추가 → 기존 코드 위반을 먼저 정리(auto-fix 우선) → 커밋. 규칙 추가와 코드 정리를 한 커밋에 묶어도 됨.
3. **프로젝트 특화 ignore** — SQLAlchemy `== True` 패턴(`E712`), FastAPI `Depends` 패턴(`B008`) 등 프레임워크 관용구는 ignore에 등록해둠. 새 프레임워크 패턴이 충돌하면 동일하게 처리.
4. **커스텀 ESLint 규칙** — 프로젝트 컨벤션 강제가 필요하면 `no-restricted-syntax` 패턴으로 추가. `eslint.config.js`의 `rules` 블록에 집중.

### 실행 명령

```bash
# Frontend
cd frontend && npx eslint src/          # 검사
cd frontend && npx eslint src/ --fix    # 자동 수정

# Backend
python3 -m ruff check backend/app/       # 검사
python3 -m ruff check backend/app/ --fix # 자동 수정
python3 -m ruff format backend/app/      # 포맷팅
```

## 6. __DEV Context (진행 상태 관리)

프로젝트 진행 상태는 **Plane CE** (https://plane.doil.me) + DB(`__DEV_context`)로 관리하며, 외부 사용자가 위키·어드민에서 실시간 추적한다. 상세 절차·API·Plane 매핑은 [`workflow/dev-context-management.md`](workflow/dev-context-management.md) 참조.

| 소스 | 역할 |
|--------|------|
| `__DEV_context` (DB) | Key-Value 저장소 + `status` 이모지(🔧/✅/⏸/❌) — `current_focus`, `current_sprint`, `last_deploy`, `blocker`, `next_milestone` |
| Plane Issues (label 필터) | Feature 단위 — `PLANNED → IN_PROGRESS → DONE / DEFERRED` |
| Plane Issues (priority 뷰) | Todo 단위 — `TODO → IN_PROGRESS → DONE / BLOCKED` |
| DB `__DEV_features` / `__DEV_todos` | Plane 연동 실패 시 자동 폴백 |
| `doil-context` 티켓 | 라우팅 계획·세션 간 이어받기 ([§1-D](#d-티켓-발행-doil-context)) — Plane 을 대체하지 않는다 |

### Plane 접근 — REST API 직접 호출 (MCP 아님)

**Plane MCP(`doil-services`)는 동작하지 않는다. `plane_*` MCP 도구를 찾지 말고 `curl` 로 REST API 를 직접 호출한다.** 인증 키는 `.env` 에 이미 등록돼 있다.

| `.env` 키 | 값 / 용도 |
|---|---|
| `PLANE_API_KEY` | `x-api-key` 헤더에 넣는 인증 키 (**등록 완료** — 값을 커밋·출력하지 않는다, [§4](#4-보안--환경-변수)) |
| `PLANE_URL` | `https://plane.doil.me` |
| `PLANE_WORKSPACE` | `doil` |
| `PLANE_PROJECT_ID` | saigon_rider = `53da5691-c368-4d50-a843-43eb67ec7ab0` |

**API base**: `$PLANE_URL/api/v1/workspaces/$PLANE_WORKSPACE/`

```bash
set -a; . ./.env; set +a          # 키를 셸에 로드 (에코 금지)
PLANE_BASE="$PLANE_URL/api/v1/workspaces/$PLANE_WORKSPACE/projects/$PLANE_PROJECT_ID"

# 이슈 목록
curl -s -H "x-api-key: $PLANE_API_KEY" "$PLANE_BASE/issues/"

# 이슈 생성 (Todo)
curl -s -X POST "$PLANE_BASE/issues/" \
  -H "x-api-key: $PLANE_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"[P1] 게이트 신설","description_html":"<p>SoT: ai-docs/task/active/…</p>","priority":"high","state":"<STATE_ID>"}'

# 상태 전환
curl -s -X PATCH "$PLANE_BASE/issues/<ISSUE_ID>/" \
  -H "x-api-key: $PLANE_API_KEY" -H "Content-Type: application/json" \
  -d '{"state":"<STATE_ID>"}'
```

| 엔드포인트 | 용도 |
|---|---|
| `GET/POST /issues/` | 이슈 목록 / 생성 |
| `PATCH /issues/{id}/` | 상태·우선순위·제목 변경 |
| `GET /states/` | State 목록 — 상태 전환 시 ID 필요 |
| `GET /labels/` | 라벨 목록 (= Feature 카테고리) |

**State ID (SGR 프로젝트)** — 매번 조회하지 않아도 되는 고정값:

| 논리 상태 | Plane State | ID |
|---|---|---|
| `PLANNED` | Backlog | `449a54e9-ad3e-421f-a3e1-6e46fd5d59e7` |
| `TODO` | Todo | `824cd235-9fa2-4807-be99-017ee6171b96` |
| `IN_PROGRESS` | In Progress | `0d15841e-63b3-434f-b088-ba63ee9b1127` |
| `DONE` | Done | `683135f5-6fb2-4996-8275-8bad611e12fa` |

- **Feature 는 label 로 구분**된다 (auth, feed, home, infra, profile, quest, ride, settings 등). 없는 label 은 먼저 생성한다([§1-A](#a-착수--태스크-등록) 1번).
- **Priority**: `urgent` / `high` / `medium` / `low` / `none`. Todo 는 `none` 이 아닌 값을 준다(§6 표의 priority 뷰 기준).
- BFF(`/api/bff/dev/*`)를 경유하지 않고 Plane API 를 직접 호출한다.

> **키가 없거나 API 가 응답하지 않으면** Plane 등록을 건너뛰고 `doil-context` 티켓 + 태스크 md 로만 진행한 뒤, **어느 티켓이 Plane 미등록인지 `current.md` 에 남긴다** — 나중에 소급 등록할 수 있게.

## 7. 컨텐츠 관리 (이미지 / 파일)

**모든 이미지·파일 컨텐츠는 `contents` 테이블로 중개되고 `content_id`(UUID)로 매핑된다.** 관리자·프론트·BFF 모두 예외 없이 적용한다.

**규칙**

1. **DB 는 `content_id` 만 저장한다** — 엔티티 테이블에는 `*_content_id UUID REFERENCES contents(id)` 컬럼을 두고, imgproxy URL·파일 경로를 컬럼에 직접 저장하지 않는다. (예: `feed_posts.image_content_id`, `users.avatar_content_id`, `quests.thumbnail_content_id`, `districts.image_content_id`)
2. **URL 은 출력 시점에 해석한다** — BFF 응답·관리자 렌더 시 `content_id` → `contents.file_path` → `build_imgproxy_url()` 로 변환한다. 해석 로직은 `utils.py` 의 resolver(`resolve_avatar_url()`, `resolve_feed_image_url()` 등)에 모은다.
3. **업로드는 contents row 를 먼저 만든다** — 파일 저장 → `contents` row 생성(`owner_type`/`owner_id`/`file_path`) → 엔티티에 `content_id` 연결 순서. owner_type 은 `system`(관리자 배치) / `user`(유저 업로드) / `mock`(퀘스트·구 폴백 풀) / `profile_mock`(프로필 사진 미설정 시 기본 아바타 풀).
4. **레거시 URL 컬럼은 read-only 폴백** — 기존 `image_url`·`avatar_url`·`hero_image_url` 등은 조회 폴백으로만 사용하고, **신규 쓰기 금지**. resolver 우선순위는 항상 `content_id > 레거시 url > 기본값`.
5. **폴백 체인은 모두 contents 중개분으로 구성** — 예: 퀘스트 썸네일 = `thumbnail_content > district.image_content > mock`. contents 미중개 소스를 체인에 끼우지 않는다.
6. **신규 이미지 필드 추가 시** — `*_content_id` FK 컬럼 + 마이그레이션 → 모델 관계(`relationship`, `lazy="selectin"`) → resolver → 출력 스키마 순으로 일관되게 배선한다.

## 8. 네이티브 브리지 규칙 (Capacitor WebView)

**모든 네이티브 기능(GPS, 카메라, 디바이스 정보, 공유, 알림 등)은 반드시 `native.ts`(NativeInterface)를 경유한다. 브라우저 API 직접 호출 금지.**

이 프로젝트는 Capacitor WebView 기반 하이브리드 앱이다. 브라우저 네이티브 API(`navigator.*`)는 WebView에서 OS 레벨 권한 체계와 분리되어 있어, 직접 호출하면 권한 요청 실패·무한 대기·무응답 등 디바이스별 불안정 동작이 발생한다.

**규칙**

1. **`navigator.*` 직접 접근 금지** — `navigator.geolocation`, `navigator.share`, `navigator.vibrate` 등을 컴포넌트·유틸에서 직접 호출하지 않는다. ESLint `no-restricted-globals: navigator`가 error 레벨로 강제된다.
2. **`native.ts`가 유일한 브리지** — 네이티브 기능이 필요하면 `NativeInterface`에 메서드를 추가하고, 내부에서 Capacitor 플러그인(`@capacitor/geolocation`, `@capacitor/camera` 등) 또는 커스텀 플러그인(`plugins/Gps`, `plugins/Device` 등)을 호출한다.
3. **`native.ts` 내부만 예외** — 브리지 구현체인 `native.ts` 파일만 `eslint-disable no-restricted-globals`를 사용할 수 있다. 다른 파일에서의 disable은 PR 리뷰에서 차단한다.
4. **`navigator.clipboard` 같은 웹 전용 API** — Capacitor 대응 플러그인이 없고 WebView에서 안정적으로 동작하는 API는 인라인 `eslint-disable`로 예외 처리하되, 사유를 주석으로 남긴다. 향후 `native.ts`로 흡수 가능.
5. **좌표 획득은 `native.getLocation()` 또는 `infoCoords.ts`** — `@capacitor/geolocation`을 래핑한 `native.getLocation()`을 사용한다. Info 페이지들은 `resolveInfoCoordsSync()`가 이를 내부 호출한다.

## 9. 코드베이스 그래프 (codebase-memory MCP)

이 리포(`mnt-c-DEV-saigon_rider`)는 `codebase-memory` MCP 로 코드 그래프(노드/엣지)가 인덱싱되어 있다. 구조 파악·의존관계 추적을 풀텍스트 검색보다 우선 활용한다.

### 사용 시점

| 상황 | 도구 |
|---|---|
| 특정 함수/컴포넌트의 호출·참조 관계 추적 | `search_graph`, `trace_path` |
| 임의 조건의 그래프 질의 (예: "이 테이블을 쓰는 라우터 전부") | `query_graph` |
| 프로젝트 전체 구조·레이어 개요 필요 | `get_architecture` |
| 코드 스니펫 확인 | `get_code_snippet` |
| 인덱스 최신 여부 확인 | `index_status`, `detect_changes` |
| 압축 아키텍처 요약(프론트 메뉴 구조 등) 조회/갱신 | `manage_adr` — 프로젝트당 문서 1개(싱글턴). `mode: "get"`은 항상 전체 내용을 반환하고, `mode: "sections"`는 `##` 헤더 목록만 반환(부분 조회 아님). 갱신은 `mode: "update"` + 전체 `content`로 덮어쓴다. 상세는 [`frontend-page-map.md`](context/frontend-page-map.md) 상단 안내 참조 |

> ⚠️ **`index_repository` 재인덱싱이 `manage_adr` 내용을 초기화시킨다** (260701 확인 — 원인 불명, 재발 가능). 재인덱싱 직후 `manage_adr(mode='get')`으로 비어있는지 확인하고, 비어있으면 즉시 재작성한다. 작업 마무리 순서: ①ADR 내용 백업(현재 conversation에 남아있으면 그대로 재사용) → ②`index_repository` → ③`manage_adr(mode='get')`으로 확인 → ④비었으면 `mode='update'`로 복구.

### 재인덱싱 규칙

**코드를 수정한 세션에서는 마무리 전에 `index_repository`로 재인덱싱한다.**

- `repo_path`: `/mnt/c/DEV/saigon_rider`
- 파일 몇 개 수준의 소규모 변경 → `mode: fast` 또는 `moderate`
- 라우터/모델 구조 변경, 대규모 리팩토링 → `mode: full`
- 재인덱싱을 생략하면 다음 세션의 그래프 조회가 과거 코드 기준으로 응답하므로, §1-C 완료 체크리스트(커밋/작업 마무리)에 포함시켜 습관화한다.

### 서브에이전트 위임 시 (Agent/Task 도구)

이 지침은 메인 세션에는 자동 적용되지만, `Agent` 도구로 띄우는 서브에이전트(특히 `Explore` 타입)에는 **자동으로 전파되지 않는다** — `Explore`는 기본적으로 grep/glob/Read 기반으로 동작하도록 설계돼 있어, 위임 프롬프트에 명시하지 않으면 MCP 그래프 조회를 아예 시도하지 않는다.

- 구조/의존관계/호출관계/데이터 흐름 파악을 서브에이전트에 위임할 때는, 프롬프트에 **"먼저 `search_graph`/`trace_path`/`get_architecture`(project: `mnt-c-DEV-saigon_rider`)로 조회하고, 부족한 부분만 grep/Read로 보완하라"**를 명시적으로 포함시킨다.
- 위임 프롬프트에 이 지시를 빠뜨리지 않았는지, 결과 보고 후 실제로 MCP 도구를 호출했는지(트랜스크립트에서 `mcp__codebase-memory__*` 실제 tool_use 여부) 확인하는 습관을 들인다 — 도구 목록에 이름이 언급된 것과 실제 호출된 것은 다르다.

### 폴백 — MCP 가 로드되지 않은 환경

`codebase-memory` MCP는 **글로벌(유저 스코프) 설치**이며 이 리포에 프로젝트 스코프로 묶여있지 않다. 즉 다른 유저 프로필이나 MCP 미설정 머신에서 이 리포를 열면 위 도구들이 아예 보이지 않을 수 있다.

- 도구 목록에 `mcp__codebase-memory__*` 가 없으면, 없는 척 진행하지 말고 **유저에게 `codebase-memory` MCP 서버 설치·등록을 권고**한다.
- 그 세션에서는 즉시 기존 방식(Explore 서브에이전트, `grep`/`find`)으로 대체해 작업을 이어간다. MCP 설치를 기다리며 작업을 막지 않는다.

## 10. DB 마이그레이션 관례 (`database/init/`)

### 🔴 `bff_migrate` 는 매 배포마다 wiring 된 SQL 을 전부 재실행한다

**전제를 틀리면 배포가 막힌다.** 스탬프 테이블은 `INSERT ... ON CONFLICT DO NOTHING` 이라 "이미 실행됨" 표시는 남지만, **SQL 본문 자체는 매 배포마다 처음부터 다시 실행된다.** 즉 `database/init/*.sql` 은 "한 번만 도는 마이그레이션"이 아니라 "매번 재실행되는 멱등 스크립트"로 짜야 한다.

이 전제를 놓쳐서 실제로 배포를 막은 사고가 있었다(2026-08-19, `63a4733`, W8): `reports_target_type_check` 를 `144`(5값)→`198`(+REVIEW)→`199`(+BIZ) 세 파일이 순서대로 `DROP CONSTRAINT` 후 **무조건 좁게** `ADD CONSTRAINT ... CHECK (...)` 로 재선언하고 있었다. "최종 정의는 가장 나중 마이그레이션이 소유하고 과거 파일은 건드리지 않는다"는 관례 자체는 맞았지만, **재실행 환경에서는 중간 소유자(144)가 재실행되는 순간 이미 쌓인 최신 데이터(REVIEW 신고)를 위반**한다. REVIEW 신고가 0건인 동안은 우연히 통과했을 뿐, 1건이라도 생기자 재배포할 때마다 `bff_migrate` 가 `144` 실행 지점에서 **exit 3 로 죽고 BFF 전면 502** 가 났다. 부작용으로 `144` 의 `ADD` 가 죽으면서 한동안 `reports.target_type` 에 **CHECK 제약이 아예 없는 드리프트 상태**이기도 했다.

### 규약 — 같은 CHECK 제약을 여러 파일이 좁혀나갈 때

같은 제약을 두 파일 이상이 "무조건 `DROP CONSTRAINT IF EXISTS` 후 `ADD CONSTRAINT`" 로 재선언하는 체인이 생기면:

1. **최종 소유자(가장 나중 파일)만 `NOT VALID` 없이** 온전한 `CHECK` 로 재선언해 기존 행을 전부 검증한다.
2. **그 외 모든 과거 소유자는 `ADD CONSTRAINT ... CHECK (...) NOT VALID`** 로 바꿔 재실행 시 기존 행 검사를 건너뛰게 한다 — 최종 소유자가 뒤에서 실제 검증을 담당하므로 최종 상태(신규 DB 초기화 포함)는 동일하다.
3. **체인에 새 값을 추가할 때** — 새 파일이 `NOT VALID` 없이 새 최종 소유자가 되고, 그 순간 **직전 소유자였던 파일에 `NOT VALID` 를 붙인다.** (예: `199` 다음에 새 값을 추가하는 마이그레이션이 생기면, 그 파일이 `NOT VALID` 없이 소유권을 넘겨받고 `199` 의 `ADD CONSTRAINT` 에 `NOT VALID` 를 붙여야 한다.)
4. **예외** — `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='...') THEN ADD CONSTRAINT ... END $$;` 로 감싼 "없을 때만 추가" 가드 패턴은 애초에 기존 정의를 덮어쓰지 않으므로 이 규약 대상이 아니다(예: `ad_events_event_type_check`, `marketplace_listings_status_check` — `162` 는 2026-08-18 에 동일한 사고 유형을 먼저 겪고 이 패턴으로 고쳐진 선례).

### 회귀 테스트 — 컨테이너에서 돌지 않는다는 함정

`backend/app/tests/test_migration_check_revalidation.py` 가 위 불변식(최종 소유자 제외 전원 `NOT VALID`)을 이름(제약명) 기준 동등성으로 정적 검증한다. **호스트에서 단독 실행하면 2 tests OK 지만, 컨테이너 안에서 실행하면 `FileNotFoundError: /docker-compose.yml` 로 ERROR** 난다 — 컨테이너에 `/docker-compose.yml`·`/database` 가 마운트돼 있지 않은 기존 부채(`017_IMPLEMENTATION_REPORT.md` "경보기가 꺼져 있다" 항목)가 원인이다. **즉 이 사고를 다시 막으려고 만든 경보기가 같은 이유로 컨테이너 CI 경로에서는 꺼져 있다.** CI/컨테이너 실행 경로를 바꾸기 전까지는 호스트에서 수동 실행해 확인하는 수밖에 없다는 점을 인지하고 있어야 한다.

⚠️ 추가로, `test_market_listing_owner_access.py` 는 **단독 실행하면 7 tests OK** 지만 `test_migration_check_revalidation.py` 와 **같은 프로세스에서 함께 실행하면** `funnel_events_user_id_fkey` FK 위반과 asyncpg 이벤트 루프 충돌로 실패한다(감독 실측, 2026-08-20). 이번 마이그레이션/신고 UX 변경이 만든 문제가 아니라 **기존 테스트 격리 결함**이다 — 두 모듈을 함께 돌리면 결과가 달라질 수 있다는 점을 알고 있어야 하며, 개별 모듈 단위로 실행해 판단한다.
