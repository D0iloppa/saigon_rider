import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Star } from 'lucide-react';
import { AppImage } from '@/components/ui/AppImage';
import { DEFAULT_AVATAR_URL } from '@/lib/defaults';
import type { ProfileReview } from '@/api/types';
import styles from './ProfileReviewRow.module.css';

/** 매너 칭찬 태그 라벨 — 후기 작성 시트(market/ReviewSheet)의 `dm.tag_*` 키를 그대로 쓴다. */
export function reviewTagLabel(t: TFunction, tag: string): string {
  return t(`dm.tag_${tag.toLowerCase()}`, { defaultValue: tag });
}

/**
 * 받은 후기 한 줄 — 프로필 신뢰 카드 미리보기(compact, 본문 1줄)와
 * `/profile/:userId/reviews` 목록(detailed, 아바타+태그+본문 전체)이 공용. (F-P-01 FR-1 r11)
 */
export default function ProfileReviewRow({
  review, detailed = false, onReviewerClick,
}: { review: ProfileReview; detailed?: boolean; onReviewerClick?: () => void }) {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' })
    .format(new Date(review.createdAt));
  const role = review.reviewerRole
    ? t(review.reviewerRole === 'BUYER' ? 'userProfile.roleBuyer' : 'userProfile.roleSeller')
    : null;
  const meta = [review.reviewer.nickname ?? 'Unknown', role, date].filter(Boolean).join(' · ');

  return (
    <div className={styles.row}>
      {detailed && (
        <button type="button" className={styles.avatarBtn} onClick={onReviewerClick} aria-label={review.reviewer.nickname ?? ''}>
          <AppImage src={review.reviewer.avatarUrl || DEFAULT_AVATAR_URL} alt="" className={styles.avatar} variant="circle" />
        </button>
      )}
      <div className={styles.body}>
        <div className={styles.stars} aria-label={`${review.rating}/5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={13} className={n <= review.rating ? styles.starOn : styles.starOff} />
          ))}
        </div>
        {review.text && <p className={detailed ? styles.textFull : styles.textClamp}>{review.text}</p>}
        {detailed && review.tags.length > 0 && (
          <div className={styles.tags}>
            {review.tags.map((tag) => <span key={tag} className={styles.tag}>{reviewTagLabel(t, tag)}</span>)}
          </div>
        )}
        {detailed && onReviewerClick ? (
          <button type="button" className={styles.metaBtn} onClick={onReviewerClick}>{meta}</button>
        ) : (
          <span className={styles.meta}>{meta}</span>
        )}
      </div>
    </div>
  );
}
