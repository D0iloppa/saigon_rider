# AI Agent Guideline

새 스레드에서 AI가 따라야 할 운용 규칙. 산출물 색인은 [`INDEX.md`](INDEX.md), 현재 작업 상태는 [`context/current.md`](context/current.md). 행동 원칙(카파시 4원칙)은 [`/CLAUDE.md`](../CLAUDE.md).

## 1. 기본 작업 워크플로우 (모든 구현 작업에 자동 적용)

별도 지시가 없더라도 구현 작업을 받으면 **항상** 아래 순서를 따른다. 상세 API·도구 사용법은 [§6 __DEV Context](#6-__dev-context-진행-상태-관리) 및 [`workflow/dev-context-management.md`](workflow/dev-context-management.md) 참조.

### A. 착수 — 태스크 등록

1. **Feature 등록/확인** — 해당 기능이 `__DEV_features`에 없으면 등록, 있으면 `IN_PROGRESS`로 전환. Plane에 해당 label이 없으면 **label을 먼저 생성**한 뒤 Feature에 연결한다.
2. **태스크 문서 생성** — `ai-docs/task/active/${YYMMDD}_${title}_task.md`에 상세 문서(목적·Phase·서브태스크 목록·제약사항) 작성. 이 md 파일이 **SoT**.
3. **Notion 미러 페이지 생성** — md 내용을 Notion `Task > Active` 하위에 페이지로 생성. 생성된 **Notion URL을 기록**한다.
4. **서브 Todo 등록 (Plane)** — 서브태스크를 Plane에 각각 등록. 서브태스크는 검증 가능한 단위로 나눈다. **각 이슈의 description에 Notion 태스크 문서 링크를 삽입**한다 (상세 내용은 Notion에서 열람).
   - 예: `[P1-1] CSS 재작성` → `[P1-2] TSX 재작성` → `[P1-3] i18n 적용` → `[P1-4] 빌드 검증`
   - Plane 이슈 description: `상세: <Notion URL> | SoT: ai-docs/task/active/…`
5. **Feature에도 Notion 링크** — Feature 이슈의 description에도 동일한 Notion 링크 + md SoT 경로를 기재한다.
6. **Context 갱신** — `current_focus`를 🔧 상태로 갱신.

> **3개 시스템의 역할 분담**: md 파일 = SoT (상세 내용), Notion = 팀 열람용 미러 (클릭 가능 링크), Plane = 진행 상태 추적 (상태·우선순위). Plane에는 상세 내용을 쓰지 않고 Notion 링크로 대체한다.

### B. 진행 — 단계별 실행

1. 서브태스크를 순서대로 진행하며, 착수 시 해당 서브 Todo를 `IN_PROGRESS`로 전환.
2. 서브태스크 완료 시 `DONE`으로 전환.
3. 작업 중 추가 서브태스크가 발생하면 즉시 등록.

### C. 완료 — 갱신 + 리빌드

1. 모든 서브 Todo `DONE` 확인.
2. 메인 Todo → `DONE`.
3. Feature → `DONE` (해당 Feature의 모든 작업이 완료된 경우).
4. `current_focus` status를 ✅로 전환.
5. **리빌드** — 프론트/백엔드 변경분에 따라 컨테이너 재빌드.
6. **`__DEV Context` + `current.md` 현행화 (필수, 생략 금지)** — 이 두 가지는 독립적인 갱신 대상이다. DB(`__DEV_features`/`__DEV_todos`/`__DEV_context`)는 추적 SoT, `current.md`는 DB에 담기 어려운 맥락(외부 의존·결정사항·대기 항목)을 기록한다. 어느 한쪽만 갱신하고 다른 쪽을 빠뜨리면 다음 세션이 불완전한 상태로 시작된다. DONE 항목은 `current.md`에 남기지 않고 `history.md`로 이관한다.
7. **명세 반영** — 구현 완료된 기능은 `/README.md`(사용자 시점)와 `ai-docs/spec/overview.md`(명세 시점)에 반영.

### 자주 쓰는 빌드 명령

```bash
docker compose --env-file .env up --build -d frontend   # 프론트 재배포
./wikidoc_publish.sh                                     # 위키 동기화
```

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

### 3-B. Notion 동기화

`ai-docs/` 의 마크다운 문서는 **Notion 워크스페이스**에도 동일한 계층 구조로 관리된다.

**Notion 루트 페이지**: [🏍️ Saigon Rider](https://www.notion.so/doiloppa/Saigon-Rider-36f3bd6b405d81d2b42ce4ba025da4e3)

| 저장소 | 역할 | SoT 여부 |
|---|---|---|
| `ai-docs/*.md` (git) | 코드와 함께 버전 관리, AI 세션 시작 시 직접 로드 | **Primary SoT** |
| Notion Pages | 팀 열람·검색·코멘트, 비개발자 접근 | 미러 (읽기 편의) |

**규칙**

1. **md 파일이 SoT** — 문서 수정은 항상 `ai-docs/*.md` 파일에서 먼저 한다. Notion은 미러이므로, Notion에서만 수정하고 md에 반영하지 않으면 다음 동기화 시 덮어쓰여질 수 있다.
2. **신규 문서 작성 시** — md 파일 생성 후 Notion에도 해당 섹션 하위에 페이지를 추가한다. Notion MCP(`notion-create-pages`)로 자동화 가능.
3. **Notion 계층 구조** — `ai-docs/` 디렉터리 구조를 그대로 따른다. 디렉터리 = Notion 부모 페이지, md 파일 = Notion 하위 페이지.
4. **HTML 파일은 제외** — `v6_info/` 등의 HTML 화면 스펙은 Notion에 올리지 않는다. 마크다운만 동기화 대상.
5. **Plane ↔ Notion 연계** — Plane 이슈(Feature/Todo)에는 상세 내용을 직접 쓰지 않는다. 대신 Notion 페이지 URL을 description에 삽입하여 **클릭 한 번으로 상세 문서에 접근**할 수 있게 한다. 이렇게 하면 Plane은 상태 추적, Notion은 내용 열람, md 파일은 SoT로 역할이 분명하게 분리된다.

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

### Plane MCP 도구 (`doil-services`)

Plane CE 조회·갱신은 **`doil-services` MCP 서버**의 도구를 사용한다. BFF API(`/api/bff/dev/*`)를 경유하지 않고 Plane API를 직접 호출한다.

| MCP 도구 | 용도 |
|---|---|
| `plane_list_workspaces` | 워크스페이스 목록 |
| `plane_list_projects` | 프로젝트 목록 (`workspace` 파라미터 생략 시 기본 `doil`) |
| `plane_list_states` | 프로젝트의 상태(State) 목록 — issue 상태 변경 시 `state` ID 필요 |
| `plane_list_labels` | 프로젝트의 라벨 목록 |
| `plane_list_issues` | 이슈 목록 조회 (state 필터 가능) |
| `plane_create_issue` | 이슈 생성 |
| `plane_update_issue` | 이슈 상태·우선순위·제목 변경 |

**공통 파라미터:**
- `workspace`: 기본값 `doil` (생략 가능)
- `project`: **필수** — saigon_rider = `53da5691-c368-4d50-a843-43eb67ec7ab0`

**상태 변경 시:** `plane_list_states`로 해당 프로젝트의 state ID를 먼저 조회한 뒤, `plane_update_issue`의 `state` 파라미터에 ID를 전달한다.

**설정 위치:** MCP 서버 코드 `/mnt/c/DEV/docker/doil-sb/mcp/`, 설정 `config.yml`.

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
