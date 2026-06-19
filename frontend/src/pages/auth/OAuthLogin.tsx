import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusBar } from '@/components/layout/StatusBar';
import { useUserStore } from '@/store/useUserStore';
import { saveSession } from '@/lib/session';
import { native } from '@/lib/native';
import { apiOAuthLogin, apiDevLogin, apiGetMeById } from '@/api/auth';
import { fetchAppConfig } from '@/api/appVersion';
import styles from './AuthForm.module.css';

const IS_DEV = import.meta.env.DEV;

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
  const { t } = useTranslation();
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gisReady, setGisReady] = useState(false);

  const handleOAuthResult = async (provider: string, token: string, tokenType: string) => {
    setLoading(provider);
    setError(null);
    try {
      const result = await apiOAuthLogin(provider, token, tokenType);
      saveSession({ userId: result.user.id, sessionToken: result.session_token });
      loginFromBackend(result.user);
      navigate(result.is_new ? '/auth/profile-setup' : '/home', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(null);
    }
  };

  // 웹 모드: GIS 스크립트 로드 + Google 버튼 렌더링
  useEffect(() => {
    if (native.isNative) return;

    fetchAppConfig().then((cfg) => {
      if (!cfg.googleClientId) return;

      const initGis = () => {
        if (!window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: cfg.googleClientId,
          callback: (res) => handleOAuthResult('google', res.credential, 'id_token'),
          cancel_on_tap_outside: false,
        });
        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            width: googleButtonRef.current.offsetWidth || 320,
          });
        }
        setGisReady(true);
      };

      if (window.google?.accounts?.id) {
        initGis();
      } else {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initGis;
        document.head.appendChild(script);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 네이티브 모드: @capacitor/browser redirect flow
  // BFF가 세션까지 발급하므로 apiOAuthLogin 불필요 — userId/sessionToken 직접 저장
  const handleNativeGoogle = async () => {
    setError(null);
    setLoading('google');
    try {
      const { userId, sessionToken, isNew } = await native.signInWith('google');
      saveSession({ userId, sessionToken });
      const result = await apiGetMeById(userId);
      loginFromBackend(result.user);
      navigate(isNew ? '/auth/profile-setup' : '/home', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(null);
    }
  };

  const handleDevLogin = async () => {
    setError(null);
    setLoading('dev');
    try {
      const result = await apiDevLogin();
      saveSession({ userId: result.user.id, sessionToken: result.session_token });
      loginFromBackend(result.user);
      navigate(result.is_new ? '/auth/profile-setup' : '/home', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(null);
    }
  };

  return (
    <div className={styles.container}>
      <StatusBar />
      <div className={styles.content}>
        <div className={styles.titleBlock}>
          <p className={styles.titleLine1}>{t('oauthLogin.titleLine1')}</p>
          <p className={styles.titleLine2}>{t('oauthLogin.titleLine2')}</p>
        </div>

        <div className={styles.oauthButtons}>
          {native.isNative ? (
            // 네이티브: 커스텀 버튼 → Capacitor 플러그인
            <button
              className={`${styles.oauthBtn} ${styles.oauthBtnGoogle}`}
              onClick={handleNativeGoogle}
              disabled={loading !== null}
            >
              <span className={styles.oauthBtnIcon}>G</span>
              {loading === 'google' ? t('oauthLogin.loading') : t('oauthLogin.googleBtn')}
            </button>
          ) : (
            // 웹: GIS renderButton이 여기에 그려짐 (React DOM과 분리)
            <>
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
          <span className={styles.legalLink}>{t('oauthLogin.terms')}</span>
          {t('oauthLogin.legalMid')}
          <span className={styles.legalLink}>{t('oauthLogin.privacy')}</span>
          {t('oauthLogin.legalSuffix')}
        </p>

        {IS_DEV && (
          <button
            className={styles.devLoginBtn}
            onClick={handleDevLogin}
            disabled={loading !== null}
          >
            {loading === 'dev' ? t('oauthLogin.loading') : t('oauthLogin.devBtn')}
          </button>
        )}
      </div>
    </div>
  );
}
