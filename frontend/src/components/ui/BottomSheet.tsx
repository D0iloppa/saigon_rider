import { ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './BottomSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: 'auto' | 'half' | 'full' | 'fit';
  sheetStyle?: React.CSSProperties;
}

export function BottomSheet({ open, onClose, children, height = 'auto', sheetStyle }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragY = useRef({ startY: 0, currentY: 0, dragging: false });

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  // iOS에서 키보드 등장 시 visualViewport가 스크롤되면 position:fixed backdrop이
  // layout viewport 기준으로 고정되어 화면 상단이 네이티브 배경색으로 번쩍이는 문제 방지.
  useLayoutEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const update = () => {
      const backdrop = backdropRef.current;
      const sheet = sheetRef.current;
      if (!backdrop || !sheet) return;

      if (!vv) {
        backdrop.style.top = '';
        backdrop.style.left = '';
        backdrop.style.width = '';
        backdrop.style.height = '';
        sheet.style.maxHeight = '';
        return;
      }

      backdrop.style.top = `${vv.offsetTop}px`;
      backdrop.style.left = `${vv.offsetLeft}px`;
      backdrop.style.width = `${vv.width}px`;
      backdrop.style.height = `${vv.height}px`;
      sheet.style.maxHeight = `${Math.max(vv.height - 60, 240)}px`;
    };

    update();
    window.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      const backdrop = backdropRef.current;
      const sheet = sheetRef.current;
      if (backdrop) {
        backdrop.style.top = '';
        backdrop.style.left = '';
        backdrop.style.width = '';
        backdrop.style.height = '';
      }
      if (sheet) {
        sheet.style.maxHeight = '';
      }
    };
  }, [open]);

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
    <div ref={backdropRef} className={styles.backdrop} onClick={onClose}>
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${styles[height]}`}
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={styles.grabber}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        {(height === 'full' || height === 'fit') && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        )}
        <div className={styles.scrollBody}>{children}</div>
      </div>
    </div>,
    portalTarget,
  );
}
