/**
 * 익명ID(X-Anon-Id)/세션ID(X-Session-Id) 저장·왕복 — 사용자 트래킹 파이프라인(init/213).
 *
 * 서버 계약(backend/app/deps.py resolve_tracking_ids, 수정 금지 대상): 모든 bff 응답에 이
 * 두 헤더가 실려 온다. 클라이언트가 안 보내거나 형식이 잘못된 값을 보내면 서버가 새로
 * 발급해 응답 헤더로 회신하므로, 클라이언트는 응답 헤더 값을 저장했다가 다음 요청에
 * 그대로 되돌려보내면 된다(서버는 상태를 들고 있지 않다).
 *
 * 세션ID 의 "무활동 30분 만료·슬라이딩"은 서버가 아니라 클라이언트가 last-activity 타임스탬프로
 * 판단한다(deps.py 주석과 동일 계약): 마지막 활동으로부터 30분이 지났으면 X-Session-Id 를
 * 아예 보내지 않아 서버가 새 세션ID 를 발급하게 한다. 익명ID 는 만료 개념이 없다(영구 보존).
 *
 * localStorage 직접 사용 — navigator.* 가 아니라 ESLint no-restricted-globals 규칙(native.ts
 * 경유 강제)의 적용 대상이 아니다. native.ts/acquisition.ts 도 동일하게 localStorage 를 직접 쓴다.
 */

const ANON_ID_KEY = 'sgr_anon_id';
const SESSION_ID_KEY = 'sgr_session_id';
const LAST_ACTIVITY_KEY = 'sgr_session_last_activity';
const SESSION_IDLE_MS = 30 * 60 * 1000;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // 프라이버시 모드 등 — 트래킹은 부가 기능, 조용히 무시
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/** 다음 요청에 실을 트래킹 헤더. 세션ID는 30분 유휴 초과 시 생략(서버가 새로 발급). */
export function trackingRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  const anonId = safeGet(ANON_ID_KEY);
  if (anonId) headers['X-Anon-Id'] = anonId;

  const sessionId = safeGet(SESSION_ID_KEY);
  const lastActivity = Number(safeGet(LAST_ACTIVITY_KEY) ?? 0);
  const idle = !lastActivity || Date.now() - lastActivity > SESSION_IDLE_MS;
  if (sessionId && !idle) headers['X-Session-Id'] = sessionId;

  return headers;
}

/** 응답 헤더에서 발급/회신된 값을 저장하고 활동 시각을 갱신한다. bff 응답마다 호출한다. */
export function captureTrackingResponse(res: Response): void {
  const anonId = res.headers.get('X-Anon-Id');
  if (anonId) safeSet(ANON_ID_KEY, anonId);
  const sessionId = res.headers.get('X-Session-Id');
  if (sessionId) safeSet(SESSION_ID_KEY, sessionId);
  safeSet(LAST_ACTIVITY_KEY, String(Date.now()));
}
