import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Store, Map, Users, User } from 'lucide-react';
import { emojiUrl } from '@/lib/emoji';
import styles from './TabBar.module.css';

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

export function TabBar() {
  const { t } = useTranslation();

  // 5탭: 홈(WorldMap 대시보드)·마켓(거래)·동네지도(RideNav 지도)·커뮤니티(피드)·프로필
  // 채팅은 nav에서 제외 — 프로필 및 마켓 '채팅하기' 등에서 진입.
  const tabs = [
    { path: '/home',    label: t('tabbar.home'),      code: '1f3e0', Fallback: Home  },
    { path: '/market',  label: t('tabbar.market'),    code: '1f6d2', Fallback: Store },
    { path: '/map',     label: t('tabbar.map'),       code: '1f5fa', Fallback: Map   },
    { path: '/feed',    label: t('tabbar.community'),  code: '1f465', Fallback: Users },
    { path: '/profile', label: t('tabbar.profile'),    code: '1f464', Fallback: User  },
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
          <GifTabIcon code={tab.code} FallbackIcon={tab.Fallback} />
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
