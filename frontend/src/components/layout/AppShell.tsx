import { useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { TabBar } from './TabBar';
import { FloatingActionButton } from './FloatingActionButton';
import { emojiUrl } from '@/lib/emoji';
import styles from './AppShell.module.css';

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
  '/quest-check/',
];

export function AppShell({ children, splashVisible, splashFade, gifReady }: Props) {
  const { pathname } = useLocation();
  const hideTabBar = HIDE_TABBAR_PATHS.some((p) => pathname.startsWith(p));

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
