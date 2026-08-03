import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { useUserStore } from '@/store/useUserStore';
import { saveSession } from '@/lib/session';
import { native } from '@/lib/native';
import { AccountDeletedError } from '@/api/client';
import { apiOAuthExchange, apiOAuthLogin, apiDevLogin } from '@/api/auth';
import { fetchAppConfig } from '@/api/appVersion';
import { consumeReturnTo } from '@/lib/returnTo';
import styles from './AuthForm.module.css';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              shape?: string;
              width?: number;
            },
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function OAuthLogin() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gisReady, setGisReady] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const zaloMessageListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const zaloPopupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 탈퇴(soft-delete) 계정 — 로그인/교환(409 account_deleted)에서 복구 안내 화면으로.
  // 복구 토큰은 POST 응답 본문으로만 오며 URL/딥링크 파라미터에는 절대 싣지 않는다.
  const restoreInfoFromError = (e: unknown) =>
    e instanceof AccountDeletedError
      ? { deletedAt: e.deletedAt, restorableUntil: e.restorableUntil, restoreToken: e.restoreToken }
      : null;

  const goRestore = (info: { deletedAt: string | null; restorableUntil: string | null; restoreToken: string | null }) => {
    navigate('/auth/restore', { state: info });
  };

  const handleOAuthResult = async (provider: string, token: string, tokenType: string) => {
    setLoading(provider);
    setError(null);
    try {
      const result = await apiOAuthLogin(provider, token, tokenType);
      saveSession({ userId: result.user.id, sessionToken: result.session_token });
      loginFromBackend(result.user);
      navigate(result.is_new ? '/auth/profile-setup' : (consumeReturnTo() ?? '/home'), { replace: true });
    } catch (e: unknown) {
      const restore = restoreInfoFromError(e);
      if (restore) return goRestore(restore);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(null);
    }
  };

  const finishRedirectOAuth = async (code: string) => {
    const result = await apiOAuthExchange(code);
    saveSession({ userId: result.user.id, sessionToken: result.session_token });
    loginFromBackend(result.user);
    navigate(result.is_new ? '/auth/profile-setup' : (consumeReturnTo() ?? '/home'), { replace: true });
  };

  // 팝업 차단 폴백(OAuthResult가 opener 없이 /auth/oauth?error=... 로 되돌아온 경우) 에러 표시
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err) setError(err);
  }, []);

  // 언마운트 시 등록된 Zalo 팝업 message 리스너 + 팝업 감시 interval 해제
  useEffect(() => {
    return () => {
      if (zaloMessageListenerRef.current) {
        window.removeEventListener('message', zaloMessageListenerRef.current);
      }
      if (zaloPopupCheckRef.current) {
        clearInterval(zaloPopupCheckRef.current);
      }
    };
  }, []);

  // 앱 설정 로드: dev 여부(런타임 APP_ENV 기준) + 웹 모드 여부 판별
  useEffect(() => {
    fetchAppConfig().then((cfg) => {
      setIsDev(cfg.isDev);
      if (!native.isNative && cfg.googleClientId) setGoogleClientId(cfg.googleClientId);
    });
  }, []);

  // 웹 모드 GIS 스크립트 로드/Google 버튼 렌더링 — 언어가 바뀌면 hl 파라미터를 바꿔 스크립트를 다시 로드해야
  // 버튼 텍스트("Google 계정으로 계속하기" 등)가 갱신된다(P1-10). GIS 는 script 로드 시 hl 을 고정하므로
  // 언어 변경마다 이전 스크립트/전역객체를 지우고 다시 로드한다.
  useEffect(() => {
    if (native.isNative || !googleClientId) return;
    let cancelled = false;

    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (res) => handleOAuthResult('google', res.credential, 'id_token'),
        cancel_on_tap_outside: false,
      });
      // 레이아웃 확정 전에 offsetWidth 를 읽으면 0/미확정 값이 잡혀 Google 버튼이 Zalo 버튼보다
      // 좁게 렌더되는 문제가 있었다(P1-10) — 다음 프레임에서 실측 폭으로 렌더한다.
      requestAnimationFrame(() => {
        if (cancelled || !googleButtonRef.current) return;
        window.google!.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: googleButtonRef.current.offsetWidth || 320,
        });
        setGisReady(true);
      });
    };

    setGisReady(false);
    document.querySelectorAll('script[data-gis-script]').forEach((s) => s.remove());
    delete window.google;

    const script = document.createElement('script');
    script.src = `https://accounts.google.com/gsi/client?hl=${i18n.language}`;
    script.async = true;
    script.defer = true;
    script.dataset.gisScript = 'true';
    script.onload = renderGoogleButton;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [googleClientId, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  // 네이티브 모드: redirect URL에는 단회용 code만 받고 BFF에서 세션으로 교환한다.
  const handleNativeGoogle = async () => {
    setError(null);
    setLoading('google');
    try {
      const { code } = await native.signInWith('google');
      await finishRedirectOAuth(code);
    } catch (e: unknown) {
      const restore = restoreInfoFromError(e);
      if (restore) return goRestore(restore);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(null);
    }
  };

  const handleNativeZalo = async () => {
    setError(null);
    setLoading('zalo');
    try {
      const { code } = await native.signInWith('zalo');
      await finishRedirectOAuth(code);
    } catch (e: unknown) {
      const restore = restoreInfoFromError(e);
      if (restore) return goRestore(restore);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(null);
    }
  };

  const handleNativeApple = async () => {
    setError(null);
    setLoading('apple');
    try {
      const { code } = await native.signInWith('apple');
      await finishRedirectOAuth(code);
    } catch (e: unknown) {
      const restore = restoreInfoFromError(e);
      if (restore) return goRestore(restore);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(null);
    }
  };

  const handleWebZalo = () => {
    setError(null);
    setLoading('zalo');

    const startUrl = '/api/bff/auth/oauth/zalo/start?platform=web';
    const popup = window.open(startUrl, 'zalo-oauth', 'width=480,height=640');
    if (!popup) {
      // 팝업 차단 — 전체 페이지 리다이렉트로 폴백 (OAuthResult가 opener 없이 직접 처리)
      window.location.href = startUrl;
      return;
    }

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'oauth-result' || event.data?.provider !== 'zalo') return;
      window.removeEventListener('message', onMessage);
      zaloMessageListenerRef.current = null;
      if (zaloPopupCheckRef.current) {
        clearInterval(zaloPopupCheckRef.current);
        zaloPopupCheckRef.current = null;
      }

      const { error: resultError, code } = event.data;
      if (resultError) {
        setError(resultError);
        setLoading(null);
        return;
      }
      try {
        if (!code) throw new Error('invalid_oauth_response');
        await finishRedirectOAuth(code);
      } catch (e: unknown) {
        const restore = restoreInfoFromError(e);
        if (restore) return goRestore(restore);
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setLoading(null);
      }
    };
    zaloMessageListenerRef.current = onMessage;
    window.addEventListener('message', onMessage);

    // 사용자가 팝업을 수동으로 닫아 message가 오지 않는 경우 loading 데드엔드 방지
    zaloPopupCheckRef.current = setInterval(() => {
      if (!popup.closed) return;
      clearInterval(zaloPopupCheckRef.current!);
      zaloPopupCheckRef.current = null;
      window.removeEventListener('message', onMessage);
      zaloMessageListenerRef.current = null;
      setLoading(null);
    }, 500);
  };

  const handleDevLogin = async () => {
    setError(null);
    setLoading('dev');
    try {
      const result = await apiDevLogin();
      saveSession({ userId: result.user.id, sessionToken: result.session_token });
      loginFromBackend(result.user);
      navigate(result.is_new ? '/auth/profile-setup' : (consumeReturnTo() ?? '/home'), { replace: true });
    } catch (e: unknown) {
      const restore = restoreInfoFromError(e);
      if (restore) return goRestore(restore);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(null);
    }
  };

  return (
    <div className={styles.container}>
      <TopBar />
      <div className={styles.content}>
        <div className={styles.titleBlock}>
          <p className={styles.titleLine1}>{t('oauthLogin.titleLine1')}</p>
          <p className={styles.titleLine2}>{t('oauthLogin.titleLine2')}</p>
        </div>

        <div className={styles.oauthButtons}>
          {native.isNative ? (
            // 네이티브: 커스텀 버튼 → Capacitor 플러그인
            <>
              <button
                className={`${styles.oauthBtn} ${styles.oauthBtnZalo}`}
                onClick={handleNativeZalo}
                disabled={loading !== null}
              >
                <span className={styles.oauthBtnIcon}>Z</span>
                {loading === 'zalo' ? t('oauthLogin.loading') : t('oauthLogin.zaloBtn')}
              </button>
              <button
                className={`${styles.oauthBtn} ${styles.oauthBtnGoogle}`}
                onClick={handleNativeGoogle}
                disabled={loading !== null}
              >
                <span className={styles.oauthBtnIcon}>G</span>
                {loading === 'google' ? t('oauthLogin.loading') : t('oauthLogin.googleBtn')}
              </button>
              {/* Apple 로그인은 iOS 전용 — Android 에는 노출하지 않는다 (결정 2026-07-06) */}
              {native.platform === 'ios' && (
                <button
                  className={`${styles.oauthBtn} ${styles.oauthBtnApple}`}
                  onClick={handleNativeApple}
                  disabled={loading !== null}
                >
                  <svg className={styles.oauthBtnIcon} viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.74 3.17.8 1.21-.24 2.37-.93 3.67-.84 1.57.12 2.75.71 3.52 1.9-3.22 1.93-2.6 6.19.65 7.36-.51 1.3-1.17 2.58-3.01 3.66M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
                  </svg>
                  {loading === 'apple' ? t('oauthLogin.loading') : t('oauthLogin.appleBtn')}
                </button>
              )}
            </>
          ) : (
            // 웹: GIS renderButton이 여기에 그려짐 (React DOM과 분리)
            <>
              <button
                className={`${styles.oauthBtn} ${styles.oauthBtnZalo}`}
                onClick={handleWebZalo}
                disabled={loading !== null}
              >
                <span className={styles.oauthBtnIcon}>Z</span>
                {loading === 'zalo' ? t('oauthLogin.loading') : t('oauthLogin.zaloBtn')}
              </button>
              {!gisReady && (
                <div className={`${styles.oauthBtn} ${styles.oauthBtnGoogle} ${styles.oauthBtnPlaceholder}`}>
                  <span className={styles.oauthBtnIcon}>G</span>
                  {t('oauthLogin.googleBtn')}
                </div>
              )}
              <div className={styles.gisButtonWrap} ref={googleButtonRef} />
            </>
          )}
        </div>

        {error && <p className={styles.errorText}>{error}</p>}

        <p className={styles.legalText}>
          {t('oauthLogin.legalPrefix')}
          <Link to="/settings/terms" className={styles.legalLink}>{t('oauthLogin.terms')}</Link>
          {t('oauthLogin.legalMid')}
          <Link to="/settings/privacy" className={styles.legalLink}>{t('oauthLogin.privacy')}</Link>
          {t('oauthLogin.legalSuffix')}
        </p>

      </div>
    </div>
  );
}
