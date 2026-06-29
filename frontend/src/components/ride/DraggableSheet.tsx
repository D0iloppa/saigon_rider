import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styles from './DraggableSheet.module.css';

export interface DraggableSheetHandle {
  collapse: () => void;
  expand: () => void;
  snapToMid: () => void;
}

type Snap = 'full' | 'mid' | 'collapsed';

interface DraggableSheetProps {
  header: ReactNode;
  children: ReactNode;
  initialCollapsed?: boolean;
  embedded?: boolean;
  floatingTopLeft?: ReactNode;
  floatingTopRight?: ReactNode;
  midSnap?: number;
  maxHeight?: number | string;
  lockHeight?: boolean;
  midHeight?: number | string;
  onVisibleHeightChange?: (visibleHeight: number) => void;
}

const DRAG_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const FLICK_VELOCITY = 0.42;

function resolveLength(value: number | string | undefined, viewportHeight: number, fallback: number): number {
  if (typeof value === 'number') return value;
  if (!value) return fallback;
  const trimmed = value.trim();
  if (trimmed.endsWith('vh')) return (Number.parseFloat(trimmed) / 100) * viewportHeight;
  if (trimmed.endsWith('px')) return Number.parseFloat(trimmed);
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DraggableSheet = forwardRef<DraggableSheetHandle, DraggableSheetProps>(function DraggableSheet(
  {
    header,
    children,
    initialCollapsed = false,
    embedded = false,
    floatingTopLeft,
    floatingTopRight,
    midSnap,
    maxHeight,
    lockHeight = false,
    midHeight,
    onVisibleHeightChange,
  },
  ref,
) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef({
    active: false,
    startY: 0,
    startOffset: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
  });

  const [peek, setPeek] = useState(0);
  const [snap, setSnap] = useState<Snap>(initialCollapsed ? 'collapsed' : 'full');
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 1000));

  useLayoutEffect(() => {
    if (!headerRef.current) return;
    const measure = () => setPeek(headerRef.current?.offsetHeight ?? 0);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const expandedPx = useMemo(() => {
    const fallback = viewportHeight * (embedded ? 0.8 : 0.5);
    return resolveLength(maxHeight, viewportHeight, fallback);
  }, [embedded, maxHeight, viewportHeight]);

  const sheetHeight = useMemo(() => Math.max(peek, expandedPx), [expandedPx, peek]);
  const midVisiblePx = useMemo(() => {
    const fallback = peek + (sheetHeight - peek) * (1 - (midSnap ?? 0.5));
    const raw = midHeight != null ? resolveLength(midHeight, viewportHeight, fallback) : fallback;
    return Math.min(sheetHeight, Math.max(peek, raw));
  }, [midHeight, midSnap, peek, sheetHeight, viewportHeight]);

  const offsetOf = useCallback((next: Snap) => {
    const visible = next === 'full' ? sheetHeight : next === 'mid' ? midVisiblePx : peek;
    return Math.max(0, sheetHeight - visible);
  }, [midVisiblePx, peek, sheetHeight]);

  const emitVisibleHeight = useCallback((offset: number) => {
    onVisibleHeightChange?.(Math.max(0, sheetHeight - offset));
  }, [onVisibleHeightChange, sheetHeight]);

  const animateTo = useCallback((targetOffset: number, distance: number) => {
    if (!sheetRef.current) return;
    const duration = Math.min(320, Math.max(180, 170 + distance * 0.12));
    sheetRef.current.style.transition = `transform ${duration}ms ${DRAG_EASING}`;
    void sheetRef.current.offsetHeight;
    sheetRef.current.style.transform = `translateY(${targetOffset}px)`;
    sheetRef.current.addEventListener('transitionend', () => {
      if (!sheetRef.current) return;
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = `translateY(${targetOffset}px)`;
    }, { once: true });
  }, []);

  useLayoutEffect(() => {
    if (drag.current.active || !sheetRef.current) return;
    const offset = offsetOf(snap);
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = `translateY(${offset}px)`;
    emitVisibleHeight(offset);
  }, [emitVisibleHeight, offsetOf, snap, sheetHeight]);

  useImperativeHandle(ref, () => ({
    collapse: () => setSnap('collapsed'),
    expand: () => setSnap('full'),
    snapToMid: () => setSnap('mid'),
  }));

  const orderedSnaps = useMemo(
    () => (['full', 'mid', 'collapsed'] as Snap[]).map((item) => ({ snap: item, offset: offsetOf(item) })),
    [offsetOf],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!sheetRef.current) return;
    const now = performance.now();
    drag.current = {
      active: true,
      startY: e.clientY,
      startOffset: offsetOf(snap),
      lastY: e.clientY,
      lastT: now,
      velocity: 0,
    };
    sheetRef.current.style.transition = 'none';
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current.active || !sheetRef.current) return;
    const now = performance.now();
    const dy = e.clientY - drag.current.lastY;
    const dt = Math.max(1, now - drag.current.lastT);
    drag.current.velocity = drag.current.velocity * 0.72 + (dy / dt) * 0.28;
    drag.current.lastY = e.clientY;
    drag.current.lastT = now;

    const minOffset = orderedSnaps[0].offset;
    const maxOffset = orderedSnaps[orderedSnaps.length - 1].offset;
    const nextOffset = drag.current.startOffset + (e.clientY - drag.current.startY);
    const bounded = nextOffset < minOffset
      ? minOffset
      : nextOffset > maxOffset
        ? maxOffset + (nextOffset - maxOffset) * 0.22
        : nextOffset;
    sheetRef.current.style.transform = `translateY(${bounded}px)`;
    emitVisibleHeight(Math.min(maxOffset, Math.max(minOffset, bounded)));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const off = drag.current.startOffset + (e.clientY - drag.current.startY);
    const nearestIndex = orderedSnaps.reduce(
      (best, item, idx, arr) => (Math.abs(off - item.offset) < Math.abs(off - arr[best].offset) ? idx : best),
      0,
    );
    let targetIndex = nearestIndex;
    if (drag.current.velocity <= -FLICK_VELOCITY) targetIndex = Math.max(0, nearestIndex - 1);
    else if (drag.current.velocity >= FLICK_VELOCITY) targetIndex = Math.min(orderedSnaps.length - 1, nearestIndex + 1);
    const target = orderedSnaps[targetIndex];
    animateTo(target.offset, Math.abs(target.offset - off));
    setSnap(target.snap);
    emitVisibleHeight(target.offset);
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <div
      ref={sheetRef}
      className={`${styles.sheet} ${embedded ? styles.embedded : ''} ${lockHeight ? styles.lockHeight : ''}`}
      style={{
        ['--peek' as string]: `${peek}px`,
        ['--sheet-max-height' as string]: `${sheetHeight}px`,
      }}
    >
      {floatingTopLeft && <div className={styles.floatingTopLeft}>{floatingTopLeft}</div>}
      {floatingTopRight && <div className={styles.floatingTopRight}>{floatingTopRight}</div>}
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
      <div ref={bodyRef} className={styles.body}>
        {children}
      </div>
    </div>
  );
});

export default DraggableSheet;
