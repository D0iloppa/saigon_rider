import { useLocation } from 'react-router-dom';
import { ReactNode, useEffect } from 'react';
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
}

const HIDE_TABBAR_PATHS = [
  '/splash',
  '/auth/',
  '/ride/result/',
  '/ride-nav',
  '/link',
  '/dm/',
  '/market/',
  '/quest-check/',
];

export function AppShell({ children, splashVisible, splashFade, gifReady }: Props) {
  const { pathname } = useLocation();
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
          </div>
        )}
      </div>
    </div>
  );
}
