import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './BottomSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: 'auto' | 'half' | 'full';
}

export function BottomSheet({ open, onClose, children, height = 'auto' }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useRef({ startY: 0, currentY: 0, dragging: false });

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    dragY.current = { startY: e.touches[0].clientY, currentY: 0, dragging: true };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragY.current.dragging || !sheetRef.current) return;
    const dy = e.touches[0].clientY - dragY.current.startY;
    dragY.current.currentY = dy;
    if (dy > 0) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!sheetRef.current) return;
    const dy = dragY.current.currentY;
    dragY.current.dragging = false;
    if (dy > 120) {
      onClose();
    } else {
      sheetRef.current.style.transform = '';
    }
  };

  if (!open) return null;

  const portalTarget = document.getElementById('app-frame') ?? document.body;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${styles[height]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={styles.grabber}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        {height === 'full' && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        )}
        {children}
      </div>
    </div>,
    portalTarget,
  );
}
