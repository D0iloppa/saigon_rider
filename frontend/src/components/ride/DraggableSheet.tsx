import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import styles from './DraggableSheet.module.css';

export interface DraggableSheetHandle {
  collapse: () => void;
  expand: () => void;
}

interface DraggableSheetProps {
  /** 접힘(peek) 상태에서도 항상 보이는 영역 + 드래그 핸들 존. */
  header: ReactNode;
  /** 펼침 상태에서만 보이는 본문(접으면 아래로 숨김). */
  children: ReactNode;
}

/**
 * 2-스냅 드래그 바텀시트 (SGR-269 경로 화면).
 * 펼침 ↔ 접힘. 접으면 header(예상 도착·거리)만 남고 본문은 화면 아래로 내려간다.
 * peek 높이는 header 실측값 → ETA 행이 정확히 걸치도록.
 * collapse()/expand() 로 외부(예: 경로안내 시작)에서 스냅 제어 가능.
 */
const DraggableSheet = forwardRef<DraggableSheetHandle, DraggableSheetProps>(function DraggableSheet(
  { header, children },
  ref,
) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, startOffset: 0, active: false });
  const [peek, setPeek] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    if (headerRef.current) setPeek(headerRef.current.offsetHeight);
  }, []);

  useImperativeHandle(ref, () => ({
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
  }));

  const maxOffset = () => (sheetRef.current ? sheetRef.current.offsetHeight - peek : 0);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!sheetRef.current) return;
    drag.current = {
      startY: e.clientY,
      startOffset: collapsed ? maxOffset() : 0,
      active: true,
    };
    sheetRef.current.style.transition = 'none';
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current.active || !sheetRef.current) return;
    const max = maxOffset();
    const off = Math.min(max, Math.max(0, drag.current.startOffset + (e.clientY - drag.current.startY)));
    sheetRef.current.style.transform = `translateY(${off}px)`;
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag.current.active || !sheetRef.current) return;
    drag.current.active = false;
    const max = maxOffset();
    const off = Math.min(max, Math.max(0, drag.current.startOffset + (e.clientY - drag.current.startY)));
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = '';
    setCollapsed(off > max / 2);
  };

  return (
    <div
      ref={sheetRef}
      className={`${styles.sheet} ${collapsed ? styles.collapsed : ''}`}
      style={{ ['--peek' as string]: `${peek}px` }}
    >
      <div
        ref={headerRef}
        className={styles.dragZone}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className={styles.handle} />
        {header}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
});

export default DraggableSheet;
