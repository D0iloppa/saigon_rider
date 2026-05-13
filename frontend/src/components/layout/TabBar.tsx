import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './TabBar.module.css';

export function TabBar() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const tabs = [
    { path: '/home', label: t('tabbar.world'), icon: '🏙' },
    { path: '/quests', label: t('tabbar.quests'), icon: '🎯' },
    { path: '/feed', label: t('tabbar.feed'), icon: '📷' },
    { path: '/profile', label: t('tabbar.profile'), icon: '👤' },
  ];

  return (
    <nav className={styles.tabbar}>
      {tabs.slice(0, 2).map((t) => (
        <NavLink
          key={t.path}
          to={t.path}
          className={({ isActive }) =>
            `${styles.tab} ${isActive ? styles.active : ''}`
          }
        >
          <span className={styles.icon}>{t.icon}</span>
          <span className={styles.label}>{t.label}</span>
        </NavLink>
      ))}

      <button
        className={styles.fab}
        onClick={() => navigate('/quests')}
        aria-label={t('tabbar.startRide')}
      >
        <img
          className={styles.fabIcon}
          src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f3cd/512.gif"
          alt="🏍"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </button>

      {tabs.slice(2).map((t) => (
        <NavLink
          key={t.path}
          to={t.path}
          className={({ isActive }) =>
            `${styles.tab} ${isActive ? styles.active : ''}`
          }
        >
          <span className={styles.icon}>{t.icon}</span>
          <span className={styles.label}>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
