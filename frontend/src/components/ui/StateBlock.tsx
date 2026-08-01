import type { LucideIcon } from 'lucide-react';
import styles from '@/styles/system.module.css';

interface Props {
  icon: LucideIcon;
  /** neutral(빈) · safe(이상 없음) · error(조회 실패) */
  tone?: 'neutral' | 'safe' | 'error';
  title: string;
  desc?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * 앱 공용 상태 블록 — 빈/오류/안전 상태를 하나의 문법으로 표현한다.
 * (정보 4화면의 InfoState 를 전역 승격. 규칙: ai-docs/context/design-system.md)
 * - 오류(tone="error")에는 반드시 actionLabel/onAction 으로 재시도를 제공한다.
 * - 아이콘은 lucide 만 — 이모지 금지.
 */
export default function StateBlock({ icon: Icon, tone = 'neutral', title, desc, actionLabel, onAction }: Props) {
  const toneClass = tone === 'safe' ? styles.stateIconSafe : tone === 'error' ? styles.stateIconError : '';
  return (
    <div className={styles.stateWrap}>
      <div className={`${styles.stateIcon} ${toneClass}`}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <div className={styles.stateTitle}>{title}</div>
      {desc && <div className={styles.stateDesc}>{desc}</div>}
      {actionLabel && onAction && (
        <button type="button" className={styles.stateBtn} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
