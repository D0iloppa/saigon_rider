import React from 'react';
import styles from './ProgressBar.module.css';

interface Props {
  progress: number; // 0 to 100
}

export function ProgressBar({ progress }: Props) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  
  return (
    <div className={styles.progressTrack}>
      <div className={styles.progressFill} style={{ width: `${safeProgress}%` }} />
    </div>
  );
}
