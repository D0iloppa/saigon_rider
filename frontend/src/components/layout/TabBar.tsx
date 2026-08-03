import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Store, Map, Users, User } from 'lucide-react';
import { useDmStore } from '@/store/useDmStore';
// import { emojiUrl } from '@/lib/emoji'; // gif 버전 전환 시 필요
import styles from './TabBar.module.css';

// 탭 루트가 아닌 하위 화면도 소속 탭을 활성 표시하기 위한 경로 매핑 (P1-8).
// 여기 없는 경로는 계속 매핑 대상이 아니며, 탭바 자체를 숨겨야 하면 AppShell 의
// HIDE_TABBAR_PATHS 에 추가한다(이 매핑과는 다른 관심사).
const TAB_PATH_PREFIXES: Record<string, string[]> = {
  '/home': ['/home', '/info', '/guide/safe-trade', '/quests'],
  '/market': ['/market', '/biz'],
  '/map': ['/map'],
  '/feed': ['/feed'],
  '/profile': [
    '/profile', '/settings', '/notices', '/faq', '/notifications', '/dm',
    '/trades', '/followers', '/following', '/friends',
  ],
};

function matchesTab(pathname: string, tabPath: string): boolean {
  return TAB_PATH_PREFIXES[tabPath].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/*
// GIF 버전 — 향후 피드백 이후 교체 시 GifTabIcon 컴포넌트 복원
function GifTabIcon({
  code,
  FallbackIcon,
  size = 24,
}: {
  code: string;
  FallbackIcon: React.ElementType;
  size?: number;
}) {
  return (
    <span className={styles.iconWrap}>
      <img
        src={emojiUrl(code)}
        width={size}
        height={size}
        alt=""
        className={styles.gifIcon}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = 'block';
        }}
      />
      <FallbackIcon
        className={styles.svgFallback}
        size={size}
        strokeWidth={1.8}
        style={{ display: 'none' }}
      />
    </span>
  );
}

// gif code: home='1f3e0' market='1f6d2' map='1f5fa' community='1f465' profile='1f464'
*/

export function TabBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const dmUnread = useDmStore((s) => s.totalUnread);

  // 5탭: 홈·마켓·동네지도·커뮤니티·프로필 (채팅은 nav 제외)
  // 프로필 탭 = DM 진입점 → 안 읽은 DM 있으면 빨간 dot 으로 알림
  const tabs = [
    { path: '/home',    label: t('tabbar.home'),      Icon: Home,  dot: false },
    { path: '/market',  label: t('tabbar.market'),    Icon: Store, dot: false },
    { path: '/map',     label: t('tabbar.map'),       Icon: Map,   dot: false },
    { path: '/feed',    label: t('tabbar.community'), Icon: Users, dot: false },
    { path: '/profile', label: t('tabbar.profile'),   Icon: User,  dot: dmUnread > 0 },
  ];

  return (
    <nav className={styles.tabbar}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={`${styles.tab} ${matchesTab(pathname, tab.path) ? styles.active : ''}`}
        >
          <span className={styles.iconWrap}>
            <tab.Icon size={24} strokeWidth={1.8} />
            {tab.dot && <span className={styles.navDot} />}
          </span>
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
