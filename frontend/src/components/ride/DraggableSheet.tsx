import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
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
  initialSnap?: Snap;
  embedded?: boolean;
  floatingTopLeft?: ReactNode;
  floatingTopRight?: ReactNode;
  floatingTopCenter?: ReactNode;
  midSnap?: number;
  maxHeight?: number | string;
  lockHeight?: boolean;
  midHeight?: number | string;
  onVisibleHeightChange?: (visibleHeight: number) => void;
  /** 정착 통지 — 스냅 확정 시에만 호출(매 프레임 아님). 소비자가 React 상태 커밋을 제스처당 1회로 줄일 때 사용 */
  onVisibleHeightSettle?: (visibleHeight: number) => void;
  /** 스냅 상태 변경 통지 — 접힘 전용 UI(지도 게이트 힌트 필 등) 게이팅용 */
  onSnapChange?: (snap: Snap) => void;
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
    initialSnap,
    embedded = false,
    floatingTopLeft,
    floatingTopRight,
    floatingTopCenter,
    midSnap,
    maxHeight,
    lockHeight = false,
    midHeight,
    onVisibleHeightChange,
    onVisibleHeightSettle,
    onSnapChange,
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
  // 정착(transitionend) 리스너 추적 — 발화하지 못한 채 잔존한 리스너가 과거 targetOffset 을
  // 캡처하고 있다가 나중 애니메이션 끝에 transform 을 되돌리는 누수 방지 (collapse 후 재상승 버그).
  const settleHandlerRef = useRef<((e: TransitionEvent) => void) | null>(null);

  const clearSettleHandler = useCallback(() => {
    if (settleHandlerRef.current && sheetRef.current) {
      sheetRef.current.removeEventListener('transitionend', settleHandlerRef.current);
    }
    settleHandlerRef.current = null;
  }, []);

  const [peek, setPeek] = useState(0);
  const [snap, setSnap] = useState<Snap>(initialSnap ?? (initialCollapsed ? 'collapsed' : 'full'));
  useEffect(() => { onSnapChange?.(snap); }, [onSnapChange, snap]);
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

  const emitVisibleHeightSettle = useCallback((offset: number) => {
    onVisibleHeightSettle?.(Math.max(0, sheetHeight - offset));
  }, [onVisibleHeightSettle, sheetHeight]);

  const animateTo = useCallback((targetOffset: number, distance: number) => {
    const el = sheetRef.current;
    if (!el) return;
    clearSettleHandler();
    // 무이동 정착(현재 transform ≈ target)이면 transition 이 시작되지 않아 transitionend 가
    // 영영 안 오므로, 리스너 없이 최종 상태만 직접 세팅한다 (최다 빈도 누수 경로).
    const match = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform);
    const currentOffset = match ? Number.parseFloat(match[1]) : null;
    if (currentOffset != null && Math.abs(currentOffset - targetOffset) < 0.5) {
      el.style.transition = '';
      el.style.transform = `translateY(${targetOffset}px)`;
      return;
    }
    const duration = Math.min(320, Math.max(180, 170 + distance * 0.12));
    el.style.transition = `transform ${duration}ms ${DRAG_EASING}`;
    void el.offsetHeight;
    el.style.transform = `translateY(${targetOffset}px)`;
    const onSettle = (e: TransitionEvent) => {
      // 자식 요소 transition 버블링 오발화 차단 — 시트 자신의 transform 완료만 정착 처리.
      if (e.target !== el || e.propertyName !== 'transform') return;
      el.removeEventListener('transitionend', onSettle);
      if (settleHandlerRef.current === onSettle) settleHandlerRef.current = null;
      el.style.transition = '';
      el.style.transform = `translateY(${targetOffset}px)`;
    };
    settleHandlerRef.current = onSettle;
    el.addEventListener('transitionend', onSettle);
  }, [clearSettleHandler]);

  useLayoutEffect(() => {
    if (drag.current.active || !sheetRef.current) return;
    clearSettleHandler(); // 목표 교체 — 이전 정착 리스너가 낡은 offset 을 되돌리지 못하게
    const offset = offsetOf(snap);
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = `translateY(${offset}px)`;
    emitVisibleHeight(offset);
    emitVisibleHeightSettle(offset);
  }, [clearSettleHandler, emitVisibleHeight, emitVisibleHeightSettle, offsetOf, snap, sheetHeight]);

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
    clearSettleHandler(); // 진행 중 transition 취소 — pending 정착 리스너도 함께 폐기
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
    emitVisibleHeightSettle(target.offset);
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
      {floatingTopCenter && <div className={styles.floatingTopCenter}>{floatingTopCenter}</div>}
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
