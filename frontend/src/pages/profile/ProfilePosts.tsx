import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Newspaper } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { toast } from '@/components/ui/Toast';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { fetchMyFeed, toggleCheer } from '@/api/feed';
import type { FeedPost } from '@/api/types';
import ProfileFeedCard from './ProfileFeedCard';
import sys from '@/styles/system.module.css';
import styles from './ProfilePosts.module.css';

/** 공개 프로필 '게시물' 더보기 — UserProfile.tsx 레일의 전체 목록 드릴다운. */
export default function ProfilePosts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const fetchPage = useCallback((page: number) => fetchMyFeed(userId!, page, 20), [userId]);
  const { items: posts, setItems: setPosts, isLoading, isLoadingMore, hasMore, error, sentinelRef, reset } =
    useInfiniteScroll<FeedPost>(fetchPage, 20, [userId]);

  async function handleCheer(post: FeedPost, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { cheered, count } = await toggleCheer(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, iCheered: cheered, cheerCount: count } : p)));
    } catch {
      // 조용한 실패 + unhandled rejection 을 남기지 않는다.
      toast.error(t('feed.cheerError', { defaultValue: '잠시 후 다시 시도해 주세요' }));
    }
  }

  return (
    <div className={sys.page}>
      <TopBar title={t('userProfile.feedSection')} />
      <div className={`${sys.scroll} ${styles.scroll}`}>
        {isLoading ? (
          <SkeletonRows count={3} />
        ) : error ? (
          <StateBlock icon={AlertCircle} tone="error" title={t('userProfile.feedError')} actionLabel={t('common.retry')} onAction={reset} />
        ) : posts.length === 0 ? (
          <StateBlock icon={Newspaper} title={t('userProfile.feedEmpty')} />
        ) : (
          <>
            <div className={styles.grid}>
              {posts.map((p) => (
                <ProfileFeedCard
                  key={p.id}
                  post={p}
                  onClick={() => navigate(`/feed/post/${p.id}`)}
                  onCheer={(e) => void handleCheer(p, e)}
                />
              ))}
            </div>
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </>
        )}
      </div>
    </div>
  );
}
