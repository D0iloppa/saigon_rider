import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle } from 'lucide-react';
import { AppImage } from '@/components/ui/AppImage';
import { OwnerBadge } from '@/components/ui/OwnerBadge';
import { useUserStore } from '@/store/useUserStore';
import { localizedName, type ListingCard as Listing } from '@/api/market';
import { formatDistance, formatPriceVnd, relativeTime, statusLabelKey } from './marketFormat';
import { noItemImage } from './noItemImage';
import styles from './ListingCard.module.css';

interface Props {
  listing: Listing;
  onClick: () => void;
  onToggleLike?: () => void;
}

/** 동네 피드·검색 공용 1열 매물 카드 (REF-02). */
export default function ListingCard({ listing: l, onClick, onToggleLike }: Props) {
  const { t } = useTranslation();
  const myId = useUserStore((s) => s.user?.id);
  const isMine = !!myId && l.sellerId === myId;
  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <span className={styles.thumb}>
        <AppImage src={l.thumbnailUrl ?? noItemImage()} alt={l.title} className={styles.thumbImg} />
        {isMine && <OwnerBadge label={t('common.myItemBadge')} className={styles.ownerBadge} />}
        {l.status !== 'ON_SALE' && <span className={styles.statusTag}>{t(statusLabelKey(l.status))}</span>}
        {onToggleLike && (
          <button
            type="button"
            className={styles.wishlistToggle}
            aria-label={t('market.removeWishlist', { defaultValue: '찜 해제' })}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLike();
            }}
          >
            <Heart size={18} strokeWidth={2.2} fill="currentColor" />
          </button>
        )}
      </span>
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>{l.title}</p>
        <p className={styles.cardMeta}>
          {[localizedName(l.district), formatDistance(l.distanceM, t), relativeTime(l.bumpedAt, t)]
            .filter(Boolean)
            .join(' · ')}
        </p>
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
  );
}
