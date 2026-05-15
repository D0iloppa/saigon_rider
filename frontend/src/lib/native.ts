/**
 * NativeInterface — WebView ↔ Native 통신 추상화 모듈
 *
 * 원칙: 네이티브 인터페이스는 수정하지 않는다. 웹 브릿지가 네이티브의 기존 패턴에 맞춘다.
 *
 * ── Mode 0 (legacy, default) ────────────────────────────────
 *   iOS 발신    : window.postMessage(key)
 *   Android 발신: window.native.postMessage(key)
 *   수신        : window 'message' 이벤트 (native: evaluateJavaScript("window.postMessage(result)"))
 *
 * ── Mode 1 (standard) ───────────────────────────────────────
 *   iOS 발신    : window.webkit.messageHandlers.native.postMessage(key)
 *   Android 발신: window.native.postMessage(key)
 *   수신        : window 'message' 이벤트 또는 window.nativeInterface.onMessage(result)
 *
 * ── Mode 2 (withParams) ─────────────────────────────────────
 *   발신: JSON { key, callbackId, params }
 *   수신: JSON { callbackId, result } → callbackId로 매칭
 *
 * ── Push (Native → Web, 단방향) ─────────────────────────────
 *   수신: JSON { key, data } → key로 등록된 리스너 호출
 */

// ─── 메시지 프로토콜 타입 ────────────────────────────────────────────────────

interface NativeOutbound {
  key: string;
  callbackId?: string;
  params?: unknown;
}

interface NativeInboundJson {
  callbackId?: string;
  key?: string;
  result?: unknown;
  error?: string;
  data?: unknown;
}

interface PendingCallback {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RequestOptions {
  /** 0: legacy (default), 1: standard (webkit.messageHandlers) */
  mode?: 0 | 1;
  timeoutMs?: number;
}

// ─── 지원 커맨드 키 상수 ─────────────────────────────────────────────────────

export const NATIVE_KEYS = {
  // Request/Response
  GET_LOCATION: 'getLocation',
  OPEN_CAMERA: 'openCamera',
  SHARE: 'share',
  HAPTIC: 'haptic',
  GET_DEVICE_INFO: 'getDeviceInfo',
  REQUEST_PERMISSION: 'requestPermission',

  // Push (네이티브 → 웹, 단방향)
  LOCATION_UPDATE: 'locationUpdate',
  APP_FOREGROUND: 'appForeground',
  DEEP_LINK: 'deepLink',
} as const;

export type NativeKey = (typeof NATIVE_KEYS)[keyof typeof NATIVE_KEYS];

// ─── 플랫폼 감지 ─────────────────────────────────────────────────────────────

type Platform = 'android' | 'ios' | 'browser';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'browser';
  if ((window as Window & { native?: { postMessage?: unknown } }).native?.postMessage) return 'android';
  if (
    (window as Window & { webkit?: { messageHandlers?: { native?: { postMessage?: unknown } } } })
      .webkit?.messageHandlers?.native?.postMessage
  )
    return 'ios';
  return 'browser';
}

// ─── NativeInterface 클래스 ───────────────────────────────────────────────────

class NativeInterface {
  private readonly platform: Platform;

  /** Mode 2: callbackId → PendingCallback */
  private readonly pending = new Map<string, PendingCallback>();

  /** Mode 0/1: FIFO 큐 — 수신 순서대로 resolve */
  private readonly pendingQueue: Array<PendingCallback> = [];

  /**
   * Mode 0 iOS 전용: window.postMessage로 발신한 key를 추적해
   * 자신이 보낸 메시지가 'message' 이벤트로 되돌아올 때 inbound로 혼입되지 않도록 필터링
   */
  private readonly mode0SentKeys = new Set<string>();

  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();

  constructor() {
    this.platform = detectPlatform();
    this._exposeToWindow();
  }

  // ─── 공개 API ───────────────────────────────────────────────────────────────

  /** 단방향 전송 — 응답 불필요 */
  send(key: string, params?: unknown): void {
    this._postJson({ key, params });
  }

