import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Clock, MapPin, Phone, Wrench, X } from 'lucide-react';
import { repairApi, type RepairDetail } from '@/api/info';
import { BottomSheet } from '@/components/ui/BottomSheet';
import StateBlock from '@/components/ui/StateBlock';
import { ReviewCard } from '@/pages/info/InfoRepairDetail';
import { StarIcon } from '@/components/ui/StarIcon';
import { native } from '@/lib/native';
import sys from '@/styles/system.module.css';
import styles from './RepairShopSheet.module.css';

interface Props {
  shopId: number;
  onClose: () => void;
}

/** 정비소 상세 바텀시트 — 목록(InfoRepairList)과 같은 표면 문법으로 이어진다. */
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

  const shop = data?.shop;
  const stats = data?.stats; // 리뷰 없는 정비소는 null 일 수 있음

  return (
    <BottomSheet open onClose={onClose}>
      <div className={styles.body}>
        {loading ? (
          <>
            {[0, 1].map((i) => (
              <div key={i} className={sys.skelRow}>
                <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
              </div>
            ))}
          </>
        ) : !data || !shop ? (
          <StateBlock icon={Wrench} title={t('info.repair.detailNotFound', '정비소를 찾을 수 없습니다')} />
        ) : (
          <>
            <header className={styles.titleRow}>
              <h2 className={styles.name}>
                {shop.name}
                {shop.is_verified && <BadgeCheck size={15} className={sys.rowTitleIcon} />}
              </h2>
              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>
                <X size={16} strokeWidth={2.2} />
              </button>
            </header>

            <div className={styles.rating}>
              <StarIcon size={13} />
              <b className="num">{stats?.avg_rating?.toFixed(1) ?? '—'}</b>
              <span className={styles.ratingCount}>
                ({stats?.review_count ?? 0} {t('info.repair.reviewCount')})
              </span>
            </div>

            <div className={styles.metaList}>
              {shop.street_name && (
                <div className={styles.metaRow}>
                  <MapPin size={14} className={styles.metaIcon} />
                  <span>{shop.street_name}</span>
                </div>
              )}
              {shop.opening_hours && (
                <div className={styles.metaRow}>
                  <Clock size={14} className={styles.metaIcon} />
                  <span className="num">{shop.opening_hours}</span>
                </div>
              )}
            </div>

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

            {shop.phone && (
              <button
                type="button"
                className={styles.phoneBtn}
                onClick={() => native.openUrl(`tel:${shop.phone}`)}
              >
                <Phone size={15} strokeWidth={2.2} />
                <span className="num">{shop.phone}</span>
              </button>
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
          </>
        )}
      </div>
    </BottomSheet>
  );
}
