# Task: NativeInterface — WebView ↔ Native 통신 공통 모듈

**날짜**: 2026-05-14  
**상태**: 완료 ✅

---

## 개요

프론트엔드(웹뷰)가 Android/iOS 네이티브 레이어와 통신하기 위한 공통 추상화 모듈 `NativeInterface`를 구현한다.  
플랫폼별 postMessage 차이를 내부에서 처리하고, 외부에는 Promise 기반의 단일 인터페이스를 노출한다.

---

## 배경 및 요구사항

### 플랫폼별 postMessage 차이

| 플랫폼 | 호출 방식 |
|--------|-----------|
| Android | `window.native.postMessage(payload)` |
| iOS | `window.webkit.messageHandlers.native.postMessage(payload)` |
| 브라우저(개발) | 없음 → Mock/Dev fallback 처리 |

### 기능 요구사항

1. **단방향 Send** — `key + params`를 네이티브로 전송
2. **양방향 Request/Response** — Promise 반환, 네이티브 응답 수신 후 resolve
3. **네이티브 → 웹 Push** — 네이티브가 자발적으로 이벤트 발행, 웹이 구독
4. **플랫폼 감지** — Android / iOS / Browser(dev) 자동 판별
5. **타임아웃** — 응답 없는 promise가 영구 대기하지 않도록 처리
6. **Dev Mock** — 브라우저 환경에서 개발/테스트용 응답 반환

---

## 아키텍처 설계

### 메시지 프로토콜 (양방향 공통 포맷)

```ts
// 웹 → 네이티브
interface NativeMessage {
  key: string;          // 커맨드 식별자 (e.g. "getLocation")
  callbackId?: string;  // response를 기대할 때만 첨부 (UUID)
  params?: unknown;     // 부가 파라미터
}

// 네이티브 → 웹  (네이티브가 window.onNativeMessage(msg) 호출)
interface NativeResponse {
  callbackId: string;   // 매칭용 ID
  result?: unknown;     // 성공 페이로드
  error?: string;       // 실패 메시지
}

// 네이티브 → 웹 Push (callbackId 없음)
interface NativePush {
  key: string;          // 이벤트 식별자 (e.g. "locationUpdate")
  data?: unknown;
}
```

### 모듈 구조

```
frontend/src/lib/
└── native.ts           ← NativeInterface 구현체 (싱글턴)
```

### 클래스 설계

```ts
class NativeInterface {
  // 플랫폼 판별
  private platform: 'android' | 'ios' | 'browser'

  // 대기 중인 Promise 맵 (callbackId → {resolve, reject, timer})
  private pending: Map<string, PendingCallback>

  // Push 이벤트 구독자 맵 (key → Set<handler>)
  private listeners: Map<string, Set<Function>>

  // 네이티브로 메시지 전송 (응답 불필요)
  send(key: string, params?: unknown): void

  // 네이티브에 요청 후 응답을 Promise로 수신
  request<T>(key: string, params?: unknown, timeoutMs?: number): Promise<T>

  // 네이티브 Push 이벤트 구독
  on<T>(key: string, handler: (data: T) => void): () => void  // 반환값: unsubscribe

  // 네이티브가 호출하는 수신 진입점 (window에 노출)
  private _onNativeMessage(msg: NativeResponse | NativePush): void
}

export const nativeInterface = new NativeInterface()  // 싱글턴
```

---

## 구현 세부사항

### 1. 플랫폼 감지

```ts
function detectPlatform() {
  if (window.native?.postMessage) return 'android'
  if (window.webkit?.messageHandlers?.native?.postMessage) return 'ios'
  return 'browser'
}
```

### 2. postMessage 발신

```ts
private _post(msg: NativeMessage) {
  const payload = JSON.stringify(msg)
  if (this.platform === 'android') window.native.postMessage(payload)
  else if (this.platform === 'ios') window.webkit.messageHandlers.native.postMessage(payload)
  else this._devFallback(msg)   // 브라우저 개발 환경
}
```

### 3. 응답 수신 진입점 (네이티브가 호출)

네이티브는 `window.nativeInterface.onMessage(jsonString)` 을 호출한다.

```ts
// window에 노출되어 네이티브가 직접 호출
window.nativeInterface = {
  onMessage: (raw: string) => nativeInterface._onNativeMessage(JSON.parse(raw))
}
```

### 4. Request/Response 매칭

```ts
request<T>(key, params, timeoutMs = 10_000): Promise<T> {
  const callbackId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      this.pending.delete(callbackId)
      reject(new Error(`NativeInterface timeout: ${key}`))
    }, timeoutMs)
    this.pending.set(callbackId, { resolve, reject, timer })
    this._post({ key, callbackId, params })
  })
}
```

### 5. Dev Fallback (브라우저 환경)

```ts
private _devFallback(msg: NativeMessage) {
  console.warn('[NativeInterface][DEV]', msg)
  // callbackId가 있으면 즉시 mock 응답으로 resolve
  if (msg.callbackId) {
    setTimeout(() => {
      this._onNativeMessage({ callbackId: msg.callbackId!, result: null })
    }, 100)
  }
}
```

---

## 사용 예시

```ts
import { nativeInterface } from '@/lib/native'

// 단방향 전송
nativeInterface.send('openCamera')

// 응답 기대
const location = await nativeInterface.request<{ lat: number; lng: number }>('getLocation')

// Push 구독 (위치 실시간 스트리밍 등)
const unsub = nativeInterface.on<{ lat: number; lng: number }>('locationUpdate', (data) => {
  console.log(data.lat, data.lng)
})
// 컴포넌트 unmount 시
unsub()
```

---

## 지원 커맨드 키 상수 (초기)

```ts
export const NATIVE_KEYS = {
  GET_LOCATION: 'getLocation',
  OPEN_CAMERA: 'openCamera',
  LOCATION_UPDATE: 'locationUpdate',  // Push
  SHARE: 'share',
  HAPTIC: 'haptic',
} as const
```

---

## Sub-tasks

| # | 항목 | 상태 |
|---|------|------|
| 1 | `frontend/src/lib/native.ts` 구현 | ✅ |
| 2 | Window 전역 타입 선언 (`vite-env.d.ts`) | ✅ |
| 3 | `NATIVE_KEYS` 상수 정의 | ✅ |
| 4 | Dev fallback mock 로직 | ✅ |
| 5 | 문서 색인 등록 (index.md, _tasklog.md, spec.md, README.md) | ✅ |

---

## 완료 기준

- [x] Android / iOS / Browser 3개 환경에서 플랫폼 분기 동작
- [x] `send()` / `request()` / `on()` API 동작
- [x] `callbackId` 기반 Promise 매칭
- [x] 타임아웃 후 reject 동작
- [x] Dev 환경에서 콘솔 경고 + 자동 resolve
- [x] TypeScript 타입 에러 없음
