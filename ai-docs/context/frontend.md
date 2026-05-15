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

## 1. 네이티브 브릿지 (WebView ↔ Native)

> **구현 파일**: `src/lib/native.ts`  
> **타입 선언**: `src/vite-env.d.ts` (Window 인터페이스 확장)

앱은 Android / iOS WebView 위에서 동작한다. 네이티브 기능(GPS, 카메라, 권한 등)은 `NativeInterface` 싱글턴을 통해 호출한다.

### 1.1 통신 프로토콜

> **원칙: 네이티브 인터페이스는 수정하지 않는다.**  
> 네이티브의 기존 응답 패턴에 웹 브릿지가 맞춰서 수신한다.

**발신 (웹 → 네이티브)**

| 플랫폼 | 채널 |
|--------|------|
| Android | `window.native.postMessage(payload)` |
| iOS | `window.webkit.messageHandlers.native.postMessage(payload)` |

**수신 (네이티브 → 웹) — 두 채널 모두 대응**

| 채널 | 설명 |
|------|------|
| `window.nativeInterface.onMessage(str)` | 표준 채널 (네이티브가 직접 호출) |
| `window.postMessage(str)` | iOS `evaluateJavaScript("window.postMessage(...)")` 패턴 흡수 |

두 채널 모두 내부적으로 `_handleInbound`로 라우팅되어 동일하게 처리된다.

**메시지 포맷**

```
// 요청 (웹 → 네이티브)
{ key: string, callbackId?: string, params?: unknown }

// 응답 (네이티브 → 웹) — Request/Response
{ callbackId: string, result?: unknown }
{ callbackId: string, error: string }

// 푸시 이벤트 (네이티브 → 웹, 단방향)
{ key: string, data?: unknown }
```

### 1.2 iOS 확인된 동작 패턴

> 실기기 테스트(2026-05-15) 기준

| 항목 | 내용 |
|------|------|
| iOS 발신 | Mode 1 (`webkit.messageHandlers.native.postMessage(key)`) 정상 동작 |
| iOS 수신 | 네이티브가 `evaluateJavaScript("window.postMessage(result)")` 로 응답 |
| Mode 0 iOS | `window.postMessage(key)` 발신 — iOS에서 타임아웃 발생, 사용 안 함 |
| `getLocation` 응답 포맷 | `"lat,lng"` plain string (예: `"37.210363,127.089161"`) |

### 1.3 API 사용법

```ts
import { nativeInterface, NATIVE_KEYS } from '@/lib/native';

// 단방향 전송 (응답 없음)
nativeInterface.send(NATIVE_KEYS.HAPTIC, { style: 'light' });

// 양방향 요청 (Promise 반환, 기본 타임아웃 10초)
const loc = await nativeInterface.request<{ lat: number; lng: number }>(
  NATIVE_KEYS.GET_LOCATION
);

// Push 이벤트 구독 (실시간 스트리밍)
const unsub = nativeInterface.on<{ lat: number; lng: number }>(
  NATIVE_KEYS.LOCATION_UPDATE,
  (d) => console.log(d.lat, d.lng)
);
unsub(); // 반드시 컴포넌트 unmount 시 해제
```

### 1.3 지원 커맨드 (`NATIVE_KEYS`)

| 상수 | key 값 | 통신 방식 | 설명 |
|------|--------|-----------|------|
| `GET_LOCATION` | `getLocation` | Request/Response | 현재 GPS 위치 1회 조회 |
| `OPEN_CAMERA` | `openCamera` | Request/Response | 카메라 오픈 후 이미지 반환 |
| `SHARE` | `share` | Send | OS 공유 시트 오픈 |
| `HAPTIC` | `haptic` | Send | 햅틱 피드백 |
| `GET_DEVICE_INFO` | `getDeviceInfo` | Request/Response | OS / 앱 버전 정보 |
| `REQUEST_PERMISSION` | `requestPermission` | Request/Response | 런타임 권한 요청 |
| `LOCATION_UPDATE` | `locationUpdate` | Push (Native→Web) | 실시간 위치 스트리밍 |
| `APP_FOREGROUND` | `appForeground` | Push (Native→Web) | 앱 포그라운드 복귀 이벤트 |
| `DEEP_LINK` | `deepLink` | Push (Native→Web) | 딥링크 URL 수신 |

### 1.4 getLocation 응답 형태

> **미확인** — 네이티브 팀으로부터 실제 응답값 수신 후 이 항목을 채울 것.  
> 디버그 방법: `/home` 진입 시 `AlertDialog`로 raw 응답 출력 (아래 1.5 참고).

예상 형태 (확정 전):
```ts
{
  lat: number;   // 위도
  lng: number;   // 경도
  accuracy?: number;  // 정확도 (m)
}
```

### 1.5 브라우저(Dev) 환경 동작

네이티브 브릿지 미존재 시 자동 fallback:
- `request()` → 100ms 후 `null` resolve (UI 블로킹 방지)
- `send()` → 콘솔 경고만 출력
- `on()` → 이벤트 수신 없음 (핸들러 등록만 됨)

### 1.6 네이티브 브릿지 디버깅

응답값 확인이 필요할 때 `AlertDialog` 공통 컴포넌트를 활용한다.

```tsx
import { useState, useEffect } from 'react';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { nativeInterface, NATIVE_KEYS } from '@/lib/native';

// 컴포넌트 내부
const [debugMsg, setDebugMsg] = useState<string | null>(null);

useEffect(() => {
  nativeInterface
    .request(NATIVE_KEYS.GET_LOCATION)
    .then((res) => setDebugMsg(JSON.stringify(res, null, 2)))
    .catch((err: Error) => setDebugMsg(`Error: ${err.message}`));
}, []);

// JSX
<AlertDialog
  open={debugMsg !== null}
  title="getLocation 응답"
  pre={debugMsg ?? undefined}
  onClose={() => setDebugMsg(null)}
/>
```

값 확인 후 해당 `useEffect`와 `AlertDialog` 블록을 제거한다.

---

## 2. 공통 UI 컴포넌트

> 위치: `src/components/ui/`

| 컴포넌트 | 용도 |
|----------|------|
| `AlertDialog` | 단순 정보 표시 모달 (제목 + 텍스트/pre + 확인 버튼) |
| `ConfirmDialog` | 확인/취소 선택 모달 (Zustand store 기반 전역 호출) |
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
