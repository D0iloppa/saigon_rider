import { useCallback, useEffect, useRef, useState } from 'react';

const THRESHOLD = 64;
const MAX_PULL = 88;

export interface UsePullToRefreshReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  pullDistance: number;
  isRefreshing: boolean;
  contentStyle: React.CSSProperties;
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
    if (el.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
    pullingRef.current = true;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pullingRef.current || isRefreshingRef.current) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy <= 0) { setPullDistance(0); return; }
    const clamped = Math.min(dy * 0.5, MAX_PULL);
    setPullDistance(clamped);
    if (clamped > 0) e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pullingRef.current || isRefreshingRef.current) return;
    pullingRef.current = false;

    if (pullDistance >= THRESHOLD) {
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      setPullDistance(THRESHOLD);
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

  const contentStyle: React.CSSProperties = {
    transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
    transition: 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)',
  };

  return { containerRef, pullDistance, isRefreshing, contentStyle };
}
