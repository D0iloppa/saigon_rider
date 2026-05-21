# 워크플로우 — __DEV Context 현행화

> **대상 테이블**: `__DEV_context`, `__DEV_features`, `__DEV_todos`  
> **관리 경로**: Admin Console `/admin/dev` 또는 API `/api/dev/*`  
> **목적**: 프로젝트 진행 상태를 DB로 관리하여 위키 홈·어드민·AI 컨텍스트에서 실시간 참조할 수 있게 한다.  
> **핵심 원칙**: 작업 시작/완료 시 반드시 갱신한다. md 파일이 아닌 DB가 진행 상태의 SoT(Source of Truth)이다.

---

## ⚠ 선 보고 후 진행 (Report First, Fix Later)

외부 사용자가 `current_focus` 등 Context 값을 통해 실시간으로 진행 상태를 추적한다. 따라서 **IN_PROGRESS(진행중)와 DONE(완료)은 반드시 구분**해야 한다.

### Context status 이모지

`__DEV_context` 테이블의 `status` 컬럼은 이모지로 시각적 상태를 표시한다. 어드민에서 ↻ 버튼으로 순환 가능.

| 이모지 | 의미 | 용도 |
|--------|------|------|
| 🔧 | 진행중 | 작업 착수 시 설정 |
| ✅ | 완료 | 검증 완료 후 전환 |
| ⏸ | 대기/기본 | 초기 상태 또는 보류 |
| ❌ | 취소/실패 | 작업 취소 또는 실패 시 |

### 갱신 순서

| 순서 | 시점 | 조치 |
|------|------|------|
| 1 | 작업 **착수 전** | `current_focus` value 갱신 + status를 🔧로 설정 |
| 2 | 코드 수정 | 실제 구현 수행 |
| 3 | 검증 완료 **후** | status를 ✅로 전환. Feature/Todo 상태도 DONE 전환 |

**절대 금지**: 구현과 동시에 ✅ 처리. 검증 전에는 항상 🔧 상태를 유지한다.

---

## 트리거 시점

