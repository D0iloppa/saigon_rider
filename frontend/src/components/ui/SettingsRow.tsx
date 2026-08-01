import React from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './SettingsRow.module.css';

interface SettingsRowProps {
  /** 행 선행 아이콘 — lucide 엘리먼트 권장 (예: <Bell size={18} />) */
  icon?: React.ReactNode;
  label: string;
  value?: string;
  arrow?: boolean;
  right?: React.ReactNode;
  onClick?: () => void;
}

export function SettingsRow({
  icon,
  label,
  value,
  arrow,
  right,
  onClick,
}: SettingsRowProps) {
  const RootTag = onClick ? 'button' : 'div';

  return (
    <RootTag
      className={styles.row}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {icon && <span className={styles.rowIcon}>{icon}</span>}
      <span className={styles.rowLabel}>{label}</span>
      {value && <span className={styles.rowValue}>{value}</span>}
      {right}
      {arrow && <ChevronRight size={18} className={styles.arrow} />}
    </RootTag>
  );
}
