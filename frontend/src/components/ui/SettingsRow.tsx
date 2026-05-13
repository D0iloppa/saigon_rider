import React from 'react';
import styles from './SettingsRow.module.css';

interface SettingsRowProps {
  icon?: string;
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
      {arrow && <span className={styles.arrow}>›</span>}
    </RootTag>
  );
}
