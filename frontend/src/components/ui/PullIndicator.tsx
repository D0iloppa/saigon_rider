import styles from './PullIndicator.module.css';

const THRESHOLD = 64;

interface Props {
  pullDistance: number;
  isRefreshing: boolean;
}

export function PullIndicator({ pullDistance, isRefreshing }: Props) {
  const visible = pullDistance > 0 || isRefreshing;
  if (!visible) return null;

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const ready = pullDistance >= THRESHOLD;

  return (
    <div
      className={styles.wrap}
      style={{ transform: `translateY(${pullDistance}px)` }}
    >
      <div className={`${styles.circle} ${isRefreshing ? styles.spinning : ''}`}>
        {isRefreshing ? (
          <div className={styles.spinner} />
        ) : (
          <svg
            className={styles.arrow}
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            style={{
              transform: `rotate(${ready ? 180 : progress * 160}deg)`,
              opacity: progress,
              transition: 'transform 0.15s ease',
            }}
          >
            <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
}
