import React from 'react';
import styles from './PhotoCard.module.css';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  src: string;
  alt?: string;
  children?: React.ReactNode;
}

export function PhotoCard({ src, alt = '', children, className = '', ...props }: Props) {
  return (
    <div className={`${styles.photoCard} ${className}`} {...props}>
      <img src={src} alt={alt} />
      {children}
    </div>
  );
}
