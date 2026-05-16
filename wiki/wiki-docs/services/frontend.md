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
├── api/          # fetch 래퍼 (auth, feed, quests, profile, client, types)
├── components/
│   ├── layout/   # AppShell, TabBar, TopBar, StatusBar
│   └── ui/       # 공통 컴포넌트 (Button, Chip, BottomSheet, AlertDialog 등)
├── data/         # 더미 데이터 (feed, quests, countryCodes)
├── lib/
│   ├── format.ts     # 숫자/날짜 포맷
│   ├── i18n.ts       # i18next 설정
│   ├── native.ts     # NativeInterface — WebView ↔ Native 브릿지
│   ├── rewards.ts    # 보상 계산 유틸
│   └── session.ts    # 쿠키 세션 관리
├── pages/
│   ├── auth/     # PhoneInput, OtpInput, ProfileSetup, Splash
│   ├── feed/     # FeedList
│   ├── home/     # WorldMap
│   ├── quest/    # QuestList, QuestDetail
│   ├── ride/     # RideActive, RideResult
│   └── settings/ # Settings, NotiSettings, LangSettings, AccountSettings
├── store/        # Zustand stores (user, ride, dialog)
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

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_USE_MOCK` | `false` | true = 더미 데이터, false = 실제 API |
| `VITE_API_BASE` | `http://localhost:18090/api` | API 기본 URL |
