import { useTranslation } from 'react-i18next';
import { Flame, MessageCircle, Newspaper } from 'lucide-react';
import { AppImage } from '@/components/ui/AppImage';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost } from '@/api/types';
import styles from './ProfileFeedCard.module.css';

interface Props {
  post: FeedPost;
  onClick: () => void;
  onCheer: (e: React.MouseEvent) => void;
}

/**
 * 프로필 "게시물" 전용 카드 — `UserProfile.tsx` 에서 그대로 추출(신규 디자인 없음).
 * 카드 탭 → 게시물 상세, 응원은 목록에서 유지(FeedList 관례) — 콜백은 상위(UserProfile)에서 주입한다.
 */
export default function ProfileFeedCard({ post: p, onClick, onCheer }: Props) {
  const { t } = useTranslation();
  return (
    <article
      className={styles.feedCard}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        // 내부 응원 버튼에서 버블링된 키다운은 무시(그 버튼 자체가 반응한다)
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={styles.feedThumb}>
        {p.photoUrl ? (
          <AppImage src={p.photoUrl} alt="" className={styles.feedPhoto} />
        ) : (
          <span className={styles.feedPlaceholder}><Newspaper size={22} /></span>
        )}
      </div>
      <span className={styles.feedBody}>
        <span className={styles.feedTime}>{formatRelativeTime(p.createdAt)}</span>
        <span className={styles.feedCaption}>{p.caption ?? t('feed.noCaption')}</span>
        <span className={styles.feedMeta}>
          <button
            type="button"
            className={`${styles.cheerBtn} ${p.iCheered ? styles.cheerBtnActive : ''}`}
            onClick={onCheer}
          >
            <Flame size={12} />
            {p.cheerCount > 0 && <span>{p.cheerCount}</span>}
          </button>
          {p.commentCount > 0 && <span className={styles.commentCount}><MessageCircle size={12} />{p.commentCount}</span>}
        </span>
      </span>
    </article>
  );
}
