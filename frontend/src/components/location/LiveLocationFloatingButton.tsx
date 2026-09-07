import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPinned } from 'lucide-react';
import { useLocationChannelStore } from '@/store/useLocationChannelStore';
import { useFloatingBubbleZOrderStore } from '@/store/useFloatingBubbleZOrderStore';
import { getTopSafeAreaPx } from '@/lib/safeArea';
import { useLiveLocationChannelRuntime } from './useLiveLocationChannelRuntime';
import { LiveLocationModal } from './LiveLocationModal';
import styles from './LiveLocationFloatingButton.module.css';

const BUBBLE_SIZE = 56;
const MARGIN = 12;
/** 겹침 순서 — 마지막에 터치한 버블이 상대(기본 60)보다 위로 올라온다. */
const BUBBLE_Z_ID = 'liveLocation';
/**
 * 기본 위치 — 워키토키 캡슐(우측 끝, 세로 55%)과 겹치지 않게 그 **아래**(캡슐 높이 46 + 간격)에 둔다.
 * 두 채널 동시 참가 시 나란히 공존(설계 §2 추가 확정).
 */
const DEFAULT_Y_OFFSET = 72;

/**
 * 실시간 위치공유 플로팅 🗺️ 버튼 — 채널 참가 중 화면 어디서나 표시(App.tsx 전역 마운트).
 * 드래그 자유 배치(화면 경계 클램프만, 워키토키 캡슐과 동일 패턴), 탭 → 채널 모달.
 * 채널 런타임(SSE·위치 ping)도 여기서 구동한다 — 앱 전역 1곳.
 */
export function LiveLocationFloatingButton() {
  const { t } = useTranslation();
  useLiveLocationChannelRuntime();
  const conversationId = useLocationChannelStore((s) => s.conversationId);
  const state = useLocationChannelStore((s) => s.state);
  const connected = useLocationChannelStore((s) => s.connected);
  const modalOpen = useLocationChannelStore((s) => s.modalOpen);
  const setModalOpen = useLocationChannelStore((s) => s.setModalOpen);
  const topId = useFloatingBubbleZOrderStore((s) => s.topId);
  const bringToFront = useFloatingBubbleZOrderStore((s) => s.bringToFront);

  const [pos, setPos] = useState(() => ({
    x: Math.max(window.innerWidth - BUBBLE_SIZE - MARGIN, 0),
    y: Math.max(
      Math.min(Math.round(window.innerHeight * 0.55) + DEFAULT_Y_OFFSET, window.innerHeight - BUBBLE_SIZE - MARGIN),
      getTopSafeAreaPx(),
    ),
  }));
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      bringToFront(BUBBLE_Z_ID);
      draggingRef.current = true;
      dragMovedRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
      setDragging(true);
    },
    [bringToFront, pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (!dragMovedRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      dragMovedRef.current = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
    // y 하한은 0 이 아니라 상단 safe-area — 노치/다이나믹아일랜드/상태바에 버블이 가려지지 않게.
    setPos({
      x: Math.min(Math.max(dragStartRef.current.posX + dx, 0), window.innerWidth - BUBBLE_SIZE),
      y: Math.min(Math.max(dragStartRef.current.posY + dy, getTopSafeAreaPx()), window.innerHeight - BUBBLE_SIZE),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
  }, []);

  const onClick = useCallback(() => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    setModalOpen(true);
  }, [setModalOpen]);

  if (!conversationId) return null;

  // 모달이 열려있는 동안엔 버블을 숨긴다 — 모달 위에 자기 진입점이 떠 있을 이유가 없다.
  if (modalOpen) return <LiveLocationModal />;

  const activeCount = state ? state.members.filter((m) => !m.leftAt).length : 0;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={styles.bubble}
        data-dragging={dragging || undefined}
        data-connected={connected || undefined}
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${dragging ? 1.06 : 1})`,
          zIndex: topId === BUBBLE_Z_ID ? 61 : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        aria-label={t('liveLocation.bubbleLabel', { defaultValue: '실시간 위치공유' })}
      >
        <MapPinned size={22} strokeWidth={2} />
        {activeCount > 0 && <span className={`${styles.badge} num`}>{activeCount}</span>}
        <span className={styles.liveDot} aria-hidden />
      </div>
      <LiveLocationModal />
    </>
  );
}
