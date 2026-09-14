import { UserRound } from 'lucide-react';
import styles from './OwnerBadge.module.css';

interface Props {
  label: string;
  compact?: boolean;
  className?: string;
}

export function OwnerBadge({ label, compact, className }: Props) {
  return (
    <span className={`${styles.badge} ${compact ? styles.compact : ''} ${className ?? ''}`}>
      {!compact && <UserRound size={10} strokeWidth={2.6} aria-hidden="true" />}
      {label}
    </span>
  );
}
