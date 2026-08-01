import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle } from 'lucide-react';
import { AppImage } from '@/components/ui/AppImage';
import { localizedName, type ListingCard as Listing } from '@/api/market';
import { formatDistance, formatPriceVnd, relativeTime, statusLabelKey } from './marketFormat';
import { noItemImage } from './noItemImage';
import styles from './ListingCard.module.css';

interface Props {
  listing: Listing;
  onClick: () => void;
}

/** 동네 피드·검색 공용 1열 매물 카드 (REF-02). */
export default function ListingCard({ listing: l, onClick }: Props) {
  const { t } = useTranslation();
  return (
    <button className={styles.card} type="button" onClick={onClick}>
      <span className={styles.thumb}>
        <AppImage src={l.thumbnailUrl ?? noItemImage()} alt={l.title} className={styles.thumbImg} />
        {l.status !== 'ON_SALE' && <span className={styles.statusTag}>{t(statusLabelKey(l.status))}</span>}
      </span>
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>{l.title}</p>
        <p className={styles.cardMeta}>
          {[localizedName(l.district), formatDistance(l.distanceM, t), relativeTime(l.bumpedAt, t)]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className={styles.cardFooter}>
          <span className={styles.price}>
            {l.originalPriceVnd != null && l.originalPriceVnd > l.priceVnd && (
              <span className={styles.dropBadge}>{t('market.priceDrop', { defaultValue: '가격내림' })}</span>
            )}
            <span className="num">{formatPriceVnd(l.priceVnd, t)}</span>
          </span>
          {/* 0 카운트는 죽은 신호 — 반응이 있을 때만 노출 */}
          {(l.likeCount > 0 || l.chatCount > 0) && (
            <span className={styles.likes}>
              {l.likeCount > 0 && (
                <span className={styles.likeItem}>
                  <Heart size={13} strokeWidth={2} />
                  <span className="num">{l.likeCount}</span>
                </span>
              )}
              {l.chatCount > 0 && (
                <span className={styles.likeItem}>
                  <MessageCircle size={13} strokeWidth={2} />
                  <span className="num">{l.chatCount}</span>
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
