import React from 'react';
import styles from './CardBase.module.css';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardBase({ children, className = '', ...props }: Props) {
  return (
    <div className={`${styles.card3d} ${className}`} {...props}>
      <div className={styles.cardContent}>
        {children}
      </div>
    </div>
  );
}
