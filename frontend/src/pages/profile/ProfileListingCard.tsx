import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle } from 'lucide-react';
import { AppImage } from '@/components/ui/AppImage';
import { localizedName, type ListingCard as Listing } from '@/api/market';
import { formatPriceVnd, relativeTime, statusLabelKey } from '../market/marketFormat';
import { noItemImage } from '../market/noItemImage';
import styles from './ProfileListingCard.module.css';

interface Props {
  listing: Listing;
  onClick: () => void;
}

/**
 * 프로필 "판매 중인 매물" 전용 2열 세로 카드 (당근 프로필 스타일).
 *
 * 공용 `market/ListingCard` 는 128px 썸네일이 왼쪽에 붙는 1열 행 카드라 2열 그리드(컬럼 ≈160px)에
 * 넣으면 제목이 "GS 12…" 로 잘리고 가격이 컬럼 밖으로 넘친다. 그 카드는 동네피드·검색·지도가
 * 공유하므로 건드리지 않고, 프로필에서만 쓰는 세로형을 따로 둔다 — 같은 페이지의 게시물
 * 그리드(.feedCard)와 표면·라운드를 맞춰 두 그리드가 한 체계로 보이게 한다.
 */
export default function ProfileListingCard({ listing: l, onClick }: Props) {
  const { t } = useTranslation();
  return (
    <button className={styles.card} type="button" onClick={onClick}>
      <span className={styles.thumb}>
        <AppImage src={l.thumbnailUrl ?? noItemImage()} alt={l.title} className={styles.thumbImg} />
        {l.status !== 'ON_SALE' && <span className={styles.statusTag}>{t(statusLabelKey(l.status))}</span>}
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{l.title}</span>
        <span className={styles.meta}>
          {[localizedName(l.district), relativeTime(l.bumpedAt, t)].filter(Boolean).join(' · ')}
        </span>
        <span className={styles.price}>
          {l.originalPriceVnd != null && l.originalPriceVnd > l.priceVnd && (
            <span className={styles.dropBadge}>{t('market.priceDrop', { defaultValue: '가격내림' })}</span>
          )}
          <span className="num">{formatPriceVnd(l.priceVnd, t)}</span>
        </span>
        {/* 0 카운트는 죽은 신호 — 반응이 있을 때만 노출 (ListingCard 관례 유지) */}
        {(l.likeCount > 0 || l.chatCount > 0) && (
          <span className={styles.likes}>
            {l.likeCount > 0 && (
              <span className={styles.likeItem}>
                <Heart size={12} strokeWidth={2} />
                <span className="num">{l.likeCount}</span>
              </span>
            )}
            {l.chatCount > 0 && (
              <span className={styles.likeItem}>
                <MessageCircle size={12} strokeWidth={2} />
                <span className="num">{l.chatCount}</span>
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
