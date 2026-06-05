import { type ReactNode } from 'react';
import styles from './DynamicIsland.module.css';

interface DynamicIslandProps {
  /** true면 펼친(확장) 형태, false면 좁은 알약. */
  expanded: boolean;
  onClick?: () => void;
  children: ReactNode;
}

/**
 * 웹 구현 "다이나믹 아일랜드"풍 상단 알림 (SGR-269). iOS ActivityKit 아님 — 순수 CSS 모핑이라
 * Android WebView 에서도 동일 동작. 좁은 알약 ↔ 확장 카드로 부드럽게 늘어난다.
 * nav(턴 안내)·quest(진행 상태) 공용 — 내용은 children 으로 주입.
 */
export default function DynamicIsland({ expanded, onClick, children }: DynamicIslandProps) {
  return (
    <div className={styles.layer}>
      <button
        type="button"
        className={`${styles.island} ${expanded ? styles.expanded : styles.pill}`}
        onClick={onClick}
      >
        {children}
      </button>
    </div>
  );
}
