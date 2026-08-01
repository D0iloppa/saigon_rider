---
sidebar_position: 2
title: Frontend (BFE)
---

# Frontend — React + Vite

## 기술 스택

| 라이브러리 | 역할 |
|---|---|
| React 18 | UI 렌더링 |
| Vite | 번들러 / 프로덕션 빌드 |
| TypeScript | 타입 안전성 |
| Zustand | 전역 상태 관리 |
| React Router DOM | 클라이언트 라우팅 |
| i18next | 다국어 (ko / vi / en) |
| Sonner | Toast 알림 |
| CSS Modules | 컴포넌트 스코프 스타일링 |

:::info WebView 하이브리드 앱
React SPA를 iOS / Android **WebView** 위에서 서빙합니다.  
네이티브 기능(GPS, 카메라 등)은 커스텀 `NativeInterface` 브릿지를 통해 호출합니다.
:::

## 접속

| 환경 | URL |
|---|---|
| Nginx 경유 (프로덕션 빌드) | http://localhost:18090 |

## 빌드 & 배포

```bash
# 전체 재빌드 (프로덕션)
docker compose up -d --build frontend

# 로그 확인
docker compose logs -f frontend
```

## 주요 디렉토리

```
frontend/src/
├── api/          # fetch 래퍼 (auth, feed, quests, profile, follows, dm, gacha, shop, inventory, wallet, season, master, appVersion, client, types)
├── components/
│   ├── game/     # 게임 UI (PityBar, ConfettiLayer, RarityChip, CurrencyBadge, GachaCardBack, GameHubSheet)
│   ├── layout/   # AppShell, TabBar, TopBar, StatusBar
│   └── ui/       # 공통 컴포넌트 (Button, Chip, BottomSheet, AlertDialog, ScrollSentinel, PullIndicator, CurrencyHUD, ImageCarousel, CardBase, Dialog, RadioCircle, RarityCard, RewardIcon 등)
├── data/         # 더미 데이터 (feed, quests, countryCodes)
├── hooks/        # 커스텀 훅 (useInfiniteScroll, usePullToRefresh)
├── lib/
│   ├── format.ts     # 숫자/날짜 포맷
│   ├── i18n.ts       # i18next 설정
│   ├── native.ts     # NativeInterface — WebView ↔ Native 브릿지
│   ├── rewards.ts    # 보상 계산 유틸
│   └── session.ts    # 쿠키 세션 관리
├── pages/
│   ├── auth/     # PhoneInput, OtpInput, ProfileSetup, Splash
│   ├── dm/       # DmList, DmDetail (DM 목록·채팅)
│   ├── feed/     # FeedList, FeedCreate, FeedEdit
│   ├── home/     # WorldMap
│   ├── profile/  # ProfileMain, FollowerList, FollowingList, FriendList, FriendAdd
│   ├── quest/    # QuestList, QuestDetail
│   ├── ride/     # RideActive, RideResult
│   ├── gacha/    # GachaMain, GachaPull
│   ├── shop/     # ShopCatalog, ItemDetail
│   ├── inventory/ # Inventory, EquipPreview
│   ├── season/   # SeasonPass
│   ├── garage/   # Garage
│   └── settings/ # Settings, NotiSettings, LangSettings, AccountSettings, ProfileEdit
├── store/        # Zustand stores (user, ride, dialog, confirm, dm)
└── styles/       # tokens.css, globals.css
```

## API 클라이언트

`src/api/client.ts` 에서 BFF / SRE Engine 을 단일 인터페이스로 호출합니다.

```typescript
import { api } from './client';

// BFF 호출 (service 생략 시 기본값 'bff')
api.realFetch<Quest[]>('/quests');

// SRE Engine 명시적 지정
api.realFetch<BalanceDto>(`/users/${userId}/balance`, {}, 'sre');

// FormData 업로드
api.realFetchForm<AvatarResult>('/profile/avatar', formData);
```

| service | 요청 경로 | Nginx 라우팅 |
|---|---|---|
| `'bff'` (기본값) | `/api/bff/{endpoint}` | → `bff:8080/api/{endpoint}` |
| `'sre'` | `/api/sre/{endpoint}` | → `engine:8090/v1/{endpoint}` |

## Toast / 알림 시스템

