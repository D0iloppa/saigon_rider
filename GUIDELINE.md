# AI Agent Guideline

새 스레드에서 AI가 따라야 할 운용 규칙. 산출물 색인은 [`ai-docs/INDEX.md`](ai-docs/INDEX.md), 현재 작업 상태는 [`ai-docs/context/current.md`](ai-docs/context/current.md).

## 1. 진입 순서

새 스레드는 항상 다음 순서로 두 파일만 읽고 시작한다:

1. [`ai-docs/INDEX.md`](ai-docs/INDEX.md) — 산출물 지도
2. [`ai-docs/context/current.md`](ai-docs/context/current.md) — 직전 작업 상태 / 다음 우선순위

전체 파일 풀텍스트 검색 금지. 위 두 파일에서 필요한 문서만 선택적으로 로드한다.

## 2. 파일 작성 위치 (SoT 매핑)

| 종류 | 파일 위치 | 색인 갱신 |
|---|---|---|
| 활성 태스크 | `ai-docs/task/active/${YYMMDD}_${title}.md` | `current.md` 활성 태스크 라인 |
| 완료 태스크 | `ai-docs/task/${YYMMDD}/${file}.md` | `task/archive.md` |
| 트러블슈팅 | `ai-docs/trouble/${YYMMDD}/${YYMMDD}_${title}_troubleshooting.md` | `trouble/index.md` |
| 다영역 협업 후속 TODO | `ai-docs/project_todo.md` 카테고리 섹션에 항목 추가 | `INDEX.md` (이미 색인됨) |
| 체크리스트 항목 변경 | `TEST/checklist/s${N}_*.md` 상태 컬럼 | — |
| 결함 발견 | `TEST/issues.md` 표에 행 추가 | `current.md` 미해결 결함 라인 |
| 진척률 변경 | `TEST/progress.md` 표 갱신 | — |
| 신규 영구 산출물 | 적절한 디렉터리 + `INDEX.md` 색인 | `INDEX.md` |
| 반복 태스크 절차 | `ai-docs/workflow/${name}.md` | `workflow/README.md` + `INDEX.md` |

**중복 금지**: 한 사실은 한 곳에만. 진척률은 `progress.md`만, 현재 상태는 `current.md`만, 산출물 위치는 `INDEX.md`만.

## 3. 컨텍스트 이어받기

큰 작업(섹션 완료, 결함 수정, 구조 변경) 직후 [`context/current.md`](ai-docs/context/current.md)를 갱신한다. 다음 스레드가 `INDEX.md` + `current.md` 두 파일만 읽고 작업을 이어받을 수 있어야 한다.

## 4. 구현 반영

구현 완료된 기능은 다음 위치에 반영한다:
- `/README.md` (사용자 시점)
- `ai-docs/spec/overview.md` (명세 시점)

## 5. 자주 쓰는 명령

```bash
# 프론트 재배포
docker compose --env-file .env up --build -d frontend

# 위키 동기화 (docs/TEST/* 변경 후, saigon_wiki 무중단 재빌드)
./wikidoc_publish.sh
```

## 6. 로컬 전용

`GUIDELINE.md`, `ai-docs/`는 git에 커밋하지 않는다. AI 컨텍스트 유지 전용.

## 7. 보안 / 환경 변수

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
6. **AI 와 대화할 때** — 실제 비밀 값을 프롬프트에 붙여 넣지 않는다. 필요한 경우 `.env.example` 의 키 이름만 공유한다.

위반을 발견하면 즉시 (a) 비밀 회전, (b) git 히스토리 정리(`git filter-repo` 등), (c) 외부 노출 경위 추적 순으로 대응한다.

## 8. 린터

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

## 9. __DEV Context (진행 상태 관리)

프로젝트 진행 상태는 DB(`__DEV_context`, `__DEV_features`, `__DEV_todos`)로 관리하며, 외부 사용자가 위키·어드민에서 실시간 추적한다. 상세 절차는 [`ai-docs/workflow/dev-context-management.md`](ai-docs/workflow/dev-context-management.md).

**핵심 용어**

| 테이블 | 역할 |
|--------|------|
| `__DEV_context` | Key-Value 저장소 + `status` 이모지(🔧진행중/✅완료/⏸대기/❌취소) — `current_focus`, `current_sprint`, `last_deploy`, `blocker`, `next_milestone` |
| `__DEV_features` | 기능 단위 진행 상태 — `PLANNED → IN_PROGRESS → DONE / DEFERRED` |
| `__DEV_todos` | 할일 단위 — `TODO → IN_PROGRESS → DONE / BLOCKED` |

**선 보고 후 진행 (Report First, Fix Later)**

1. 작업 **착수 전** `current_focus`를 진행중 상태로 갱신한다.
2. 코드 수정을 수행한다.
3. 검증 완료 **후** 완료 상태로 갱신하거나 다음 작업으로 교체한다.

IN_PROGRESS와 DONE을 혼동하지 않는다. 구현과 동시에 DONE 처리 금지.

## 10. 컨텐츠 관리 (이미지 / 파일)

**모든 이미지·파일 컨텐츠는 `contents` 테이블로 중개되고 `content_id`(UUID)로 매핑된다.** 관리자·프론트·BFF 모두 예외 없이 적용한다.

**규칙**

1. **DB 는 `content_id` 만 저장한다** — 엔티티 테이블에는 `*_content_id UUID REFERENCES contents(id)` 컬럼을 두고, imgproxy URL·파일 경로를 컬럼에 직접 저장하지 않는다. (예: `feed_posts.image_content_id`, `users.avatar_content_id`, `quests.thumbnail_content_id`, `districts.image_content_id`)
2. **URL 은 출력 시점에 해석한다** — BFF 응답·관리자 렌더 시 `content_id` → `contents.file_path` → `build_imgproxy_url()` 로 변환한다. 해석 로직은 `utils.py` 의 resolver(`resolve_avatar_url()`, `resolve_feed_image_url()` 등)에 모은다.
3. **업로드는 contents row 를 먼저 만든다** — 파일 저장 → `contents` row 생성(`owner_type`/`owner_id`/`file_path`) → 엔티티에 `content_id` 연결 순서. owner_type 은 `system`(관리자 배치) / `user`(유저 업로드) / `mock`(퀘스트·구 폴백 풀) / `profile_mock`(프로필 사진 미설정 시 기본 아바타 풀).
4. **레거시 URL 컬럼은 read-only 폴백** — 기존 `image_url`·`avatar_url`·`hero_image_url` 등은 조회 폴백으로만 사용하고, **신규 쓰기 금지**. resolver 우선순위는 항상 `content_id > 레거시 url > 기본값`.
5. **폴백 체인은 모두 contents 중개분으로 구성** — 예: 퀘스트 썸네일 = `thumbnail_content > district.image_content > mock`. contents 미중개 소스를 체인에 끼우지 않는다.
6. **신규 이미지 필드 추가 시** — `*_content_id` FK 컬럼 + 마이그레이션 → 모델 관계(`relationship`, `lazy="selectin"`) → resolver → 출력 스키마 순으로 일관되게 배선한다.
