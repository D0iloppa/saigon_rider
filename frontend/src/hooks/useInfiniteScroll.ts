import { useCallback, useEffect, useRef, useState } from 'react';

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface UseInfiniteScrollReturn<T> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  reset: () => void;
}

export function useInfiniteScroll<T>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  pageSize: number = 20,
  deps: unknown[] = [],
): UseInfiniteScrollReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 요청 시퀀스 토큰 — deps 변경으로 새 로드가 시작된 뒤 늦게 도착한 이전 응답이
  // setItems/hasMore/pageRef를 덮어쓰지 못하게 폐기한다.
  const reqSeqRef = useRef(0);

  const load = useCallback(async (page: number, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const seq = ++reqSeqRef.current;

    if (append) setIsLoadingMore(true);
    else setIsLoading(true);

    try {
      const res = await fetchPage(page);
      if (seq !== reqSeqRef.current) return; // 스테일 응답 폐기
      if (append) {
        setItems((prev) => [...prev, ...res.items]);
      } else {
        setItems(res.items);
      }
      pageRef.current = page;
      setHasMore(page * pageSize < res.total);
    } catch {
      // silently fail, keep existing items
    } finally {
      if (seq === reqSeqRef.current) {
        loadingRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [fetchPage, pageSize]);

  const reset = useCallback(() => {
    pageRef.current = 1;
    setItems([]);
    setHasMore(true);
    loadingRef.current = false;
    load(1, false);
  }, [load]);

  // initial load + deps change
  useEffect(() => {
    pageRef.current = 1;
    setItems([]);
    setHasMore(true);
    loadingRef.current = false;
    load(1, false);
  }, deps);

  // IntersectionObserver for sentinel
  // isLoading 의존성 필수: 센티넬은 로딩 완료 후에만 마운트되므로(비어있는 동안엔 스켈레톤만
  // 렌더), isLoading이 true→false로 바뀌는 시점에 재실행되지 않으면 sentinelRef.current가
  // 항상 null이던 첫 렌더 상태로 옵저버가 아예 안 붙는다(20개 이하일 땐 hasMore=false라
  // 안 드러나다가, 페이지가 여러 장이 되면 무한스크롤이 통째로 멈추는 버그였음).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current && hasMore) {
          load(pageRef.current + 1, true);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, load, isLoading]);

  return { items, setItems, isLoading, isLoadingMore, hasMore, sentinelRef, reset };
}
