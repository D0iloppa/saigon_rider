import React from 'react';
import styles from './Chip.module.css';

export type ChipVariant = 'glass' | 'glass-light' | 'brand' | 'surface' | 'dark' | 'lime' | 'xp' | 'gold' | 'exp' | 'hot' | 'new' | 'limited';

interface CommonProps {
  variant?: ChipVariant;
  children: React.ReactNode;
}

// 클릭 가능한 Chip 은 as="button" 으로 렌더 — 키보드(Tab/Enter/Space) 조작 가능하게 한다.
// 기본(as 생략)은 기존과 동일하게 div — 라벨 전용 기존 사용처는 마크업/동작 변화 없음.
type Props =
  | (CommonProps & React.HTMLAttributes<HTMLDivElement> & { as?: 'div' })
  | (CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement> & { as: 'button' });

export function Chip({ variant = 'surface', children, className = '', as = 'div', ...props }: Props) {
  const variantCamel = variant.replace(/-./g, x => x[1].toUpperCase());
  const variantClass = 'chip' + variantCamel.charAt(0).toUpperCase() + variantCamel.slice(1);

  const combinedClassName = `${styles.chip} ${styles[variantClass]} ${as === 'button' ? styles.chipButton : ''} ${className}`.trim();

  if (as === 'button') {
    return (
      <button type="button" className={combinedClassName} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  }

  return (
    <div className={combinedClassName} {...(props as React.HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
