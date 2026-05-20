# 프론트엔드 구조 및 패턴

> 파일 위치: `frontend/src/`  
> 기술 스택: React 18 + TypeScript + Vite, CSS Modules, Zustand, react-router-dom, react-i18next

---

## 0. 빌드 및 배포

프론트엔드는 **Docker 멀티스테이지 빌드**로 서빙된다 (`frontend/Dockerfile`).  
`npm install` + `npm run build` (tsc + vite build) 가 컨테이너 내부에서 실행되며, 결과물이 nginx로 서빙된다.

> **소스 변경 후 반드시 이미지 재빌드해야 반영됨.** 로컬 빌드 불필요.

```bash
# 재빌드 + 재시작 (주로 이 명령 사용)
docker compose up -d --build frontend

# 빌드만 먼저 하고 싶을 때
docker compose build frontend
docker compose up -d frontend
```

로컬에서 `node_modules`를 직접 건드리거나 `npm install` 하면 안 됨 — Docker 이미지 내부에서 관리됨.

---

## 1. 네이티브 기능 추상화 (Capacitor 기반)

> **구현 파일**: `src/lib/native.ts`  
> **의존성**: `@capacitor/core`, `@capacitor/geolocation`

앱은 Android / iOS WebView 위에서 동작한다. 네이티브 기능은 `NativeInterface` 싱글턴(`native`)을 통해 호출한다. 내부적으로 Capacitor 플러그인을 래핑하며, `client.ts`가 fetch를 래핑하는 것과 동일한 패턴이다.

### 1.1 현재 상태

- **웹만 전환 완료** — 네이티브 앱은 기존 WebView 유지
- Capacitor 플러그인은 브라우저 fallback으로 동작 (`Capacitor.isNativePlatform()` = false)
- 활성 플러그인: `@capacitor/geolocation`만 설치. 나머지는 사용 시점에 추가

### 1.2 API 사용법

```ts
import { native } from '@/lib/native';

// GPS 위치 1회 조회 (타입 안전)
const pos = await native.getLocation();
// pos: { lat: number, lng: number, accuracy?: number }

// 실시간 위치 스트리밍
const unsub = native.watchLocation((pos) => {
  console.log(pos.lat, pos.lng);
});
unsub(); // unmount 시 해제

// 플랫폼 감지
native.platform;  // 'ios' | 'android' | 'web'
native.isNative;  // boolean
```

### 1.3 지원 메서드

| 메서드 | Capacitor 플러그인 | 상태 |
|---|---|---|
| `getLocation()` | `@capacitor/geolocation` | ✅ 활성 |
| `watchLocation(handler)` | `@capacitor/geolocation` | ✅ 활성 |
| `openCamera()` | `@capacitor/camera` | stub (미설치) |
| `getDeviceInfo()` | `@capacitor/device` | stub (미설치) |
| `share(options)` | `@capacitor/share` | Web Share API fallback |
| `haptic(style?)` | `@capacitor/haptics` | stub (미설치) |
| `onAppStateChange(handler)` | `@capacitor/app` | stub (미설치) |
| `onDeepLink(handler)` | `@capacitor/app` | stub (미설치) |

### 1.4 브라우저(Dev) 환경 동작

Capacitor 내장 웹 구현 활용:
- `getLocation()` → 브라우저 `navigator.geolocation.getCurrentPosition()` 호출 (실제 좌표 반환)
- `share()` → `navigator.share()` API (지원 브라우저에서 동작)
- stub 메서드 → console.warn 또는 noop

### 1.5 플러그인 추가 절차

새 네이티브 기능이 필요할 때:
1. `npm install @capacitor/{plugin}` (frontend 디렉토리)
2. `native.ts`의 해당 stub 메서드를 실제 구현으로 교체
3. 사용처에서 `native.methodName()` 호출

---

## 2. 플랫폼 분기 CSS 아키텍처 (iOS vs Android)

> **핵심 차이**: iOS WebView는 **전체화면(상태바 포함)**을 뷰포트로 사용한다.  
> Android WebView는 **상태바 아래 영역**만 뷰포트로 사용한다.  
> 따라서 상단 여백(status bar height)을 플랫폼별로 다르게 처리해야 한다.

