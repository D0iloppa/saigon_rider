import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Heart } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { fetchFeed } from '@/api/feed';
import type { FeedPost } from '@/api/types';
import { FeedPostCard } from '@/pages/feed/FeedPostCard';
import { useCheerToggle } from '@/pages/feed/useCheerToggle';
import feedStyles from '@/pages/feed/FeedList.module.css';
import styles from './Community.module.css';

// 좋아요한 글 (F-CM-03 r13) — GET /feed?filter=liked, 1열 피드 카드.
export default function CommunityLiked() {
  const { t } = useTranslation();
  // 전부 내가 좋아요한 글이라 응원 상태를 켠 채로 보여준다(목록 API 는 iCheered 를 주지 않는다).
  // 해제로 로컬에서 제거된 만큼 page*size 오프셋이 어긋나므로, 2페이지부터는 로드된 개수를 오프셋으로 쓴다.
  const loadedRef = useRef(0);
  const fetchPage = useCallback(
    async (page: number) => {
      const res = await fetchFeed({ filter: 'liked', page, offset: page > 1 ? loadedRef.current : undefined });
      const before = page > 1 ? loadedRef.current : 0;
      // 해제로 줄어든 목록은 page*size 로 남은 양을 판단할 수 없다 — 로드된 개수 기준
      return { ...res, hasMore: before + res.items.length < res.total, items: res.items.map((p) => ({ ...p, iCheered: true })) };
    },
    [],
  );
  const { items: posts, setItems: setPosts, isLoading, isLoadingMore, hasMore, error, sentinelRef, reset } =
    useInfiniteScroll<FeedPost>(fetchPage, 20, []);
  loadedRef.current = posts.length;

  const handleCheer = useCheerToggle(setPosts, { removeOnUncheer: true });

  return (
    <div className={styles.page}>
      <TopBar title={t('communityGroup.likedPosts')} />
      <div className={styles.scroll}>
        {isLoading ? (
          <SkeletonRows count={3} />
        ) : error && posts.length === 0 ? (
          <StateBlock icon={AlertCircle} tone="error" title={t('feed.loadError')} actionLabel={t('common.retry')} onAction={reset} />
        ) : posts.length === 0 ? (
          <StateBlock icon={Heart} title={t('communityGroup.likedEmpty')} />
        ) : (
          <div className={feedStyles.postList} style={{ padding: '12px 20px 0' }} data-testid="liked-list">
            {posts.map((p) => <FeedPostCard key={p.id} p={p} onCheer={handleCheer} />)}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </div>
        )}
      </div>
    </div>
  );
}
