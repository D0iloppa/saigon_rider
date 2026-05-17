# 무한스크롤 도입 — 피드 & 퀘스트 리스트

> **목표**: 피드/퀘스트 목록을 한 번에 전체 로딩하는 방식에서 커서/오프셋 기반 무한스크롤로 전환하여 초기 로딩 속도 및 대량 데이터 대응력을 확보한다.

## 완료 상태: 🟡 코드 완료 / 후속 태스크 있음 (2026-05-16)

- TypeScript 빌드 통과, Vite 프로덕션 빌드 성공
- **재빌드 필요**: `docker compose --env-file .env up --build -d frontend`
- 브라우저 UI 검증 후 완료 처리

## 후속 구현 (다음 세션)

### A. 퀘스트 완료 구조 개선 (백엔드 필터링)
**문제**: 무한스크롤 + 클라이언트 완료 필터링 → total 불일치 → 페이지네이션 오동작  
**해결**: 백엔드에서 완료 퀘스트 제외 후 반환

1. `quests.py` — `user_id` + `exclude_completed=true` 파라미터 추가
   - `UserQuest` NOT IN 서브쿼리로 완료 퀘스트 제외
   - total도 미완료 기준으로 집계
2. `quests.ts` — `fetchQuests`에 `userId`, `excludeCompleted` 옵션 추가
3. `QuestList.tsx` — completedIds 별도 fetch 제거, `useInfiniteScroll` fetchPage에 `excludeCompleted: true, userId` 전달
   - 완료 섹션: "N개 완료" 배지만 (completedIds.size 표시), 카드 목록 제거

### B. Pull-to-Refresh
`usePullToRefresh(containerRef, onRefresh, options?)` 훅:
- touchstart: scrollTop === 0 일 때만 감지
- touchmove: deltaY > 0 → 인디케이터 translate (max 80px)
- touchend: deltaY > 60px → onRefresh() 호출
- `refreshing` 상태 → 스피너 표시
- CSS: `position: absolute; top: -48px` → 당기면 translateY로 내려옴

연결:
- `FeedList`: `reset()` → onRefresh
- `QuestList`: `reset()` + completedIds 재fetch → onRefresh

## 구현 요약

### Phase 1: 공용 인프라 ✅

- [x] `useInfiniteScroll<T>` 커스텀 훅 (`hooks/useInfiniteScroll.ts`)
  - `fetchFn(page) → PageResult<T>` 인터페이스
  - IntersectionObserver + sentinel ref 기반 자동 트리거
  - `loadingRef` 가드로 중복 요청 방지
  - `deps` 변경 시 자동 reset → 첫 페이지 재로딩
- [x] `<ScrollSentinel>` 컴포넌트 (`components/ui/ScrollSentinel.tsx`)
  - 로딩 스피너 (CSS-only) / 끝 표시 바

### Phase 2: 피드 무한스크롤 ✅

- [x] `feed.ts`: `fetchFeed` 반환 `FeedPage { items, total, page, size }`, Mock slice 지원
- [x] `FeedList.tsx`: `useInfiniteScroll` 적용, 필터 변경 시 자동 리셋, cheer 로컬 업데이트 유지

### Phase 3: 퀘스트 백엔드 ✅

- [x] `quests.py` GET `/quests`: `Page[QuestOut]` 반환, `page`/`size` 쿼리 파라미터, COUNT 쿼리

### Phase 4: 퀘스트 무한스크롤 ✅

- [x] `quests.ts`: `fetchQuests` 반환 `QuestPage { items, total, page, size }`, Mock slice 지원
- [x] `QuestList.tsx`: `useInfiniteScroll` 적용, 탭·필터 변경 시 자동 리셋, completedIds 분리 fetch

### Phase 5: 검증 ✅ (빌드) / 🟡 (UI)

- [x] TypeScript `tsc --noEmit` 통과
- [x] Vite 프로덕션 빌드 성공
- [ ] 브라우저 UI 검증 (Mock 모드 무한스크롤, 필터 리셋, 빈 목록 등)

## 변경 파일

| 파일 | 변경 |
|---|---|
| `frontend/src/hooks/useInfiniteScroll.ts` | **신규** — 공용 무한스크롤 훅 |
| `frontend/src/components/ui/ScrollSentinel.tsx` | **신규** — sentinel + 스피너 컴포넌트 |
| `frontend/src/components/ui/ScrollSentinel.module.css` | **신규** — 스피너 스타일 |
| `frontend/src/api/feed.ts` | `fetchFeed` → `FeedPage` 반환, page/size 파라미터 |
| `frontend/src/api/quests.ts` | `fetchQuests` → `QuestPage` 반환, page/size 파라미터 |
| `frontend/src/pages/feed/FeedList.tsx` | `useInfiniteScroll` 적용 |
| `frontend/src/pages/quest/QuestList.tsx` | `useInfiniteScroll` 적용 |
| `backend/app/routers/quests.py` | `list[QuestOut]` → `Page[QuestOut]`, page/size/count |
