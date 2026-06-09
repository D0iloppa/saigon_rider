import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { repairApi, type RepairDetail } from '@/api/info';
import { ReviewCard } from '@/pages/info/InfoRepairDetail';
import styles from './RepairShopSheet.module.css';

interface Props {
  shopId: number;
  onClose: () => void;
}

export default function RepairShopSheet({ shopId, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<RepairDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    repairApi.getDetail(shopId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [shopId]);

  if (loading) {
    return (
      <div className={styles.backdrop} onClick={onClose}>
        <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
          <div className={styles.skeleton}>{t('common.loading')}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={styles.backdrop} onClick={onClose}>
        <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
          <div className={styles.skeleton}>{t('info.repair.detailNotFound', '정비소를 찾을 수 없습니다')}</div>
        </div>
      </div>
    );
  }

  const shop = data.shop;
  const stats = data.stats; // 리뷰 없는 정비소는 null 일 수 있음

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.shopName}>{shop.name}</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="close">✕</button>
        </header>

        <div className={styles.rating}>
          ⭐ {stats?.avg_rating ? stats.avg_rating.toFixed(1) : '-'}
          <span className={styles.reviewCount}>({stats?.review_count ?? 0} {t('info.repair.reviewCount')})</span>
        </div>

        {shop.phone && (
          <a className={styles.phoneRow} href={`tel:${shop.phone}`}>
            <span>☎</span>
            <span>{shop.phone}</span>
          </a>
        )}
        {shop.street_name && <div className={styles.metaRow}>📍 {shop.street_name}</div>}
        {shop.opening_hours && <div className={styles.metaRow}>🕒 {shop.opening_hours}</div>}

        {shop.keywords && shop.keywords.length > 0 && (
          <div className={styles.chips}>
            {shop.keywords.map((kw) => (
              <span
                key={kw.keyword}
                className={`${styles.chip} ${kw.sentiment === 'positive' ? styles.chipPos : styles.chipNeg}`}
              >
                {kw.keyword}
              </span>
            ))}
          </div>
        )}

        {data.recent_reviews.length > 0 && (
          <div className={styles.reviewPreview}>
            <button
              type="button"
              className={styles.reviewPreviewHead}
              onClick={() => navigate(`/info/repair/${shopId}/reviews`)}
            >
              <span>{t('info.repair.recentReviews')}</span>
              <span className={styles.viewAll}>{t('info.repair.viewAllReviews')}</span>
            </button>
            {data.recent_reviews.slice(0, 2).map((r) => (
              <ReviewCard key={r.review_id} review={r} />
            ))}
          </div>
        )}

        <button className={styles.writeBtn} onClick={() => navigate(`/info/repair/${shopId}/write`)}>
          {t('info.repair.writeReviewBtn', '리뷰 작성')}
        </button>
      </div>
    </div>
  );
}