### 2.0 동작 원리

`index.html` 인라인 스크립트가 React 렌더링 전에 실행되어 `<html>` 요소에 `data-platform` 속성을 주입한다.

```
iOS     → data-platform="ios"
Android → data-platform="android"
브라우저/dev → data-platform="web"
```

네이티브 셸에서 플랫폼을 명시적으로 지정해야 하는 경우:
```js
// 네이티브 → 웹 (WebView에서 호출)
window.setPlatform('ios');      // 또는 'android'
```

### 2.1 CSS 변수 — `--status-bar-height`

`src/styles/tokens.css`에 정의된 플랫폼별 변수:

| 플랫폼 | `--status-bar-height` 값 | 이유 |
|--------|--------------------------|------|
| `ios` | `env(safe-area-inset-top, 44px)` | 기기마다 다른 실제 높이 사용 |
| `android` | `0px` | WebView가 이미 상태바 아래에서 시작 |
| `web` (기본) | `44px` | 데스크탑 dev 미리보기용 고정값 |

**사용 방법**: 고정 픽셀값 대신 반드시 이 변수를 사용한다.
```css
/* ✅ 올바른 방법 */
height: var(--status-bar-height);
padding-top: var(--status-bar-height);

/* ❌ 금지 — 플랫폼 차이를 무시함 */
height: 44px;
padding-top: 50px;
```

### 2.2 StatusBar 컴포넌트

`<StatusBar>` 컴포넌트는 내부적으로 `height: var(--status-bar-height)`를 사용한다.  
플랫폼별 높이 분기를 직접 처리하므로, 페이지/레이아웃에서는 `<StatusBar>`를 배치하기만 하면 된다.  
**StatusBar 위쪽에 추가 padding/margin을 넣지 말 것.** (→ 이중 여백 발생)

### 2.3 플랫폼별 스타일을 직접 분기해야 하는 경우

`--status-bar-height` 변수 외에 플랫폼별 추가 분기가 필요하다면 CSS 속성 선택자를 사용한다:

```css
/* iOS 전용 */
[data-platform="ios"] .someComponent {
  /* ... */
}

/* Android 전용 */
[data-platform="android"] .someComponent {
  /* ... */
}
```

> **신규 페이지·레이아웃 추가 시 체크리스트**
> - [ ] 헤더 `padding-top: 0` 유지
> - [ ] 헤더 최상단 첫 자식으로 `<StatusBar>` 배치 (`TopBar` 사용 시 불필요)
> - [ ] 고정 px 값으로 상단 여백을 직접 지정하지 않기
> - [ ] `--status-bar-height` 변수 또는 `<StatusBar>` 컴포넌트를 통해 처리

---

## 3. 공통 UI 컴포넌트

> 위치: `src/components/ui/`

### 3.0 이미지 로딩 (AppImage) — 최우선 규칙

**모든 동적 이미지는 반드시 `<AppImage>` 컴포넌트를 통해 처리한다.**

사용자가 이미지 로딩 중 빈 화면을 보지 않도록 shimmer skeleton을 표시합니다.

```tsx
import { AppImage } from '@/components/ui/AppImage';

// 직사각형 이미지 (피드, 퀘스트 썸네일 등)
<AppImage src={imageUrl} alt="설명" />

// 원형 이미지 (아바타)
<AppImage src={avatarUrl} alt="유저명" variant="circle" />
```

**적용 대상**
- 서버에서 받아오는 모든 이미지 (아바타, 게시물, 썸네일, DM 이미지 등)
- `PhotoCard`, `StoryAvatar` 등 재사용 컴포넌트도 내부적으로 `AppImage` 사용

**제외 사항**
- 로컬 blob URL 미리보기 (이미 메모리에 있음)
- 작은 emoji 아이콘 (onError fallback 필요)
- 이미 표시된 이미지를 확대하는 lightbox

