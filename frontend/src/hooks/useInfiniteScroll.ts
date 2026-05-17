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

  const load = useCallback(async (page: number, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    if (append) setIsLoadingMore(true);
    else setIsLoading(true);

    try {
      const res = await fetchPage(page);
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
      loadingRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
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
  }, [hasMore, load]);

  return { items, setItems, isLoading, isLoadingMore, hasMore, sentinelRef, reset };
}
