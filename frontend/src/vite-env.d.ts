/// <reference types="vite/client" />

// ─── NativeInterface — Window 전역 타입 선언 ────────────────────────────────
interface Window {
  /** Android WebView 브릿지 */
  native?: {
    postMessage: (payload: string) => void;
  };
  /** iOS WKWebView 브릿지 */
  webkit?: {
    messageHandlers?: {
      native?: {
        postMessage: (payload: string) => void;
      };
    };
  };
  /** 네이티브가 응답을 보낼 때 호출하는 수신 진입점 */
  nativeInterface: {
    onMessage: (raw: string) => void;
  };
}
