# QM 루프 — 화면 릴레이 보드

드라이버가 위에서 아래로 `PENDING` 행을 순회한다. 상태/라운드/판정은 드라이버가 갱신한다.
**사람이 할 일**: 시작 전 화면 목록을 채운다. `BLOCKED` 가 생기면 DECISION 을 읽고 결정한다.

## 상태 범례
- `PENDING` 아직 안 함 · `IN_PROGRESS` 처리 중 · `PASS` 통과(완료)
- `BLOCKED` DECISION_NEEDED 로 정지 — 대표 게이트 대기

## 이번 패스 QM_TASK
프로젝트 규약 준수 점검·수정: 동적 이미지는 `<AppImage>` 래핑(`<img>` 직접 금지) · 네이티브(`navigator.*`)는 `native.ts` 경유 · 상단여백은 `var(--status-bar-height)`(고정 px 금지) · 화면 내 하드코딩 텍스트는 i18n 키(ko/en/vi)로.

## 화면 목록 — 파일럿 5화면 (나머지 43화면은 파일럿 PASS 후 확장)

| # | SCREEN (ID / 경로) | 화면별 메모/범위(선택) | 상태 | 라운드 | 판정/비고 |
|---|---|---|---|---|---|
| 1 | frontend/src/pages/home/WorldMap.tsx | 맵·동적 이미지 다수 | BLOCKED | 1 | CHANGES — 규약 4개는 충족, 그러나 더티 워킹트리(163파일 WIP)가 reviewer 의 git-diff 근거를 오염 |
| 2 | frontend/src/pages/quest/QuestList.tsx | 리스트·카드 이미지·i18n | PENDING | 0 | |
| 3 | frontend/src/pages/shop/ShopCatalog.tsx | 아이템 이미지·가격 i18n | PENDING | 0 | |
| 4 | frontend/src/pages/info/InfoFloodReport.tsx | 네이티브 위치(navigator)·폼 i18n | PENDING | 0 | |
| 5 | frontend/src/pages/settings/Settings.tsx | 텍스트 다수·상단여백 | PENDING | 0 | |

## 진행 로그 (드라이버가 append)

<!-- 형식: [화면] PASS@r2 commit=abc123 — 한줄요약 / 또는 [화면] BLOCKED — 결정필요 내용 -->
[WorldMap] BLOCKED@r1 — 규약 4개(AppImage/native/status-bar/i18n) 전부 충족, 구현자 변경 없음. 그러나 워킹트리에 163개 사전 미커밋 WIP 존재(WorldMap.tsx 포함: QuestCard 리팩토링). reviewer 가 git diff 를 근거로 삼아 무관한 WIP 를 CHANGES 로 잡음. 루프 전제(클린 워킹트리) 위반 → 대표 게이트.