  /**
   * 양방향 요청 (Mode 0 / Mode 1)
   *
   * plain string(key)을 발신하고, 네이티브가 보내는 raw string을 그대로 resolve.
   * JSON 여부는 호출부에서 판단한다.
   *
   * @param key      NATIVE_KEYS 상수
   * @param options  { mode: 0(legacy,default) | 1(standard), timeoutMs }
   */
  request(key: string, options: RequestOptions = {}): Promise<string> {
    const { mode = 0, timeoutMs = 3_000 } = options;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingQueue.findIndex((p) => p.timer === timer);
        if (idx !== -1) this.pendingQueue.splice(idx, 1);
        reject(new Error(`[NativeInterface] timeout: ${key} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingQueue.push({
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      if (mode === 0) {
        this._postLegacy(key);
      } else {
        this._postString(key);
      }
    });
  }

  /**
   * 양방향 요청 Mode 2 (withParams)
   *
   * { key, callbackId, params } JSON 발신.
   * 네이티브가 { callbackId, result } JSON으로 응답.
   */
  requestWithParams<T = unknown>(key: string, params?: unknown, timeoutMs = 3_000): Promise<T> {
    const callbackId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callbackId);
        reject(new Error(`[NativeInterface] timeout: ${key} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pending.set(callbackId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this._postJson({ key, callbackId, params });
    });
  }

  /**
   * 네이티브 Push 이벤트 구독
   * @returns unsubscribe 함수
   */
  on<T = unknown>(key: string, handler: (data: T) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    const h = handler as (data: unknown) => void;
    this.listeners.get(key)!.add(h);
    return () => this.listeners.get(key)?.delete(h);
  }

  // ─── 내부 발신 메서드 ────────────────────────────────────────────────────────

  /**
   * Mode 0 (legacy): 기존 네이티브 인터페이스에 맞춘 발신
   *   iOS    → window.postMessage(key)
   *   Android→ window.native.postMessage(key)
   */
  private _postLegacy(key: string): void {
    if (this.platform === 'android') {
      (window as Window & { native: { postMessage: (p: string) => void } }).native.postMessage(key);
    } else if (this.platform === 'ios') {
      // 자신이 보낸 key를 추적 — 'message' 이벤트 루프백 방지
      this.mode0SentKeys.add(key);
      window.postMessage(key, '*');
    } else {
      console.warn('[NativeInterface][DEV] Mode 0 (legacy) →', key);
      setTimeout(() => this._resolveQueue(''), 100);
    }
  }

  /**
   * Mode 1 (standard): plain string 발신
   *   iOS    → webkit.messageHandlers.native.postMessage(key)
   *   Android→ window.native.postMessage(key)
   */
  private _postString(key: string): void {
    if (this.platform === 'android') {
      (window as Window & { native: { postMessage: (p: string) => void } }).native.postMessage(key);
    } else if (this.platform === 'ios') {
      (
        window as Window & {
          webkit: { messageHandlers: { native: { postMessage: (p: string) => void } } };
        }
      ).webkit.messageHandlers.native.postMessage(key);
    } else {
      console.warn('[NativeInterface][DEV] Mode 1 (standard) →', key);
      setTimeout(() => this._resolveQueue(''), 100);
    }
  }

  /** Mode 2 / send: JSON 발신 */
  private _postJson(msg: NativeOutbound): void {
    const payload = JSON.stringify(msg);

    if (this.platform === 'android') {
      (window as Window & { native: { postMessage: (p: string) => void } }).native.postMessage(payload);
    } else if (this.platform === 'ios') {
      (
        window as Window & {
          webkit: { messageHandlers: { native: { postMessage: (p: string) => void } } };
        }
      ).webkit.messageHandlers.native.postMessage(payload);
    } else {
      console.warn('[NativeInterface][DEV] Mode 2 (withParams) →', msg);
      if (msg.callbackId) {
        setTimeout(() => {
          this._handleInbound(JSON.stringify({ callbackId: msg.callbackId, result: null }));
        }, 100);
      }
    }
  }

  // ─── 내부 수신 메서드 ────────────────────────────────────────────────────────

  /**
   * 수신 라우팅 우선순위:
   *   1. JSON + callbackId  → Mode 2 응답
   *   2. JSON + key (result 없음) → Push 이벤트
   *   3. 그 외              → Mode 0/1 FIFO 큐 (raw string 그대로 전달)
   */
  private _handleInbound(raw: string): void {
    let parsed: NativeInboundJson | null = null;
    try {
      parsed = JSON.parse(raw) as NativeInboundJson;
    } catch {
      // non-JSON → Mode 0/1 처리
    }

    if (parsed?.callbackId) {
      // Mode 2 응답
      const cb = this.pending.get(parsed.callbackId);
      if (!cb) return;
      clearTimeout(cb.timer);
      this.pending.delete(parsed.callbackId);
      parsed.error ? cb.reject(new Error(parsed.error)) : cb.resolve(parsed.result);
      return;
    }

    if (parsed?.key && !('result' in parsed)) {
      // Push 이벤트
      const handlers = this.listeners.get(parsed.key);
      handlers?.forEach((h) => h(parsed!.data));
      return;
    }

    // Mode 0/1: raw string을 FIFO 큐의 첫 번째 pending에 전달
    this._resolveQueue(raw);
  }

  private _resolveQueue(raw: string): void {
    const entry = this.pendingQueue.shift();
    if (entry) {
      clearTimeout(entry.timer);
      entry.resolve(raw);
    }
  }

  /** window에 두 수신 채널 노출 */
  private _exposeToWindow(): void {
    if (typeof window === 'undefined') return;

    // 채널 1: window.nativeInterface.onMessage(str) 직접 호출
    (window as Window & { nativeInterface: { onMessage: (raw: string) => void } }).nativeInterface = {
      onMessage: (raw: string) => this._handleInbound(raw),
    };

    // 채널 2: window.postMessage(str) — iOS evaluateJavaScript 패턴 흡수
    // Mode 0 iOS에서 자신이 보낸 메시지(loopback)는 필터링
    window.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      if (this.mode0SentKeys.has(event.data)) {
        this.mode0SentKeys.delete(event.data);
        return;
      }
      this._handleInbound(event.data);
    });
  }
}

// ─── 싱글턴 export ────────────────────────────────────────────────────────────

export const nativeInterface = new NativeInterface();
