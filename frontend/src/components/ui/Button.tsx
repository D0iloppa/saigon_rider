import { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'lg',
  fullWidth = true,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      className={[
        styles.btn,
        styles[variant],
        styles[size],
        fullWidth ? styles.full : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
