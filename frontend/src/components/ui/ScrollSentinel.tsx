import styles from './ScrollSentinel.module.css';

interface Props {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  isLoadingMore: boolean;
  hasMore: boolean;
}

export function ScrollSentinel({ sentinelRef, isLoadingMore, hasMore }: Props) {
  return (
    <div ref={sentinelRef as React.RefObject<HTMLDivElement>} className={styles.sentinel}>
      {isLoadingMore && (
        <div className={styles.spinner} />
      )}
      {!hasMore && !isLoadingMore && (
        <div className={styles.end} />
      )}
    </div>
  );
}
