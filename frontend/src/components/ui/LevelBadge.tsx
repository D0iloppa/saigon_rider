import React from 'react';
import styles from './LevelBadge.module.css';

interface Props {
  level: number | string;
  className?: string;
}

export function LevelBadge({ level, className = '' }: Props) {
  return (
    <div className={`${styles.levelBadge} ${className}`}>
      LV.{level}
    </div>
  );
}
