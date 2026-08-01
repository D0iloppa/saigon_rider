import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, MessageSquare } from 'lucide-react';
import { repairApi } from '@/api/info';
import type { RepairReview } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { ReviewCard } from './InfoRepairDetail';
import sys from '@/styles/system.module.css';
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
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    if (!shopId) return;
    repairApi.getReviews(Number(shopId), 0, PAGE_SIZE)
      .then((r) => { setReviews(r.reviews); setTotal(r.total); setHasMore(r.has_more); })
      .catch(() => setError(true)) // 조회 실패를 "리뷰 없음"처럼 보이게 하지 않는다
      .finally(() => setLoading(false));
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  const retry = () => {
    setLoading(true);
    setError(false);
    load();
  };

  function loadMore() {
    if (!shopId || loadingMore) return;
    setLoadingMore(true);
    repairApi.getReviews(Number(shopId), reviews.length, PAGE_SIZE)
      .then((r) => { setReviews((prev) => [...prev, ...r.reviews]); setHasMore(r.has_more); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  return (
    <div className={sys.page}>
      <TopBar title={t('info.repair.allReviewsTitle')} onBack={() => navigate(-1)} />
      <div className={`${sys.scroll} ${styles.scrollPad}`}>
        {loading ? (
          <div className={`${sys.card} ${styles.topGap}`}>
            <SkeletonRows count={4} />
          </div>
        ) : error ? (
          <div className={`${sys.card} ${styles.topGap}`}>
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('info.repair.loadError', '정보를 불러오지 못했습니다')}
              actionLabel={t('common.retry', '다시 시도')}
              onAction={retry}
            />
          </div>
        ) : reviews.length === 0 ? (
          <div className={`${sys.card} ${styles.topGap}`}>
            <StateBlock icon={MessageSquare} title={t('info.repair.noReviews')} />
          </div>
        ) : (
          <>
            <div className={sys.sectionHead}>
              <span className={sys.sectionLabel}>{t('info.repair.reviewsTitle', { count: total })}</span>
            </div>
            <div className={`${sys.card} ${styles.listCard}`}>
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
