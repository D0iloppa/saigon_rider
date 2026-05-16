import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe2, Target, Camera, ShieldCheck } from 'lucide-react';
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
  const navigate = useNavigate();
  const { t } = useTranslation();

  const tabs = [
    { path: '/home',    label: t('tabbar.world'),   code: '1f30d', Fallback: Globe2      },
    { path: '/quests',  label: t('tabbar.quests'),  code: '1f3af', Fallback: Target      },
    { path: '/feed',    label: t('tabbar.feed'),    code: '1f4f7', Fallback: Camera      },
    { path: '/profile', label: t('tabbar.profile'), code: '2705',  Fallback: ShieldCheck },
  ];

  return (
    <nav className={styles.tabbar}>
      {tabs.slice(0, 2).map((tab) => (
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

      <button
        className={styles.fab}
        onClick={() => navigate('/quests')}
        aria-label={t('tabbar.startRide')}
      >
        <img
          className={styles.fabIcon}
          src={emojiUrl('1f3cd')}
          alt="🏍"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </button>

      {tabs.slice(2).map((tab) => (
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
