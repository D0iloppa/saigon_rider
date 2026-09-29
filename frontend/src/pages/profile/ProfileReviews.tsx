import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, MessageSquare, Star } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { Chip } from '@/components/ui/Chip';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { fetchUserReviews } from '@/api/profile';
import type { ProfileReview, ReviewTagCount } from '@/api/types';
import ProfileReviewRow, { reviewTagLabel } from './ProfileReviewRow';
import sys from '@/styles/system.module.css';
import styles from './ProfileReviews.module.css';

/** 공개 프로필 '받은 후기' 전체 목록 — 모든 별점 노출, 최신순 (F-P-01 FR-1 r11). */
export default function ProfileReviews() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [tagCounts, setTagCounts] = useState<ReviewTagCount[]>([]);
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(
    async (page: number) => {
      const res = await fetchUserReviews(userId!, page, 20);
      setAvgRating(res.avgRating);
      setTagCounts(res.tagCounts);
      setTotal(res.total);
      return res;
    },
    [userId],
  );
  const { items: reviews, isLoading, isLoadingMore, hasMore, error, sentinelRef, reset } =
    useInfiniteScroll<ProfileReview>(fetchPage, 20, [userId]);

  return (
    <div className={sys.page}>
      <TopBar title={t('userProfile.reviewsTitle')} />
      <div className={`${sys.scroll} ${styles.scroll}`}>
        {isLoading ? (
          <SkeletonRows count={3} />
        ) : error && reviews.length === 0 ? (
          <StateBlock icon={AlertCircle} tone="error" title={t('userProfile.reviewsError')} actionLabel={t('common.retry')} onAction={reset} />
        ) : reviews.length === 0 ? (
          <StateBlock icon={MessageSquare} title={t('userProfile.reviewsEmpty')} />
        ) : (
          <>
            <section className={styles.summary}>
              <div className={styles.summaryLine}>
                <Star size={18} />
                <span className="num">{avgRating === null ? '—' : avgRating.toFixed(1)}</span>
                <span className={styles.summaryCount}>· {t('userProfile.reviewCountValue', { count: total })}</span>
              </div>
              {tagCounts.length > 0 && (
                <div className={styles.tagRow}>
                  {tagCounts.map((c) => (
                    <Chip key={c.tag} variant="surface">{reviewTagLabel(t, c.tag)} {c.count}</Chip>
                  ))}
                </div>
              )}
            </section>
            <div className={styles.list}>
              {reviews.map((r) => (
                <ProfileReviewRow key={r.id} review={r} detailed onReviewerClick={() => navigate(`/profile/${r.reviewer.id}`)} />
              ))}
            </div>
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </>
        )}
      </div>
    </div>
  );
}
