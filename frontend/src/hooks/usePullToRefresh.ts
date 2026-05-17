import { useCallback, useEffect, useRef, useState } from 'react';

const THRESHOLD = 64;   // 당기는 임계값 (px)
const MAX_PULL = 88;    // 최대 당기기 거리 (px)

export interface UsePullToRefreshReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  pullDistance: number;   // 0 ~ MAX_PULL, 애니메이션용
  isRefreshing: boolean;
}

export function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
): UsePullToRefreshReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el || isRefreshingRef.current) return;
    if (el.scrollTop > 0) return; // 스크롤 내려간 상태면 무시
    startYRef.current = e.touches[0].clientY;
    pullingRef.current = true;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pullingRef.current || isRefreshingRef.current) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy <= 0) { setPullDistance(0); return; }
    // 저항감: 실제 이동의 절반만 반영
    const clamped = Math.min(dy * 0.5, MAX_PULL);
    setPullDistance(clamped);
    if (clamped > 0) e.preventDefault(); // 네이티브 스크롤 방지
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pullingRef.current || isRefreshingRef.current) return;
    pullingRef.current = false;

    if (pullDistance >= THRESHOLD) {
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      setPullDistance(THRESHOLD); // 임계값 위치에 고정
      try {
        await onRefresh();
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, pullDistance, isRefreshing };
}
