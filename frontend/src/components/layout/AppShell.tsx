import { useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { TabBar } from './TabBar';
import styles from './AppShell.module.css';

interface Props {
  children: ReactNode;
}

// 탭바를 숨길 경로
const HIDE_TABBAR_PATHS = [
  '/splash',
  '/auth/',
  '/ride/active',
  '/ride/result/',
  '/link',
];

export function AppShell({ children }: Props) {
  const { pathname } = useLocation();
  const hideTabBar = HIDE_TABBAR_PATHS.some((p) => pathname.startsWith(p));

  return (
    <div className={styles.shell}>
      <div className={styles.frame}>
        <div className={styles.viewport}>{children}</div>
        {!hideTabBar && <TabBar />}
      </div>
    </div>
  );
}