**신규 페이지/컴포넌트 추가 시 체크리스트**
- [ ] 이미지 표시 부분에서 `<img>` 직접 사용 금지
- [ ] 동적 이미지는 모두 `<AppImage>` 래핑
- [ ] 아바타는 `variant="circle"` 옵션 추가
- [ ] 기타 이미지는 기본값(rect) 사용

---

### 3.1 모바일 상태바(Status Bar) 여백 확보 규칙

신규 페이지 또는 레이아웃을 추가할 때, 화면 최상단에는 모바일의 상태바 영역(좌측 시간, 우측 배터리 등)을 고려한 자체적인 여백이 필요하다.

**적용 방법**

헤더 컨테이너 CSS의 `padding-top`은 **반드시 0**으로 두고, 자식 첫 요소로 `<StatusBar>` 컴포넌트를 배치한다.  
`padding-top`에 임의 값을 넣으면 StatusBar 위에 이중 여백이 생기므로 금지.

```css
/* ✅ 올바른 패턴 */
.header {
  padding: 0 20px 20px;   /* top은 0 */
}
```

```tsx
/* ✅ 올바른 패턴 */
<div className={styles.header}>
  <StatusBar variant="light" />   {/* 최상단 첫 자식 */}
  {/* 나머지 헤더 콘텐츠 */}
</div>
```

```css
/* ❌ 금지 — StatusBar 위에 이중 여백 발생 */
.header {
  padding: 32px 20px 20px;
}
```

- `TopBar` 컴포넌트를 사용하는 레이아웃(예: `FeedList`)은 `TopBar` 내부에 이미 `StatusBar` 처리가 포함되어 있으므로 추가 작업이 필요 없다.
- `StatusBar` 높이는 50px 고정 (`src/components/layout/StatusBar.module.css`).

| 컴포넌트 | 용도 |
|----------|------|
| `Toast` (`Toast.ts`) | sonner 래퍼 — `toast.success/error/info/warning(msg)` 비차단 알림 |
| `AlertDialog` | 단순 정보 표시 모달 (제목 + 텍스트/pre + 확인 버튼) |
| `ConfirmDialog` | 확인/취소 선택 모달 (Zustand store 기반 전역 호출) |
| `Dialog` | 명령형 다이얼로그 시스템 (`dialogTypes.ts`와 함께 사용) |
| `BottomSheet` | 하단 슬라이드 패널 |
| `Button` | 기본 버튼 (variant: primary / secondary / glass / danger) |
| `ProgressBar` | track + fill 그라디언트 바 |
| `Toggle` | on/off 슬라이드 토글 |
| `Chip` | 인라인 태그 (glass / brand / surface 등 variant) |
| `MapPin` | 지도 위 절대위치 핀 |
| `StoryAvatar` | 그라디언트 테두리 원형 아바타 |
| `LevelBadge` | "LV.N" 인라인 뱃지 |
| `SettingsRow` | 아이콘 + 라벨 + 우측 액션 행 |
| `PhotoCard` | 이미지 카드 (필터 + shine 레이어) |
| `CardBase` | 범용 스타일 카드 컨테이너 |
| `CurrencyHUD` | 통화(GP/GC) 잔액 헤더 표시 |
| `ImageCarousel` | 스와이프 가능 이미지 캐러셀 |
| `RadioCircle` | 라디오 버튼 원형 인디케이터 |
| `RarityCard` | 등급 테마 카드 스타일링 |
| `RewardIcon` | 보상 아이콘 컴포넌트 |

### 게임 컴포넌트 (`components/game/`)

> 게이미피케이션 v2에서 추가된 RPG 경제 시스템 UI 컴포넌트.

| 컴포넌트 | 용도 |
|----------|------|
| `PityBar` | 천장(pity) 진행 바 (current/ceiling/dark 프롭) |
| `ConfettiLayer` | SVG 축하 파티클 오버레이 (라이딩 결과·가챠 보상) |
| `RarityChip` | 등급 배지 (C/R/E/L/M, count 옵션) |
| `CurrencyBadge` | 단일 통화 배지 (GP/GC/SXP, light/dark surface) |
| `GachaCardBack` | 가챠 카드 뒷면 (flip 애니메이션, `gacha-card-flip` keyframe) |
| `GameHubSheet` | 게임 허브 바텀시트 런처 (TabBar FAB에서 열림, 5개 진입점) |

