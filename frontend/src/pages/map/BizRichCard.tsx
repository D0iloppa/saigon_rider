import { Heart, Megaphone, MessageSquareQuote, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import { StarIcon } from '@/components/ui/StarIcon';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import { formatRelativeTime } from '@/lib/format';
import { bizWardLabel, type BizMapItem } from '@/api/biz';
import styles from './BizRichCard.module.css';

/** 가게 카드 거리 라벨 — 도보권(≤1.2km)은 "걸어서 N분"(~67m/분), 그 밖은 km. */
function bizDistanceLabel(m: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (m <= 1200) return t('map.bizCard.walkMinutes', { count: Math.max(1, Math.round(m / 67)) });
  return `${(m / 1000).toFixed(1)}km`;
}

interface BizRichCardProps {
  biz: BizMapItem;
  /** 호출부가 자신의 카테고리 목록으로 로컬라이즈해 넘긴다(없으면 코드 그대로 표시) */
  categoryLabel?: string | null;
  /** 사용자 위치 기준 거리(m) — null/undefined 면 거리 메타 생략 */
  distanceM?: number | null;
  onClick: () => void;
  /** 지도 바텀시트 등 컴팩트 컨텍스트용 여백 축소 (정보 구성은 동일) */
  compact?: boolean;
}

/** 가게 리치 카드(당근형) — 상호+업종 · ★평점·후기수·단골수·거리 메타 · 사진 가로레일 ·
 * 소식 필 · 리뷰 프리뷰. 동네지도 리스트·지도 바텀시트 공용. */
export default function BizRichCard({ biz, categoryLabel, distanceM, onClick, compact }: BizRichCardProps) {
  const { t, i18n } = useTranslation();
  const wardLabel = bizWardLabel(biz, i18n.language);
  // 사진 레일 = 대표사진 + 최신 소식 첨부사진 (당근 가게 카드 문법)
  const railPhotos = [
    ...(biz.photoUrl ? [biz.photoUrl] : []),
    ...(biz.latestNews?.photos ?? []),
  ].slice(0, 6);

  return (
    <button
      type="button"
      className={compact ? `${styles.bizCard} ${styles.bizCardCompact}` : styles.bizCard}
      onClick={onClick}
    >
      <span className={styles.bizHead}>
        <span className={styles.bizName}>{biz.name}</span>
        {wardLabel && <span className={styles.bizWard}>{wardLabel}</span>}
        {biz.category && (
          <span className={styles.bizCat}>
            <BizCatIcon category={biz.category} size={12} />
            {categoryLabel ?? biz.category}
          </span>
        )}
      </span>
      {(biz.rating != null || biz.favoriteCount > 0 || biz.followerCount > 0 || distanceM != null) && (
        <span className={styles.bizMeta}>
          {biz.rating != null && (
            <span className={styles.bizRating}>
              <StarIcon size={12} />
              <strong className="num">{biz.rating.toFixed(1)}</strong>
              <small className="num">({biz.reviewCount})</small>
            </span>
          )}
          {/* 0 카운트는 죽은 신호 — 반응이 있을 때만 노출 (ListingCard 관례) */}
          {biz.favoriteCount > 0 && (
            <span className={styles.bizCount} aria-label={t('map.bizCard.favorites', { count: biz.favoriteCount })}>
              <Heart size={12} strokeWidth={2} />
              <span className="num">{biz.favoriteCount}</span>
            </span>
          )}
          {biz.followerCount > 0 && (
            <span className={styles.bizCount}>
              <Users size={12} strokeWidth={2} />
              {t('map.bizCard.followers', { count: biz.followerCount })}
            </span>
          )}
          {distanceM != null && <span className="num">{bizDistanceLabel(distanceM, t)}</span>}
        </span>
      )}
      {railPhotos.length > 0 && (
        <span className={styles.bizRail}>
          {railPhotos.map((src, index) => (
            <AppImage key={index} src={src} alt="" className={styles.bizRailPhoto} />
          ))}
        </span>
      )}
      {biz.latestNews && (
        <span className={styles.bizNews}>
          <Megaphone size={12} />
          <span>{biz.latestNews.title} · {formatRelativeTime(biz.latestNews.createdAt)}</span>
        </span>
      )}
      {biz.reviewPreviews.length > 0 && (
        <span className={styles.bizReviews}>
          {biz.reviewPreviews.map((review, index) => (
            <span key={index} className={styles.bizReviewLine}>
              <MessageSquareQuote size={12} />
              <strong>{t('map.bizCard.reviewPill', { rating: review.rating.toFixed(1) })}</strong>
              <span>{review.body}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
