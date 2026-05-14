---
sidebar_position: 2
title: Frontend (BFE)
---

# Frontend — React + Vite

## 기술 스택

| 라이브러리 | 역할 |
|---|---|
| React 18 | UI 렌더링 |
| Vite | 번들러 / HMR |
| TypeScript | 타입 안전성 |
| Zustand | 전역 상태 관리 |
| React Router DOM | 클라이언트 라우팅 |
| i18next | 다국어 (ko / vi / en) |
| Capacitor | iOS / Android 네이티브 셸 |

## 접속

| 환경 | URL |
|---|---|
| Nginx 경유 (프로덕션 빌드) | http://localhost:18090 |
| Vite 직접 (HMR) | http://localhost:5174 |

## 빌드 & 배포

```bash
# 전체 재빌드 (프로덕션)
docker compose --env-file .env up --build -d frontend

# 로그 확인
docker compose logs -f frontend
```

## 주요 디렉토리

```
frontend/src/
├── api/          # fetch 래퍼 (auth, feed, quests, profile, client, types)
├── components/   # 레이아웃(AppShell, TabBar, TopBar, StatusBar) + 공통 UI
├── data/         # 더미 데이터 (feed, quests, countryCodes)
├── lib/          # 유틸
│   ├── format.ts     # 숫자/날짜 포맷
│   ├── i18n.ts       # i18next 설정
│   ├── native.ts     # NativeInterface — WebView ↔ Native 브릿지
│   ├── rewards.ts    # 보상 계산 유틸
│   └── session.ts    # 쿠키 세션 관리
├── pages/        # 화면별 컴포넌트
│   ├── auth/     # PhoneInput, OtpInput, ProfileSetup, Splash
│   ├── feed/     # FeedList
│   ├── home/     # WorldMap
│   ├── quest/    # QuestList, QuestDetail
│   ├── ride/     # RideActive, RideResult
│   └── settings/ # Settings, NotiSettings, LangSettings, AccountSettings
└── store/        # Zustand stores (user, ride)
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

## NativeInterface (WebView ↔ Native 브릿지)

`src/lib/native.ts` 가 Android / iOS 네이티브 레이어와의 통신을 추상화합니다.

### 플랫폼별 발신

| 플랫폼 | 내부 호출 |
|---|---|
| Android | `window.native.postMessage(jsonString)` |
| iOS | `window.webkit.messageHandlers.native.postMessage(jsonString)` |
| Browser(dev) | 콘솔 경고 + 100ms 후 자동 null resolve |

### 네이티브 → 웹 수신

네이티브 측에서 `window.nativeInterface.onMessage(jsonString)` 을 호출합니다.

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
| `VITE_USE_MOCK` | `true` | true = 더미 데이터, false = 실제 API |
| `VITE_API_BASE` | `http://localhost:18090/api` | API 기본 URL |
