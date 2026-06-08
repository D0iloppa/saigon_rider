import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { repairApi } from '@/api/info';
import type { RepairDetail, RepairReview } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import styles from './InfoRepairDetail.module.css';

export function ReviewCard({ review }: { review: RepairReview }) {
  const { t } = useTranslation();
  const diff = Date.now() - new Date(review.reviewed_at).getTime();
  const days = Math.floor(diff / 86400000);
  const dateStr = days === 0
    ? t('common.today')
    : days === 1
    ? t('common.yesterday')
    : t('common.daysAgo', { count: days });

  const name = review.is_anonymous
    ? t('info.repair.anonymous')
    : (review.reviewer_nickname ?? t('info.repair.anonymous'));

  return (
    <div className={styles.reviewCard}>
      <div className={styles.reviewHeader}>
        <div className={styles.reviewLeft}>
          <span className={styles.reviewerName}>{name}</span>
          <span className={`${styles.mono} ${styles.reviewRating}`}>⭐ {review.rating}</span>
        </div>
        <span className={styles.reviewDate}>{dateStr}</span>
      </div>

      <div className={styles.reviewBadges}>
        {review.motorcycle_model && (
          <span className={styles.reviewBadge}>{review.motorcycle_model}</span>
        )}
        <span className={styles.reviewBadge}>
          {t(`info.repair.service_${review.service_code}`, review.service_code)}
        </span>
        {review.price_vnd !== null && (
          <span className={`${styles.mono} ${styles.reviewPrice}`}>
            {review.price_vnd.toLocaleString()} ₫
          </span>
        )}
      </div>

      {review.comment && (
        <div className={styles.reviewComment}>"{review.comment}"</div>
      )}

      <div className={styles.reviewUpvote}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8E9E" strokeWidth="2" strokeLinecap="round">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
        </svg>
        <span className={styles.upvoteCount}>{review.upvotes}</span>
      </div>
    </div>
  );
}

export default function InfoRepairDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shopId } = useParams<{ shopId: string }>();

  const [detail, setDetail] = useState<RepairDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    repairApi.getDetail(Number(shopId))
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [shopId]);

  const shop = detail?.shop;
  const stats = detail?.stats;

  const transparentTopBar = (
    <div className={styles.transparentBar}>
      <button className={styles.transparentBtn} onClick={() => navigate(-1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>
      <div />
      <button className={styles.transparentBtn}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <TopBar title={t('info.repair.detailTitle')} onBack={() => navigate(-1)} />
        <div className={styles.scroll}>
          <div className={styles.skeletonHero} />
          <div className={styles.skeletonBody}>
            {[0, 1, 2, 3].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className={styles.page}>
        <TopBar title={t('info.repair.detailTitle')} onBack={() => navigate(-1)} />
        <div className={styles.errorMsg}>{t('info.repair.errorLoad')}</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        {/* Hero image area */}
        <div className={styles.heroArea}>
          {transparentTopBar}
          <div className={styles.heroInner}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity={0.4}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <div className={styles.slideIndicator}>
            <div className={styles.slideDotActive} />
            <div className={styles.slideDot} />
            <div className={styles.slideDot} />
          </div>
          <div className={styles.slideCount}>1 / 3</div>
        </div>

        {/* Info block */}
        <div className={styles.infoBlock}>
          <div className={styles.shopName}>{shop.name}</div>
          <div className={styles.shopAddr}>
            {shop.district_code && `${shop.district_code}, `}Hồ Chí Minh
          </div>

          {stats && (
            <div className={styles.ratingRow}>
              <span className={`${styles.mono} ${styles.ratingVal}`}>⭐ {stats.avg_rating.toFixed(1)}</span>
              <span className={styles.ratingCount}>({stats.review_count} {t('info.repair.reviewCount')})</span>
              <span className={styles.badgeSafe}>{t('info.repair.priceReasonable')}</span>
            </div>
          )}

          {shop.phone && (
            <div className={styles.infoRow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4A4F62" strokeWidth="2" strokeLinecap="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.71 12 19.79 19.79 0 0 1 1.65 3.38 2 2 0 0 1 3.64 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.1a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z"/>
              </svg>
              <span className={`${styles.infoText} ${styles.mono}`}>{shop.phone}</span>
            </div>
          )}

          {shop.opening_hours && (
            <div className={styles.infoRow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4A4F62" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span className={styles.infoText}>{shop.opening_hours}</span>
            </div>
          )}

          {shop.street_name && (
            <div className={styles.infoRow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4A4F62" strokeWidth="2" strokeLinecap="round">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span className={styles.infoText}>{shop.street_name}</span>
            </div>
          )}

          {/* 3-button grid */}
          <div className={styles.actionGrid}>
            <button className={`${styles.actionBtn} ${styles.actionBtnBrand}`}>{t('info.repair.callBtn')}</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnInfo}`}>{t('info.repair.routeBtn')}</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnNeutral}`}>{t('info.repair.shareBtn')}</button>
          </div>
        </div>

        <div className={styles.dividerThick} />

        {/* Price table */}
        {detail.price_by_service && Object.keys(detail.price_by_service).length > 0 && (
          <div className={styles.priceSection}>
            <div className={styles.sectionTitle}>💵 {t('info.repair.priceTitle')}</div>
            {Object.entries(detail.price_by_service).map(([code, price]) => (
              <div key={code} className={styles.priceRow}>
                <span className={styles.priceLabel}>
                  {t(`info.repair.service_${code}`, code)}
                </span>
                <span className={`${styles.mono} ${styles.priceVal}`}>{price.toLocaleString()} ₫</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.dividerThick} />

        {/* Reviews */}
        <div className={styles.reviewSection}>
          <div className={styles.reviewSectionHead}>
            <div className={styles.sectionTitle}>
              {t('info.repair.reviewsTitle', { count: stats?.review_count ?? detail.recent_reviews.length })}
            </div>
            {(stats?.review_count ?? detail.recent_reviews.length) > 0 && (
              <button
                className={styles.viewAllLink}
                onClick={() => navigate(`/info/repair/${shopId}/reviews`)}
              >
                {t('info.repair.viewAllReviews')}
              </button>
            )}
          </div>
          {detail.recent_reviews.map((r) => (
            <ReviewCard key={r.review_id} review={r} />
          ))}
        </div>

        {/* Review CTA */}
        <div className={styles.reviewCta} onClick={() => navigate(`/info/repair/${shopId}/write`)}>
          <div>
            <div className={styles.reviewCtaTitle}>{t('info.repair.writeReviewCta')}</div>
            <div className={styles.reviewCtaSub}>{t('info.repair.maxXpEarn')}</div>
          </div>
          <div className={styles.reviewCtaBtn}>+50 RP</div>
        </div>
      </div>
    </div>
  );
}
