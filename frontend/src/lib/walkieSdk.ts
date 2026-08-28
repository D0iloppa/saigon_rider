import { createHttpApi, createPollingTransport, type InboxPage, type WalkieApiPort } from '@d-modules/walkie-talkie';
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
 * 수신 전송(폴링). SSE 가 붙으면 이 팩토리만 교체되고 소비처는 그대로다.
 * 백그라운드에서는 조회하지 않는다 — 그쪽 수신은 FCM 푸시가 담당한다.
 *
 * 커서는 전송이 아니라 큐가 소유한다 — `getCursor` 로 물어보고 `onPage` 로 돌려준다.
 */
export function createWalkieTransport(args: {
  getCursor: () => string | null;
  onPage: (page: InboxPage) => void;
}) {
  return createPollingTransport({
    api: walkieApi,
    getCursor: args.getCursor,
    onPage: args.onPage,
    isVisible: () => document.visibilityState === 'visible',
    onError: (err: unknown) => console.warn('[walkie] inbox poll failed', err),
  });
}
