# 태스크: TabBar / 스크롤 레이아웃 수정 (260515 세션2)

> **생성**: 2026-05-15 | **상태**: 진행 중

---

## 배경

이전 세션에서 TabBar 활성 인디케이터 `top: -8px → 0` 수정이 Docker 캐시 문제로 빌드에 미반영된 채로 종료됨. 이번 세션에서 이어서 수정 + iOS 추가 이슈 처리.

---

## 작업 목록

### ✅ 1. Docker 캐시 문제 해소

- **증상**: `docker compose up --build` 시 `COPY . .` 스텝이 CACHED 처리되어 CSS 변경이 이미지에 미반영
- **조치**: `--no-cache` 플래그로 강제 전체 재빌드
- **근본원인**: Windows/WSL 경계에서 Docker 파일시스템 변경 감지 실패

### ✅ 2. TabBar 인디케이터 — iOS에서 경계면 이탈 문제

- **증상**: `top: 0` 적용 후 PC(Chrome DevTools)에서는 정상이지만 iOS에서는 인디케이터가 여전히 nav bar 상단 border 위로 이탈
- **원인**: `.tab`이 `align-items: center`로 tabbar 중앙에 위치 → `::before top:0`이 실제 border보다 ~15px 아래에 위치하지 않고 렌더링 차이 발생
- **수정** (`TabBar.module.css`):
  ```css
  /* tabbar padding-top 제거 */
  .tabbar { padding: 0 4px calc(8px + var(--bottom-safe)); }

  /* 탭이 tabbar 상단까지 채워지도록 stretch */
  .tab { align-self: stretch; }

  /* ::before top: 0 = tab 상단 = tabbar border에 밀착 */
  ```

### ✅ 3. TabBar 아이콘 — iOS에서 위로 쏠림 문제

- **증상**: `align-self: stretch` 적용 후 iOS(홈 인디케이터 ~34px)에서 content area가 42px로 줄어 아이콘+텍스트(54px)가 넘쳐 위로 쏠림
- **원인**: tabbar height 84px 고정 + padding-bottom `8+34=42px` → content 42px < 아이콘 54px
- **수정** (`TabBar.module.css`):
  ```css
  [data-platform="ios"] .tabbar {
    height: calc(var(--tabbar-height) + var(--bottom-safe)); /* 84+34=118px */
    padding-bottom: var(--bottom-safe); /* extra 8px 제거 */
  }
  /* content area = 118 - 0 - 34 = 84px → web과 동일, 아이콘 중앙 정렬 */
  ```

### ✅ 4. TabBar 하단 — iOS 과도한 여백 문제

- **증상**: iOS nav bar 하단에 디자인상 어색한 큰 여백 존재
- **원인**: padding-bottom = `8px + 34px = 42px` (홈 인디케이터 34px + 불필요한 8px 추가)
- **수정**: iOS override에서 `padding-bottom: var(--bottom-safe)` (8px 제거) — 위 항목 3에서 함께 처리

### ✅ 5. Feed / Profile — top 영역이 body와 함께 스크롤되는 문제

- **증상**: 피드, 프로필에서 TopBar/header가 콘텐츠와 함께 스크롤됨
- **원인**: `AppShell.viewport`(overflow-y: auto)가 전체 scroll container → `position: sticky`가 iOS WebView에서 불안정
- **수정 방향**: 각 페이지가 자체 scroll container를 갖는 구조로 변경 (`position: sticky` 의존 제거)

  **Feed** (`FeedList.tsx` / `FeedList.module.css`):
  ```
  <div.page>          ← height:100%, flex column, overflow:hidden
    <TopBar />        ← 고정 (flex-shrink:0)
    <div.scrollBody>  ← flex:1, overflow-y:auto (실제 스크롤)
      <div.body>      ← 기존 콘텐츠
  ```

  **Profile** (`ProfileMain.module.css`):
  ```css
  .root { height: 100%; display: flex; flex-direction: column; }
  .sheet { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  ```

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `frontend/src/components/layout/TabBar.module.css` | padding-top 제거, align-self stretch, iOS height/padding override |
| `frontend/src/pages/feed/FeedList.tsx` | `.page` + `.scrollBody` 구조 추가 |
| `frontend/src/pages/feed/FeedList.module.css` | `.page`, `.scrollBody` 클래스 추가 |
| `frontend/src/pages/profile/ProfileMain.module.css` | `.root` flex column, `.sheet` overflow-y: auto |

---

## 미결 / 확인 필요

- [ ] iOS 실기기에서 Feed 스크롤 및 TopBar 고정 확인
- [ ] iOS 실기기에서 Profile header 고정 + sheet 스크롤 확인
- [ ] iOS nav bar 아이콘 중앙 정렬 확인
- [ ] iOS nav bar 하단 여백 감소 확인
