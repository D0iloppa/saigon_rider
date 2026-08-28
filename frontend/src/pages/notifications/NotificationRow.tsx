import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, MessageCircle, Trash2 } from 'lucide-react';
import { relativeTime } from '@/pages/market/marketFormat';
import type { NotificationDto } from '@/api/notifications';
import styles from './NotificationInbox.module.css';

const DELETE_WIDTH = 76;

interface DragState {
  startX: number;
  startY: number;
  dx: number;
  mode: 'idle' | 'horizontal' | 'vertical';
  open: boolean;
}

export function NotificationRow({
  n,
  onClick,
  onDelete,
}: {
  n: NotificationDto;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState>({ startX: 0, startY: 0, dx: 0, mode: 'idle', open: false });

  function setTransform(x: number) {
    if (rowRef.current) rowRef.current.style.transform = `translateX(${x}px)`;
  }

  function handleTouchStart(e: React.TouchEvent) {
    drag.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      dx: drag.current.open ? -DELETE_WIDTH : 0,
      mode: 'idle',
      open: drag.current.open,
    };
    if (rowRef.current) rowRef.current.style.transition = 'none';
  }

  function handleTouchMove(e: React.TouchEvent) {
    const dx0 = e.touches[0].clientX - drag.current.startX;
    const dy0 = e.touches[0].clientY - drag.current.startY;
    if (drag.current.mode === 'idle') {
      if (Math.abs(dx0) < 6 && Math.abs(dy0) < 6) return;
      drag.current.mode = Math.abs(dx0) > Math.abs(dy0) ? 'horizontal' : 'vertical';
    }
    if (drag.current.mode !== 'horizontal') return;
    e.preventDefault();
    const base = drag.current.open ? -DELETE_WIDTH : 0;
    const next = Math.min(0, Math.max(-DELETE_WIDTH, base + dx0));
    drag.current.dx = next;
    setTransform(next);
  }

  function handleTouchEnd() {
    if (rowRef.current) rowRef.current.style.transition = '';
    if (drag.current.mode === 'horizontal') {
      const shouldOpen = drag.current.dx < -DELETE_WIDTH / 2;
      drag.current.open = shouldOpen;
      setTransform(shouldOpen ? -DELETE_WIDTH : 0);
    }
    drag.current.mode = 'idle';
  }

  function handleRowClick() {
    if (drag.current.open) {
      drag.current.open = false;
      setTransform(0);
      return;
    }
    onClick();
  }

  return (
    <div className={styles.rowWrap}>
      <button
        type="button"
        className={styles.deleteAction}
        onClick={onDelete}
        aria-label={t('common.remove')}
      >
        <Trash2 size={18} />
      </button>
      <div
        ref={rowRef}
        className={styles.rowSwipe}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          className={`${styles.row} ${n.is_read ? '' : styles.rowUnread}`}
          onClick={handleRowClick}
        >
          <div className={`${styles.iconBubble} ${n.type === 'KEYWORD' ? styles.iconKeyword : styles.iconSocial}`}>
            {n.type === 'KEYWORD' ? <Bell size={18} /> : <MessageCircle size={18} />}
          </div>
          <div className={styles.rowBody}>
            <div className={styles.rowTitleLine}>
              <span className={styles.rowTitle}>{n.title}</span>
              <span className={styles.rowTime}>{relativeTime(n.created_at, t)}</span>
            </div>
            {n.body && <div className={styles.rowText}>{n.body}</div>}
          </div>
          {!n.is_read && <span className={styles.unreadDot} />}
        </button>
      </div>
    </div>
  );
}
