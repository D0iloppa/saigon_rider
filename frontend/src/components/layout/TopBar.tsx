import { useNavigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { StatusBar } from './StatusBar';
import styles from './TopBar.module.css';

interface Props {
  title?: string;
  showBack?: boolean;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  transparent?: boolean;
  onBack?: () => void;
}

export function TopBar({
  title,
  showBack = true,
  leftContent,
  rightContent,
  transparent = false,
  onBack,
}: Props) {
  const navigate = useNavigate();

  return (
    <header className={`${styles.topbar} ${transparent ? styles.transparent : ''}`}>
      <StatusBar variant={transparent ? 'light' : 'dark'} />
      <div className={styles.content}>
        <div className={styles.left}>
          {showBack ? (
            <button
              className={styles.iconBtn}
              onClick={() => (onBack ? onBack() : navigate(-1))}
              aria-label="뒤로"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : leftContent ? (
            leftContent
          ) : null}
        </div>
        {title && <h1 className={styles.title}>{title}</h1>}
        <div className={styles.right}>{rightContent}</div>
      </div>
    </header>
  );
}
