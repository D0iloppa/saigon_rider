import { useLocation } from 'react-router-dom';
import { ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { TabBar } from './TabBar';
import { FloatingActionButton } from './FloatingActionButton';
import { useDmStore } from '@/store/useDmStore';
import { emojiUrl } from '@/lib/emoji';
import styles from './AppShell.module.css';

const DM_POLL_MS = 20_000;

interface Props {
  children: ReactNode;
  splashVisible: boolean;
  splashFade: boolean;
  gifReady: boolean;
  bootstrapError: boolean;
  onBootstrapRetry: () => void;
  onBootstrapLogin: () => void;
}

const HIDE_TABBAR_PATHS = [
  '/splash',
  '/suspended',
  '/auth/',
  '/ride/result/',
  '/ride-nav',
  '/link',
  '/dm/',
  '/market/',
  '/map/profile',
  '/map/favorites',
  '/map/categories',
  '/quest-check/',
  '/feed/post/', // 게시글 상세 — 하단 댓글 입력바가 탭바 자리 사용
  '/biz/', // 업체 상세 — 업체 전용 문의 CTA가 탭바 자리 사용
];

export function AppShell({
  children, splashVisible, splashFade, gifReady,
  bootstrapError, onBootstrapRetry, onBootstrapLogin,
}: Props) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const hideTabBar = HIDE_TABBAR_PATHS.some((p) => pathname.startsWith(p));
  const refreshDmUnread = useDmStore((s) => s.refreshUnread);

  // 전역 DM 안 읽음 폴링 — 새 메시지 수신 시 배지 갱신(읽으면 markRead+refresh로 자동 0)
  useEffect(() => {
    refreshDmUnread();
    const id = setInterval(refreshDmUnread, DM_POLL_MS);
    return () => clearInterval(id);
  }, [refreshDmUnread]);

  return (
    <div className={styles.shell}>
      <div id="app-frame" className={styles.frame}>
        <div className={styles.viewport}>{children}</div>
        {!hideTabBar && <FloatingActionButton />}
        {!hideTabBar && <TabBar />}
        {splashVisible && (
          <div className={`${styles.splash} ${splashFade ? styles.splashFade : ''}`}>
            {gifReady ? (
              <img src={emojiUrl('1f3cd')} className={styles.splashIcon} alt="" />
            ) : (
              <span className={styles.splashIconEmoji} aria-hidden="true">🏍</span>
            )}
            <span className={styles.splashTitle}>Saigon Rider</span>
            {bootstrapError && (
              <div className={styles.bootstrapError} role="alert">
                <strong>{t('splash.bootstrapErrorTitle')}</strong>
                <p>{t('splash.bootstrapErrorBody')}</p>
                <Button size="md" onClick={onBootstrapRetry}>{t('common.retry')}</Button>
                <button className={styles.bootstrapLogin} onClick={onBootstrapLogin}>
                  {t('splash.bootstrapLogin')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
