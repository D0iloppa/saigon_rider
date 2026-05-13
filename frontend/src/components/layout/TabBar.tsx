import { NavLink, useNavigate } from 'react-router-dom';
import styles from './TabBar.module.css';

const tabs = [
  { path: '/home', label: '월드', icon: '🏙' },
  { path: '/quests', label: '퀘스트', icon: '🎯' },
  { path: '/feed', label: '피드', icon: '📷' },
  { path: '/profile', label: '프로필', icon: '👤' },
];

export function TabBar() {
  const navigate = useNavigate();

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

      {/* 가운데 FAB: 빠른 라이딩 시작 */}
      <button
        className={styles.fab}
        onClick={() => navigate('/quests')}
        aria-label="라이딩 시작"
      >
        <span className={styles.fabIcon}>🏍</span>
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