> Toast 와 AlertDialog/ConfirmDialog 는 다른 컴포넌트입니다.  
> - **Toast** — 화면 상단에 잠깐 노출되는 비차단형 알림 (성공/실패/정보)  
> - **AlertDialog** — 사용자가 확인 버튼을 눌러야 닫히는 모달  
> - **ConfirmDialog** — 취소/확인 선택이 필요한 모달

`sonner` 라이브러리 기반의 Toast + Zustand 기반 ConfirmDialog 를 사용합니다.  
기존 `window.alert` / `window.confirm` 은 iOS WebView에서 동작하지 않아 이 방식으로 대체했습니다.

### Toast 사용법

`src/components/ui/Toast.ts` 래퍼를 통해 호출합니다. (`sonner` 직접 import 대신 이 래퍼를 사용합니다.)

```typescript
import { toast } from '@/components/ui/Toast';

toast.success('저장되었습니다');
toast.error('오류가 발생했습니다');
toast.info('정보 메시지');
toast.warning('경고 메시지');
```

| 메서드 | 용도 |
|---|---|
| `toast.success` | 작업 완료, 저장 성공 등 |
| `toast.error` | API 오류, 유효성 검사 실패 등 |
| `toast.info` | 일반 안내 |
| `toast.warning` | 주의 필요 상황 |

`<Toaster position="top-center" richColors />` 는 `App.tsx` 루트에 마운트되어 있습니다.

### ConfirmDialog (취소/확인 선택이 필요한 경우)

```typescript
import { useConfirmStore } from '@/store/useDialogStore';

const { confirm } = useConfirmStore();
const ok = await confirm({ title: '삭제하시겠습니까?', message: '되돌릴 수 없습니다' });
if (ok) { /* 처리 */ }
```

## iOS / Android 플랫폼 분기 CSS

### 배경

| 플랫폼 | WebView 뷰포트 | 처리 |
|---|---|---|
| iOS | 전체 화면 (상태바 포함) | `env(safe-area-inset-top)` 활용 |
| Android | 상태바 아래부터 시작 | 상단 여백 불필요 (`0px`) |

### 동작 원리

`index.html` 인라인 스크립트가 React 렌더 전에 User-Agent를 감지해 `<html>` 요소에 `data-platform` 속성을 주입합니다.

```
iOS     → data-platform="ios"
Android → data-platform="android"
브라우저  → data-platform="web"
```

네이티브 셸에서 명시적으로 플랫폼을 지정할 수 있습니다:
```js
// WebView 내부에서 호출 (네이티브 → 웹)
window.setPlatform('ios');   // 또는 'android'
```

### `--status-bar-height` CSS 변수

`src/styles/tokens.css` 에 정의된 플랫폼별 변수:

| 플랫폼 | 값 | 비고 |
|---|---|---|
| `ios` | `env(safe-area-inset-top, 44px)` | 기기별 실제 높이 자동 적용 |
| `android` | `0px` | WebView가 이미 상태바 아래에서 시작 |
| `web` | `44px` | 데스크탑 dev 미리보기 고정값 |

**신규 페이지 작성 시 규칙:**
- 헤더 `padding-top: 0` 유지
- 헤더 최상단 첫 자식으로 `<StatusBar>` 배치 (`TopBar` 컴포넌트 사용 시 불필요)
- 상단 여백에 고정 px 값 직접 지정 금지 → `var(--status-bar-height)` 또는 `<StatusBar>` 사용

## NativeInterface (WebView ↔ Native 브릿지)

`src/lib/native.ts` 가 Android / iOS 네이티브 레이어와의 통신을 추상화합니다.

### 플랫폼별 발신

| 플랫폼 | 채널 |
|---|---|
| Android | `window.native.postMessage(jsonString)` |
| iOS | `window.webkit.messageHandlers.native.postMessage(jsonString)` |
| Browser(dev) | 콘솔 경고 + 100ms 후 자동 null resolve |

### 네이티브 → 웹 수신 (두 채널 모두 대응)

| 채널 | 설명 |
|---|---|
| `window.nativeInterface.onMessage(str)` | 표준 채널 |
| `window.postMessage(str)` | iOS `evaluateJavaScript("window.postMessage(...)")` 패턴 흡수 |

### iOS 확인된 동작 패턴 (2026-05-15 실기기 테스트)

