import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { saveSession } from '@/lib/session';
import { apiGetMeById } from '@/api/auth';

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const userId = params.get('userId');
    const sessionToken = params.get('sessionToken');
    const isNew = params.get('isNew') === '1';

    if (window.opener) {
      window.opener.postMessage(
        { type: 'oauth-result', provider: 'zalo', error, userId, sessionToken, isNew },
        window.location.origin,
      );
      window.close();
      return;
    }

    // 팝업 차단 폴백 — opener 없이 직접 도착
    if (error || !userId || !sessionToken) {
      navigate(`/auth/oauth?error=${encodeURIComponent(error || 'invalid_response')}`, { replace: true });
      return;
    }

    (async () => {
      try {
        saveSession({ userId, sessionToken });
        const result = await apiGetMeById(userId);
        loginFromBackend(result.user);
        navigate(isNew ? '/auth/profile-setup' : '/home', { replace: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        navigate(`/auth/oauth?error=${encodeURIComponent(msg)}`, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