### AlertDialog Props

```ts
interface AlertDialogProps {
  open: boolean;
  title?: string;
  message?: string;  // 일반 텍스트 (body 스타일)
  pre?: string;      // monospace pre 포맷 (코드/JSON 등)
  onClose: () => void;
}
```

### ProfileCard BottomSheet

> 위치: `src/components/ProfileCard.tsx`

타유저 프로필을 BottomSheet로 표시하는 컴포넌트. FeedList에서 게시자의 아바타/닉네임 클릭 시 열림.

```tsx
import { ProfileCard } from '@/components/ProfileCard';

<ProfileCard userId={selectedUserId} open={!!selectedUserId} onClose={() => setSelectedUserId(null)} />
```

내부 구성: 아바타 + 닉네임 + LevelBadge + riderStyle Chip + 팔로워/팔로잉 카운트 + 팔로우/언팔로우 Button.
API: `fetchUserProfile(userId, requesterId?)` → `GET /users/{userId}/profile` (snake→camel 매핑).

---

## 4. 프로필 페이지 레이아웃 (Draggable Sheet 패턴)

> 위치: `src/pages/profile/ProfileMain.tsx`

프로필 페이지는 3개 고정 레이어 + 드래그 가능 시트로 구성된다.

### 4.1 레이어 구조

```
[bgFixed]       — position: fixed; inset: 0; background: var(--grad-sunset); z-index: 0
[fixedHeader]   — Section 1: 아바타 ~ 레벨바 (position: fixed; top: 0; z-index: 1)
[socialSection] — Section 2: 팔로워/팔로잉 + 프로필공유/친구추가 버튼 (position: fixed; z-index: 1)
[sheet]         — Section 3: 드래그 가능 바텀시트 (position: fixed; z-index: 3; border-radius: 32px 32px 0 0)
```

- 배경 그라데이션은 단일 `bgFixed` 요소 하나로 전체 화면을 커버 (레이어별 개별 배경 금지).
- Section 1은 항상 고정. Section 3는 Section 2 위로 올라올 수 있지만 Section 1은 절대 덮지 않음.

### 4.2 스냅 포인트 & 터치 제스처

```
snapMin = fixedHeader 높이 (Section 1 바로 아래까지 시트가 올라갈 수 있는 최상단)
snapMax = socialSection 하단 (Section 2 아래, 시트의 기본 위치)
```

- `ResizeObserver`로 Section 1/2 높이를 동적 계산하여 스냅 포인트 결정.
- 터치 릴리즈 시 가장 가까운 스냅 포인트로 `transition: top .3s cubic-bezier(.2,.8,.2,1)` 애니메이션.

### 4.3 스크롤 위임 (핵심)

시트 내부 콘텐츠 스크롤은 시트가 **snapMin(최상단)에 도달한 경우에만** 활성화.

```tsx
style={{
  top: sheetTop,
  transition: dragging.current ? 'none' : 'top .3s cubic-bezier(.2,.8,.2,1)',
  overflowY: sheetTop <= snapMin.current ? 'auto' : 'hidden',
}}
```

- `overflowY: hidden` — 시트 이동 중에는 내부 스크롤 불가 (동시 드래그+스크롤 방지).
- `overflowY: auto` — snapMin 도달 후에야 내부 콘텐츠가 스크롤됨.
- snapMin 상태에서 내부 scrollTop=0이고 아래로 스와이프 → 시트 다시 드래그 가능.

### 4.4 프로필 액션 버튼 (Instagram 스타일)

Section 2 하단에 배치:
- **"프로필 공유"** 텍스트 버튼 (`flex: 1`, glass 스타일) → QR카드 BottomSheet 오픈
- **친구추가 아이콘** (SVG user-plus, 34×34px) → `/friends/add` 이동

### 4.5 소셜 영역 단순화

기존 3분할(Follower/Following/Friend) → **2분할(Follower/Following)** 로 변경.
"친구 = 상호 팔로우"이므로 별도 카운트 불필요.