| 항목 | 내용 |
|---|---|
| 발신 | `webkit.messageHandlers.native.postMessage(key)` 정상 동작 |
| 수신 | 네이티브가 `evaluateJavaScript("window.postMessage(result)")` 로 응답 |
| `getLocation` 응답 | `"lat,lng"` plain string (예: `"37.210363,127.089161"`) |

### 사용법

```typescript
import { nativeInterface, NATIVE_KEYS } from '@/lib/native';

// 단방향 전송
nativeInterface.send(NATIVE_KEYS.HAPTIC, { style: 'light' });

// 응답 기대 (Promise, 기본 타임아웃 10초)
const loc = await nativeInterface.request<{ lat: number; lng: number }>(NATIVE_KEYS.GET_LOCATION);

// Push 이벤트 구독
const unsub = nativeInterface.on<{ lat: number; lng: number }>(NATIVE_KEYS.LOCATION_UPDATE, (d) => {
  console.log(d.lat, d.lng);
});
unsub(); // unmount 시 해제
```

### 지원 커맨드 키 (`NATIVE_KEYS`)

| 키 | 방향 | 설명 |
|---|---|---|
| `getLocation` | Request/Response | GPS 위치 1회 조회 |
| `openCamera` | Request/Response | 카메라 오픈 후 이미지 반환 |
| `share` | Send | OS 공유 시트 오픈 |
| `haptic` | Send | 햅틱 피드백 트리거 |
| `getDeviceInfo` | Request/Response | OS / 앱 버전 정보 |
| `requestPermission` | Request/Response | 런타임 권한 요청 |
| `locationUpdate` | Push (Native→Web) | 실시간 위치 스트리밍 |
| `appForeground` | Push (Native→Web) | 앱 포그라운드 복귀 이벤트 |
| `deepLink` | Push (Native→Web) | 딥링크 URL 수신 |

## 이미지 로딩 (AppImage) — 최우선 규칙

**모든 동적 이미지는 반드시 `<AppImage>` 컴포넌트를 통해 처리합니다.**

사용자가 이미지 로딩 중 빈 화면을 보지 않도록 shimmer skeleton을 표시하는 래퍼 컴포넌트입니다.

### 사용법

```tsx
import { AppImage } from '@/components/ui/AppImage';

// 직사각형 이미지 (피드, 퀘스트 썸네일 등)
<AppImage src={imageUrl} alt="설명" />

// 원형 이미지 (아바타, 프로필 사진)
<AppImage src={avatarUrl} alt="유저명" variant="circle" />
```

### Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `src` | string | 필수 | 이미지 URL |
| `alt` | string | `''` | 대체 텍스트 |
| `variant` | `'rect'` \| `'circle'` | `'rect'` | rect = 직사각형 skeleton, circle = 원형 skeleton |
| `...imgProps` | HTMLImageAttributes | | 기타 img 속성 |

### 동작

1. **로딩 중**: shimmer 애니메이션이 적용된 skeleton 표시
2. **로드 완료**: fade-in 전환으로 이미지 표시
3. **에러**: skeleton 상태 유지 (onError 핸들러로 오류 처리 가능)

### 적용 대상

- 서버에서 받아오는 모든 동적 이미지
- `PhotoCard`, `StoryAvatar` 등 재사용 컴포넌트도 내부적으로 `AppImage` 사용
- 아바타, 게시물 사진, 퀘스트 썸네일, DM 이미지 등

### 제외 사항

- 로컬 blob URL 미리보기 (메모리에 있으므로 즉시 로드)
- 작은 emoji 아이콘 (onError fallback 로직이 필요한 경우)
- 이미 표시된 이미지를 확대하는 lightbox

### 신규 개발 체크리스트

새로운 페이지나 컴포넌트를 추가할 때:
- [ ] 동적 이미지에서 `<img>` 직접 사용 금지
- [ ] 모든 이미지를 `<AppImage>` 로 래핑
- [ ] 아바타/프로필 사진은 `variant="circle"` 옵션 추가
- [ ] 기타 이미지는 기본값 사용

---

## 무한스크롤 & Pull-to-Refresh

### `useInfiniteScroll<T>` 훅

`src/hooks/useInfiniteScroll.ts`

offset 기반 무한스크롤 훅. `FeedList` / `QuestList` 에서 사용합니다.

