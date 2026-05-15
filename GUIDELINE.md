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
| 체크리스트 항목 변경 | `TEST/checklist/s${N}_*.md` 상태 컬럼 | — |
| 결함 발견 | `TEST/issues.md` 표에 행 추가 | `current.md` 미해결 결함 라인 |
| 진척률 변경 | `TEST/progress.md` 표 갱신 | — |
| 신규 영구 산출물 | 적절한 디렉터리 + `INDEX.md` 색인 | `INDEX.md` |

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
