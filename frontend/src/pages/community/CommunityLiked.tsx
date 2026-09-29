import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Heart } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { fetchFeed, toggleCheer } from '@/api/feed';
import type { FeedPost } from '@/api/types';
import { toast } from '@/components/ui/Toast';
import { FeedPostCard } from '@/pages/feed/FeedPostCard';
import feedStyles from '@/pages/feed/FeedList.module.css';
import styles from './Community.module.css';

// 좋아요한 글 (F-CM-03 r13) — GET /feed?filter=liked, 1열 피드 카드.
export default function CommunityLiked() {
  const { t } = useTranslation();
  // 전부 내가 좋아요한 글이라 응원 상태를 켠 채로 보여준다(목록 API 는 iCheered 를 주지 않는다).
  const fetchPage = useCallback(
    async (page: number) => {
      const res = await fetchFeed({ filter: 'liked', page });
      return { ...res, items: res.items.map((p) => ({ ...p, iCheered: true })) };
    },
    [],
  );
  const { items: posts, setItems: setPosts, isLoading, isLoadingMore, hasMore, error, sentinelRef, reset } =
    useInfiniteScroll<FeedPost>(fetchPage, 20, []);

  const handleCheer = async (p: FeedPost, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { cheered, count } = await toggleCheer(p.id);
      // 좋아요 해제 시 목록에서 제거 — 서버 liked 집합과 로드 개수를 맞춰 다음 페이지 누락을 막는다.
      setPosts((prev) => cheered
        ? prev.map((x) => (x.id === p.id ? { ...x, iCheered: cheered, cheerCount: count } : x))
        : prev.filter((x) => x.id !== p.id));
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

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
