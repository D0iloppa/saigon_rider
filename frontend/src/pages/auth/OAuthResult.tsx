import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { saveSession } from '@/lib/session';
import { apiOAuthExchange } from '@/api/auth';

/**
 * 웹 OAuth(Zalo) 팝업 플로우의 결과 수신 라우트.
 * BFF 콜백(oauth_zalo_callback, platform=web)이 여기로 리다이렉트한다.
 *
 * - window.opener 가 있으면(팝업으로 열림): 결과를 postMessage로 opener(OAuthLogin)에 전달하고 창을 닫는다.
 * - opener 가 없으면(팝업 차단 폴백 — 전체 페이지 리다이렉트): 이 페이지가 직접 세션을 저장하고 이동한다.
 */
export default function OAuthResult() {
  const navigate = useNavigate();
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const exchangeStartedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const code = params.get('code');

    if (window.opener) {
      window.opener.postMessage(
        { type: 'oauth-result', provider: 'zalo', error, code },
        window.location.origin,
      );
      window.close();
      return;
    }

    // 팝업 차단 폴백 — opener 없이 직접 도착
    if (error || !code) {
      navigate(`/auth/oauth?error=${encodeURIComponent(error || 'invalid_response')}`, { replace: true });
      return;
    }
    if (exchangeStartedRef.current) return;
    exchangeStartedRef.current = true;

    (async () => {
      try {
        const result = await apiOAuthExchange(code);
        saveSession({ userId: result.user.id, sessionToken: result.session_token });
        loginFromBackend(result.user);
        navigate(result.is_new ? '/auth/profile-setup' : '/home', { replace: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        navigate(`/auth/oauth?error=${encodeURIComponent(msg)}`, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
