import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, Banknote, Camera, Clock, MapPin, Phone, ThumbsUp } from 'lucide-react';
import { repairApi } from '@/api/info';
import type { RepairDetail, RepairReview } from '@/api/info';
import { native } from '@/lib/native';
import { TopBar } from '@/components/layout/TopBar';
import { StarIcon } from '@/components/ui/StarIcon';
import StateBlock from '@/components/ui/StateBlock';
import sys from '@/styles/system.module.css';
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
          {review.source === 'GOOGLE' && (
            <span
              title="Google 리뷰"
              aria-label="Google review"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
            >
              <svg width="13" height="13" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#5f6368' }}>Google</span>
            </span>
          )}
          <span className={styles.reviewRating}>
            <StarIcon size={12} />
            <b className="num">{review.rating}</b>
          </span>
        </div>
        <span className={styles.reviewDate}>{dateStr}</span>
      </div>

      <div className={styles.reviewBadges}>
        {review.motorcycle_model && (
          <span className={styles.reviewBadge}>{review.motorcycle_model}</span>
        )}
        {review.service_code && (
          <span className={styles.reviewBadge}>
            {t(`info.repair.service_${review.service_code}`, review.service_code)}
          </span>
        )}
        {review.price_vnd !== null && (
          <span className={`${styles.reviewPrice} num`}>
            {review.price_vnd.toLocaleString()} ₫
          </span>
        )}
      </div>

      {review.comment && (
        <div className={styles.reviewComment}>"{review.comment}"</div>
      )}

      <div className={styles.reviewUpvote}>
        <ThumbsUp size={13} strokeWidth={2} />
        <span className={`${styles.upvoteCount} num`}>{review.upvotes}</span>
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

  const load = useCallback(() => {
    if (!shopId) return;
    repairApi.getDetail(Number(shopId))
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  const retry = () => {
    setLoading(true);
    load();
  };

  const shop = detail?.shop;
  const stats = detail?.stats;

  if (loading) {
    return (
      <div className={sys.page}>
        <TopBar title={t('info.repair.detailTitle')} onBack={() => navigate(-1)} />
        <div className={sys.scroll}>
          <div className={styles.skeletonHero} />
          <div className={`${sys.card} ${styles.skelCard}`}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={sys.skelRow}>
                <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className={sys.page}>
        <TopBar title={t('info.repair.detailTitle')} onBack={() => navigate(-1)} />
        <StateBlock
          icon={AlertCircle}
          tone="error"
          title={t('info.repair.errorLoad')}
          actionLabel={t('common.retry')}
          onAction={retry}
        />
      </div>
    );
  }

  return (
    <div className={sys.page}>
      <div className={sys.scroll}>
        {/* Hero — 사진 준비 전 플레이스홀더 (가짜 슬라이드 표시는 두지 않는다) */}
        <div className={styles.heroArea}>
          <div className={styles.transparentBar}>
            <button className={styles.transparentBtn} onClick={() => navigate(-1)} aria-label={t('common.back')}>
              <ArrowLeft size={18} strokeWidth={2.2} />
            </button>
          </div>
          <div className={styles.heroInner}>
            <Camera size={44} strokeWidth={1.5} />
          </div>
        </div>

        {/* Info block */}
        <div className={styles.infoBlock}>
          <div className={styles.shopName}>{shop.name}</div>
          <div className={styles.shopAddr}>
            {shop.district_code && `${shop.district_code}, `}Hồ Chí Minh
          </div>

          {stats && (
            <div className={styles.ratingRow}>
              <span className={styles.ratingVal}>
                <StarIcon size={14} />
                <b className="num">{stats.avg_rating?.toFixed(1) ?? '—'}</b>
              </span>
              <span className={styles.ratingCount}>({stats.review_count} {t('info.repair.reviewCount')})</span>
              <span className={`${sys.miniBadge} ${sys.badgeSafe}`}>{t('info.repair.priceReasonable')}</span>
            </div>
          )}

          {shop.phone && (
            <div className={styles.infoRow}>
              <Phone size={14} strokeWidth={2} className={styles.infoIcon} />
              <span className={`${styles.infoText} num`}>{shop.phone}</span>
            </div>
          )}

          {shop.opening_hours && (
            <div className={styles.infoRow}>
              <Clock size={14} strokeWidth={2} className={styles.infoIcon} />
              <span className={`${styles.infoText} num`}>{shop.opening_hours}</span>
            </div>
          )}

          {shop.street_name && (
            <div className={styles.infoRow}>
              <MapPin size={14} strokeWidth={2} className={styles.infoIcon} />
              <span className={styles.infoText}>{shop.street_name}</span>
            </div>
          )}

          {/* 3-button grid */}
          <div className={styles.actionGrid}>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnBrand}`}
              disabled={!shop.phone}
              onClick={() => shop.phone && native.openUrl(`tel:${shop.phone}`)}
            >{t('info.repair.callBtn')}</button>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnTint}`}
              onClick={() => navigate(`/ride-nav?name=${encodeURIComponent(shop.name)}&lat=${shop.lat}&lng=${shop.lng}&dist=${shop.distance_km.toFixed(1)}`)}
            >{t('info.repair.routeBtn')}</button>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnNeutral}`}
              onClick={() => native.share({ title: shop.name, text: shop.street_name ?? shop.name, url: window.location.href })}
            >{t('info.repair.shareBtn')}</button>
          </div>
        </div>

        <div className={styles.dividerThick} />

        {/* Price table */}
        {detail.price_by_service && Object.keys(detail.price_by_service).length > 0 && (
          <div className={styles.priceSection}>
            <div className={styles.sectionTitle}>
              <Banknote size={14} strokeWidth={2} className={styles.sectionIcon} />
              {t('info.repair.priceTitle')}
            </div>
            {Object.entries(detail.price_by_service).map(([code, price]) => (
              <div key={code} className={styles.priceRow}>
                <span className={styles.priceLabel}>
                  {t(`info.repair.service_${code}`, code)}
                </span>
                <span className={`${styles.priceVal} num`}>{price.toLocaleString()} ₫</span>
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
          <div className={`${styles.reviewCtaBtn} num`}>+50 RP</div>
        </div>
      </div>
    </div>
  );
}