| 상황 | 해당 절차 |
|---|---|
| 새 기능 구현을 시작할 때 | [§1 Feature 등록/상태 변경](#1-feature-등록--상태-변경) |
| 구현 완료·보류 시 | [§1 Feature 상태 변경](#1-feature-등록--상태-변경) |
| 후속 할일을 발견했을 때 | [§2 Todo 등록](#2-todo-관리) |
| 할일을 처리하거나 블로커가 해소됐을 때 | [§2 Todo 상태 변경](#2-todo-관리) |
| 스프린트·포커스·마일스톤이 바뀔 때 | [§3 Context 갱신](#3-context-갱신) |
| 정기 점검 시 | [§4 점검 체크리스트](#4-점검-체크리스트) |

---

## 접근 방법

### 어드민 콘솔 (권장 — 빠른 조작)

| 경로 | 기능 |
|---|---|
| `/admin/dev` | 전체 현황 대시보드 + 인라인 추가/삭제 |
| ↻ 버튼 | Feature·Todo 상태 순환 (한 클릭) |

### REST API (자동화·스크립트 연동)

| 엔드포인트 | 메서드 | 용도 |
|---|---|---|
| `/api/dev/summary` | GET | 위키·대시보드용 통합 요약 |
| `/api/dev/context` | GET / PUT / DELETE | Context KV 조회·수정·삭제 |
| `/api/dev/features` | GET / POST / PATCH / DELETE | Feature CRUD |
| `/api/dev/todos` | GET / POST / PATCH / DELETE | Todo CRUD |


### MCP (Claude Code — 자동 갱신)

> **saigon-dev** MCP 서버 (`.claude/settings.json`에 등록됨). 스레드 시작 시 `get_dev_summary`를 호출하면 전체 현황을 한 번에 파악할 수 있다.

| 도구 | 용도 |
|---|---|
| `get_dev_summary()` | Context + Feature/Todo 전체 요약 (스레드 진입 시 첫 호출) |
| `upsert_context(key, value, status)` | Context KV 추가·갱신 (착수: 🔧 / 완료: ✅) |
| `delete_context(key)` | Context KV 삭제 |
| `list_features(category?, status?)` | Feature 목록 조회 |
| `create_feature(category, name, status?)` | Feature 등록 |
| `update_feature(feature_id, status?, ...)` | Feature 상태·속성 갱신 |
| `delete_feature(feature_id)` | Feature 삭제 |
| `list_todos(status?, priority?, feature_id?)` | Todo 목록 조회 |
| `create_todo(title, priority?, feature_id?)` | Todo 등록 |
| `update_todo(todo_id, status?, priority?, ...)` | Todo 상태·속성 갱신 |
| `delete_todo(todo_id)` | Todo 삭제 |

### 직접 SQL (초기 시드·벌크 갱신)

```bash
docker exec -i saigon_db psql -U wellconn -d saigon_rider < database/init/026_dev_context_seed.sql
```

---

## 1. Feature 등록 / 상태 변경

### 신규 Feature 등록

새 기능 그룹을 시작할 때 Feature를 등록한다.

**어드민**: `/admin/dev` → Features 하단 폼 → 카테고리·이름·상태 입력 → 추가

**API**:
```bash
curl -X POST /api/dev/features \
  -H 'Content-Type: application/json' \
  -d '{"category": "ride", "name": "GPS 위치 추적 & HUD", "status": "PLANNED"}'
```

**카테고리 규칙**:

| 카테고리 | 범위 |
|---|---|
| `auth` | 온보딩·인증·프로필 초기설정 |
| `home` | 월드맵·홈 화면 |
| `quest` | 퀘스트 목록·상세·수락 |
| `ride` | 라이딩 HUD·결과·GPS |
| `feed` | 피드·좋아요·댓글·DM |
| `profile` | 프로필·팔로우·배지·QR |
| `settings` | 설정·알림·언어·계정 |
| `infra` | Docker·Nginx·DB·위키·어드민 |

필요 시 카테고리를 추가할 수 있으나, 기존 카테고리와 중복되지 않도록 한다.

### 상태 전이

```
PLANNED → IN_PROGRESS → DONE
                ↓
            DEFERRED
```

| 상태 | 의미 | 전환 시점 |
|---|---|---|
| `PLANNED` | 명세에 정의됨, 미착수 | 초기 등록 시 |
| `IN_PROGRESS` | 구현 진행 중 | 활성 태스크 생성 시 |
| `DONE` | 구현 완료 + 기본 동작 확인 | 코드 머지 후 |
| `DEFERRED` | 의도적 보류 | 우선순위 밀림·외부 의존 시 |

**어드민에서**: ↻ 버튼 클릭으로 순환 (PLANNED → IN_PROGRESS → DONE → DEFERRED → PLANNED)

**API에서**:
```bash
curl -X PATCH /api/dev/features/{id} \
  -H 'Content-Type: application/json' \
  -d '{"status": "DONE"}'
```

---

## 2. Todo 관리

### 신규 Todo 등록

**어드민**: `/admin/dev` → Todos 하단 폼 → 제목·우선순위·연결 Feature 입력 → 추가

**API**:
```bash
curl -X POST /api/dev/todos \
  -H 'Content-Type: application/json' \
  -d '{"title": "AUTH: 닉네임 중복확인 API 연결", "priority": "HIGH", "feature_id": 4}'
```

### 우선순위

| 값 | 기준 |
|---|---|
| `URGENT` | 다른 작업 차단 중, 즉시 해결 필요 |
| `HIGH` | 현 스프린트 내 반드시 처리 |
| `MEDIUM` | 다음 스프린트에 처리해도 무방 |
| `LOW` | 여유 있을 때 개선 |

### 상태 전이

```
TODO → IN_PROGRESS → DONE
           ↓
        BLOCKED
```

| 상태 | 의미 |
|---|---|
| `TODO` | 미착수 |
| `IN_PROGRESS` | 작업 중 |
| `DONE` | 완료 |
| `BLOCKED` | 외부 요인으로 진행 불가 (사유를 description에 기재) |

### Todo → Feature 연결

Todo 등록 시 관련 Feature를 `feature_id`로 연결하면:
- 어드민·위키에서 Feature 단위로 Todo를 묶어 볼 수 있다
- Feature 삭제 시 연결된 Todo의 `feature_id`는 자동 NULL 처리 (Todo는 유지)

---

## 3. Context 갱신

Context는 key-value 저장소로, **현재 상태를 한 줄로 요약**하는 용도이다.

### 표준 키

| Key | 갱신 시점 | 예시 값 |
|---|---|---|
| `current_sprint` | 스프린트 변경 시 | `소셜 확장 + 프로필 피드 관리` |
| `current_focus` | 주 작업 방향이 바뀔 때 | `피드 CRUD · DM · 팔로우 시스템` |
| `last_deploy` | 배포 후 | `2026-05-17` |
| `blocker` | 블로커 발생/해소 시 | `AUTH 플로우 실 연동 미완` |
| `next_milestone` | 다음 목표 설정 시 | `Ride HUD 실기기 GPS 연동` |

**어드민**: `/admin/dev` → Context 하단 폼 → Key/Value 입력 → 추가/갱신 (같은 Key면 덮어씀)

**API**:
```bash
curl -X PUT /api/dev/context \
  -H 'Content-Type: application/json' \
  -d '{"key": "current_sprint", "value": "Ride HUD + 안전등급"}'
```

### 커스텀 키

표준 키 외에 자유롭게 추가할 수 있다. 단, 위키 CLI 디스플레이에 표준 5개 키만 표시되므로, 추가 키는 어드민·API에서만 조회된다.

---

## 4. 점검 체크리스트

다음 시점에 `/admin/dev` 를 열어 확인한다:
- 활성 태스크를 완료했을 때
- 스프린트 전환 시
- 주간 점검 시

| 점검 항목 | 조치 |
|---|---|
| `IN_PROGRESS` Feature 중 실제 작업이 안 되고 있는 건 없는가 | `PLANNED` 또는 `DEFERRED`로 변경 |
| `DONE` Feature에 남아있는 미완료 Todo가 있는가 | Todo 상태 갱신 또는 신규 Feature로 분리 |
| `BLOCKED` Todo의 차단 사유가 해소됐는가 | `TODO`로 환원 |
| `blocker` Context가 여전히 유효한가 | 해소 시 삭제 또는 값 갱신 |
| `current_sprint`·`current_focus`가 실제 작업과 일치하는가 | 불일치 시 갱신 |
| 완료된 Todo가 쌓여있는가 | 주기적으로 DONE 항목 삭제 (이력은 git에 남음) |

---

## 5. 위키 연동

위키 홈(`/wiki/`)의 CLI 프로그레스 디스플레이는 `/api/dev/summary`를 실시간 fetch한다.

- DB 갱신 즉시 위키에 반영 (위키 재빌드 불필요)
- `saigon status --detail` 클릭 시 `/api/dev/features`, `/api/dev/todos`를 추가 fetch
- API 서버 미기동 시 프로그레스 영역이 자동 숨김 (graceful degradation)

### 위키에 표시되는 항목

| 영역 | 데이터 소스 |
|---|---|
| sprint / focus / deploy / blocker / next | `__DEV_context` 테이블의 표준 5개 키 |
| features 진행바 | `__DEV_features` 테이블의 status별 count |
| todos 진행바 | `__DEV_todos` 테이블의 status별 count |
| 상세 체크리스트 | `__DEV_features` (카테고리별) + `__DEV_todos` (미완료분) |

---

## 6. 다른 워크플로우와의 관계

| 상황 | __DEV Context 조치 | 기존 워크플로우 조치 |
|---|---|---|
| 활성 태스크 생성 | 해당 Feature → `IN_PROGRESS` | `project-todo-management.md` §2 수행 |
| 활성 태스크 완료 | Feature → `DONE`, 관련 Todo → `DONE` | `project-todo-management.md` §3 수행 |
| 새 후속 작업 발견 | Todo 등록 | `project_todo.md`에 ⬜ 항목 등록 (다영역인 경우) |
| 위키 내용 변경 | 해당 사항 없음 (자동 반영) | `wiki-update.md` 절차 수행 (위키 파일 직접 수정분만) |
| 스프린트 전환 | Context 5개 키 전부 갱신 | `context/current.md` 갱신 |

---

## 7. SQL 직접 갱신 (벌크)

대량 변경이 필요한 경우 SQL로 처리한다.

```sql
-- Feature 일괄 상태 변경 (카테고리 단위)
UPDATE "__DEV_features" SET status = 'DONE', updated_at = NOW()
WHERE category = 'feed' AND status = 'IN_PROGRESS';

-- 완료 Todo 일괄 삭제
DELETE FROM "__DEV_todos" WHERE status = 'DONE';

-- Context 갱신
INSERT INTO "__DEV_context" (key, value) VALUES ('current_sprint', '새 스프린트명')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

```bash
docker exec -i saigon_db psql -U wellconn -d saigon_rider -c "위 SQL"
```