```typescript
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

const { items, isLoading, isLoadingMore, hasMore, sentinelRef, reset } =
  useInfiniteScroll<FeedPost>(
    (page) => fetchFeed({ filter, page }),  // fetchPage 함수
    20,                                      // pageSize
    [filter, userId],                        // deps — 변경 시 자동 리셋
  );
```

- `fetchPage(page)` 는 `{ items, total, page, size }` 를 반환해야 합니다.
- `sentinelRef` 를 리스트 하단 div에 붙이면 IntersectionObserver가 자동 트리거합니다.
- `deps` 변경 시 page 1부터 재로딩(리셋)됩니다.
- `loadingRef` 가드로 중복 요청을 방지합니다.

### `usePullToRefresh` 훅

`src/hooks/usePullToRefresh.ts`

touch 이벤트 기반 당겨서 새로고침 훅.

```typescript
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

const { containerRef, pullDistance, isRefreshing } = usePullToRefresh(async () => {
  await reset();  // useInfiniteScroll의 reset 함수 등 전달
});
```

- `containerRef` 를 스크롤 컨테이너 div에 붙입니다.
- `scrollTop === 0` 일 때만 감지 (스크롤 중 오작동 방지).
- 저항감 0.5 감쇠, 64px 임계값 초과 시 `onRefresh` 실행.
- `pullDistance` / `isRefreshing` 를 `<PullIndicator>` 에 전달해 시각 피드백을 표시합니다.

### `<ScrollSentinel>` 컴포넌트

리스트 하단에 배치. IntersectionObserver 트리거 + 로딩 스피너/끝 표시.

```tsx
<ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
```

### `<PullIndicator>` 컴포넌트

스크롤 컨테이너 최상단에 배치 (`position: absolute; top: -48px`). 당기는 거리에 따라 화살표 회전, 임계값 도달 시 스피너로 전환.

```tsx
<PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
```

## ProfileCard BottomSheet

`src/components/ProfileCard.tsx` — 타유저 프로필을 BottomSheet로 표시.

- **진입점**: FeedList에서 게시자 아바타/닉네임 클릭
- **구성**: 아바타, 닉네임, LevelBadge, riderStyle Chip, 팔로워/팔로잉 수, 팔로우/언팔로우 버튼
- **API**: `fetchUserProfile(userId, requesterId?)` → `GET /users/{userId}/profile`

## 프로필 페이지 Draggable Sheet 패턴

`ProfileMain.tsx`는 3개 고정 레이어 + 드래그 가능 시트로 구성:

| 레이어 | 역할 | CSS |
|---|---|---|
| `bgFixed` | 단일 그라데이션 배경 | `position: fixed; inset: 0; z-index: 0` |
| `fixedHeader` (Section 1) | 아바타 ~ 레벨바 | `position: fixed; top: 0; z-index: 1` |
| `socialSection` (Section 2) | 팔로워/팔로잉 + 공유/친구추가 버튼 | `position: fixed; z-index: 1` |
| `sheet` (Section 3) | 커런시/통계/히스토리/뱃지 | `position: fixed; z-index: 3` (드래그 가능) |

- Section 3는 두 스냅 포인트(snapMin=Section1 하단, snapMax=Section2 하단) 사이에서 드래그
- `overflowY: hidden` (이동 중) → `auto` (snapMin 도달 후) 로 토글하여 내부 스크롤과 시트 드래그를 분리
- 소셜 영역은 Follower/Following 2분할 (Friend 셀 제거됨)

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_USE_MOCK` | `false` | true = 더미 데이터, false = 실제 API |
| `VITE_API_BASE` | `http://localhost:18090/api` | API 기본 URL |

---

## 게임 컴포넌트 (`components/game/`)

게이미피케이션 v2에서 추가된 RPG 경제 시스템 UI 컴포넌트.

| 컴포넌트 | 설명 |
|---|---|
| `PityBar` | 천장(pity) 진행 바 (current/ceiling/dark 프롭) |
| `ConfettiLayer` | SVG 축하 파티클 오버레이 (라이딩 결과·가챠 보상) |
| `RarityChip` | 등급 배지 (C/R/E/L/M, count 옵션) |
| `CurrencyBadge` | 단일 통화 배지 (GP/GC/SXP, light/dark surface) |
| `GachaCardBack` | 가챠 카드 뒷면 (flip 애니메이션) |
| `GameHubSheet` | 게임 허브 바텀시트 런처 (TabBar FAB에서 열림) |
