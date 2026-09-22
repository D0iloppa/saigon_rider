import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Newspaper } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { fetchMyFeed } from '@/api/feed';
import type { FeedPost } from '@/api/types';
import ProfileFeedCard from './ProfileFeedCard';
import sys from '@/styles/system.module.css';
import styles from './ProfilePosts.module.css';

/** 공개 프로필 '게시물' 더보기 — UserProfile.tsx 레일의 전체 목록 드릴다운.
 * FR-4 제안 ② — B 영역은 이동 성격만 둔다(P-1). 응원(즉시·가역)은 카드에서 제거했다
 * (FR-1 제안 ⑤와 동일 처분, ProfileFeedCard 참조). */
export default function ProfilePosts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const fetchPage = useCallback((page: number) => fetchMyFeed(userId!, page, 20), [userId]);
  const { items: posts, isLoading, isLoadingMore, hasMore, error, sentinelRef, reset } =
    useInfiniteScroll<FeedPost>(fetchPage, 20, [userId]);

  return (
    <div className={sys.page}>
      <TopBar title={t('userProfile.feedSection')} />
      <div className={`${sys.scroll} ${styles.scroll}`}>
        {isLoading ? (
          <SkeletonRows count={3} />
        ) : error ? (
          <StateBlock icon={AlertCircle} tone="error" title={t('userProfile.feedError')} actionLabel={t('common.retry')} onAction={reset} />
        ) : posts.length === 0 ? (
          // FR-4 제안 ③ — 빈 상태 CTA(B0-4): 타인 프로필이므로 생성이 아니라 레일로 되돌아가기
          <StateBlock
            icon={Newspaper}
            title={t('userProfile.feedEmpty')}
            actionLabel={t('common.back', { defaultValue: '뒤로' })}
            onAction={() => navigate(-1)}
          />
        ) : (
          <>
            <div className={styles.grid}>
              {posts.map((p) => (
                <ProfileFeedCard
                  key={p.id}
                  post={p}
                  onClick={() => navigate(`/feed/post/${p.id}`)}
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
