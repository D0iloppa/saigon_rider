import React from 'react';
import styles from './Chip.module.css';

export type ChipVariant = 'glass' | 'glass-light' | 'brand' | 'surface' | 'dark' | 'lime' | 'xp' | 'gold' | 'exp' | 'hot' | 'new' | 'limited';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ChipVariant;
  children: React.ReactNode;
}

export function Chip({ variant = 'surface', children, className = '', ...props }: Props) {
  const variantCamel = variant.replace(/-./g, x => x[1].toUpperCase());
  const variantClass = 'chip' + variantCamel.charAt(0).toUpperCase() + variantCamel.slice(1);
  
  const combinedClassName = `${styles.chip} ${styles[variantClass]} ${className}`.trim();

  return (
    <div className={combinedClassName} {...props}>
      {children}
    </div>
  );
}
