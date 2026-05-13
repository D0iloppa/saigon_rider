import React from 'react';
import styles from './MapPin.module.css';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function MapPin({ children, className = '', ...props }: Props) {
  return (
    <div className={`${styles.mapPin} ${className}`} {...props}>
      {children}
    </div>
  );
}
