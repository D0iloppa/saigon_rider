import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { repairApi } from '@/api/info';
import type { RepairReview } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { ReviewCard } from './InfoRepairDetail';
import styles from './InfoRepairReviews.module.css';

const PAGE_SIZE = 20;

export default function InfoRepairReviews() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shopId } = useParams<{ shopId: string }>();

  const [reviews, setReviews] = useState<RepairReview[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!shopId) return;
    repairApi.getReviews(Number(shopId), 0, PAGE_SIZE)
      .then((r) => { setReviews(r.reviews); setTotal(r.total); setHasMore(r.has_more); })
      .finally(() => setLoading(false));
  }, [shopId]);

  function loadMore() {
    if (!shopId || loadingMore) return;
    setLoadingMore(true);
    repairApi.getReviews(Number(shopId), reviews.length, PAGE_SIZE)
      .then((r) => { setReviews((prev) => [...prev, ...r.reviews]); setHasMore(r.has_more); })
      .finally(() => setLoadingMore(false));
  }

  return (
    <div className={styles.page}>
      <TopBar title={t('info.repair.allReviewsTitle')} onBack={() => navigate(-1)} />
      <div className={styles.scroll}>
        {loading ? (
          [0, 1, 2, 3].map((i) => <div key={i} className={styles.skeleton} />)
        ) : reviews.length === 0 ? (
          <div className={styles.empty}>{t('info.repair.noReviews')}</div>
        ) : (
          <>
            <div className={styles.countLine}>
              {t('info.repair.reviewsTitle', { count: total })}
            </div>
            <div className={styles.list}>
              {reviews.map((r) => (
                <ReviewCard key={r.review_id} review={r} />
              ))}
            </div>
            {hasMore && (
              <button className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t('info.repair.ctaSubmitting') : t('info.repair.loadMore')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
