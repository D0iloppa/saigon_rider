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

type Snap = 'full' | 'mid' | 'collapsed';

interface DraggableSheetProps {
  /** 접힘(peek) 상태에서도 항상 보이는 영역 + 드래그 핸들 존. */
  header: ReactNode;
  /** 펼침 상태에서만 보이는 본문(접으면 아래로 숨김). */
  children: ReactNode;
  /** 최초 렌더를 접힘 상태로 시작. (기본: 펼침) */
  initialCollapsed?: boolean;
  /** TabBar 등 다른 하단 크롬 위에 얹힐 때 — safe-area 여백 제거(펼침 시 헤더↔본문 빈 패딩 방지). */
  embedded?: boolean;
  /** 시트 상단 가장자리 바로 위(우측)에 떠서 시트와 함께 움직이는 요소(예: 내 위치 버튼). */
  floatingTopRight?: ReactNode;
  /**
   * 중간 스냅 비율(0~1). 지정 시 full ↔ mid ↔ collapsed 3-스냅.
   * mid 가시 높이 ≈ peek + (sheet-peek)·(1-midSnap). 예: 0.5 → 대략 카드 2개.
   */
  midSnap?: number;
}

/**
 * 드래그 바텀시트 (SGR-269). 기본 2-스냅(펼침 ↔ 접힘), midSnap 지정 시 3-스냅.
 * 접으면 header(peek)만 남고 본문은 화면 아래로. peek 높이는 header 실측값.
 * 중간/접힘 transform 은 calc((100% - peek)·비율) 로 px 측정 없이 처리.
 * collapse()/expand() 로 외부에서 스냅 제어 가능.
 */
const DraggableSheet = forwardRef<DraggableSheetHandle, DraggableSheetProps>(function DraggableSheet(
  { header, children, initialCollapsed = false, embedded = false, floatingTopRight, midSnap },
  ref,
) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, startOffset: 0, active: false });
  const [peek, setPeek] = useState(0);
  const [snap, setSnap] = useState<Snap>(initialCollapsed ? 'collapsed' : 'full');

  useLayoutEffect(() => {
    if (headerRef.current) setPeek(headerRef.current.offsetHeight);
  }, []);

  useImperativeHandle(ref, () => ({
    collapse: () => setSnap('collapsed'),
    expand: () => setSnap('full'),
  }));

  const maxOffset = () => (sheetRef.current ? sheetRef.current.offsetHeight - peek : 0);
  const midFrac = midSnap ?? 0.5;
  // 스냅별 px 오프셋(0 = 펼침, max = 접힘)
  const offsetOf = (s: Snap) => (s === 'full' ? 0 : s === 'collapsed' ? maxOffset() : maxOffset() * midFrac);
  const snaps: Snap[] = midSnap != null ? ['full', 'mid', 'collapsed'] : ['full', 'collapsed'];

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!sheetRef.current) return;
    drag.current = { startY: e.clientY, startOffset: offsetOf(snap), active: true };
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
    // 가장 가까운 스냅으로
    const nearest = snaps.reduce((best, s) =>
      Math.abs(off - offsetOf(s)) < Math.abs(off - offsetOf(best)) ? s : best,
    );
    setSnap(nearest);
  };

  const snapClass = snap === 'collapsed' ? styles.collapsed : snap === 'mid' ? styles.mid : '';

  return (
    <div
      ref={sheetRef}
      className={`${styles.sheet} ${snapClass} ${embedded ? styles.embedded : ''}`}
      style={{ ['--peek' as string]: `${peek}px`, ['--mid-frac' as string]: `${midFrac}` }}
    >
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
      <div className={styles.body}>{children}</div>
    </div>
  );
});

export default DraggableSheet;
