# Capacitor 도입 — NativeInterface 추상화 전환

> **Feature #46** (`infra`) | 생성: 2026-05-20 | 상태: ✅ DONE (2026-05-20)

## 배경

현재 `frontend/src/lib/native.ts`의 `NativeInterface`는 WebView `postMessage` 기반 자체 프로토콜(Mode 0/1/2)로 네이티브와 통신한다. Capacitor 프레임워크를 도입하여:

1. 자체 프로토콜 → Capacitor 플러그인 API로 교체
2. 플랫폼 분기/타임아웃/콜백 관리 로직 제거
3. `NativeInterface` 추상화 레이어는 유지 (client.ts 패턴)

## 영향 범위

| 영역 | 파일 | 변경 내용 |
|---|---|---|
| 코어 | `frontend/src/lib/native.ts` | 전면 재작성 — Capacitor 플러그인 기반 메서드로 교체 |
| 타입 | `frontend/src/vite-env.d.ts` | window.native / window.webkit 타입 제거 |
| 사용처 | `pages/feed/FeedList.tsx` | nativeInterface.getLocation() 호출 변경 |
| 사용처 | `pages/feed/FeedCreate.tsx` | nativeInterface.getLocation() 호출 변경 |
| 사용처 | `pages/home/WorldMap.tsx` | nativeInterface 디버그 코드 정리 |
| 설정 | `frontend/package.json` | @capacitor/core + 플러그인 의존성 추가 |
| 설정 | ~~`capacitor.config.ts`~~ | 불필요 — 웹만 전환, 네이티브 셸 미사용 |

## 서브태스크

| # | 내용 | 상태 |
|---|---|---|
| SUB-1 | Capacitor 의존성 설치 (@capacitor/core + @capacitor/geolocation) | ✅ DONE |
| SUB-2 | NativeInterface 재설계 (타입 안전 메서드 기반 + 하위 호환 shim) | ✅ DONE |
| SUB-3 | 사용처 마이그레이션 (FeedList, FeedCreate, WorldMap) + shim 제거 | ✅ DONE |
| SUB-4 | vite-env.d.ts 정리 + 레거시 타입 제거 | ✅ DONE |
| SUB-5 | 빌드 검증 (tsc + vite build + lint 통과, 브라우저 UI 수동 검증 필요) | ✅ DONE |
| SUB-6 | 문서 현행화 (ai-docs/context/frontend.md, task, current.md, __DEV) | ✅ DONE |

## 현재 → 목표 매핑

| NATIVE_KEY | 현재 방식 | 목표 (Capacitor 플러그인) |
|---|---|---|
| `GET_LOCATION` | `request(key)` → raw string 파싱 | `@capacitor/geolocation` → `getCurrentPosition()` |
| `LOCATION_UPDATE` | `on(key, handler)` push 이벤트 | `@capacitor/geolocation` → `watchPosition()` |
| `OPEN_CAMERA` | `request(key)` | `@capacitor/camera` → `getPhoto()` |
| `GET_DEVICE_INFO` | `request(key)` | `@capacitor/device` → `getInfo()` |
| `REQUEST_PERMISSION` | `request(key)` | 각 플러그인 내장 `requestPermissions()` |
| `SHARE` | `send(key, params)` | `@capacitor/share` → `share()` |
| `HAPTIC` | `send(key)` | `@capacitor/haptics` → `impact()` |
| `APP_FOREGROUND` | `on(key, handler)` push 이벤트 | `@capacitor/app` → `addListener('appStateChange')` |
| `DEEP_LINK` | `on(key, handler)` push 이벤트 | `@capacitor/app` → `addListener('appUrlOpen')` |
