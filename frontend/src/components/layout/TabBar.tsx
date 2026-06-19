import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Store, Map, Users, User } from 'lucide-react';
// import { emojiUrl } from '@/lib/emoji'; // gif 버전 전환 시 필요
import styles from './TabBar.module.css';

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

  // 5탭: 홈·마켓·동네지도·커뮤니티·프로필 (채팅은 nav 제외)
  const tabs = [
    { path: '/home',    label: t('tabbar.home'),      Icon: Home  },
    { path: '/market',  label: t('tabbar.market'),    Icon: Store },
    { path: '/map',     label: t('tabbar.map'),       Icon: Map   },
    { path: '/feed',    label: t('tabbar.community'), Icon: Users },
    { path: '/profile', label: t('tabbar.profile'),   Icon: User  },
  ];

  return (
    <nav className={styles.tabbar}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) =>
            `${styles.tab} ${isActive ? styles.active : ''}`
          }
        >
          <span className={styles.iconWrap}>
            <tab.Icon size={24} strokeWidth={1.8} />
          </span>
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
