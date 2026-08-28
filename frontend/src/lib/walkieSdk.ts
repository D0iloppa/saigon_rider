import { createHttpApi, createHybridTransport, type InboxPage, type WalkieApiPort } from '@d-modules/walkie-talkie';
import { loadSession } from '@/lib/session';

/**
 * WalkieTalkie SDK 를 이 앱에 연결하는 얇은 어댑터.
 *
 * SDK 는 인증 방식을 모른다 — 세션 헤더를 붙인 fetch 를 넘겨주는 것으로 끝난다.
 * (백엔드 어댑터 `app/services/walkie_module.py` 와 같은 원리: 정책·인증은 호스트에, 모듈에는 없음)
 *
 * baseUrl: 모듈 라우터는 BFF 의 `/api/walkie` 에 마운트돼 있고, nginx 가 `/api/bff/*` → `bff:8080/api/*`
 * 로 rewrite 하므로 앱에서 보이는 경로는 `/api/bff/walkie` 다.
 */
const WALKIE_BASE_URL = '/api/bff/walkie';

function sessionHeaders(): Record<string, string> {
  const session = loadSession();
  return session?.userId && session.sessionToken
    ? { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken }
    : {};
}

const authedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), ...sessionHeaders() } });

export const walkieApi: WalkieApiPort = createHttpApi({
  baseUrl: WALKIE_BASE_URL,
  fetchImpl: authedFetch,
});

/**
 * 수신 전송 — **SSE 우선, HTTP 폴링 폴백**.
 *
 * 폴백은 3층이다: 연결 실패·끊김 시 클라이언트 자동 전환 / 서버 정원 초과(503) / 원격 킬스위치(503).
 * 어느 경로든 정합성의 기준선은 커서 기반 HTTP 조회이므로, 폴백으로 내려가도 동작이 달라지지 않는다.
 * 백그라운드에서는 조회하지 않는다 — 그쪽 수신은 FCM 푸시가 담당한다.
 */
export function createWalkieTransport(args: {
  getCursor: () => string | null;
  onPage: (page: InboxPage) => void;
  onPresenceChanged?: () => void;
}) {
  return createHybridTransport({
    api: walkieApi,
    // 인증 헤더를 붙인 fetch 를 넘긴다 — EventSource 는 헤더를 못 실어 토큰이 URL 로 샌다.
    fetchImpl: authedFetch,
    sseUrl: (channelRef) => `${WALKIE_BASE_URL}/channels/${encodeURIComponent(channelRef)}/events`,
    getCursor: args.getCursor,
    onPage: args.onPage,
    onPresenceChanged: args.onPresenceChanged,
    isVisible: () => document.visibilityState === 'visible',
    onError: (err: unknown) => console.warn('[walkie] transport', err),
  });
}
