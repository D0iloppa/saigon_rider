import { ReactNode, useEffect } from 'react';
import styles from './BottomSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: 'auto' | 'half' | 'full';
}

export function BottomSheet({ open, onClose, children, height = 'auto' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={`${styles.sheet} ${styles[height]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grabber} />
        {children}
      </div>
    </div>
  );
}
