import { useTranslation } from 'react-i18next';
import { Flame, MessageCircle, Newspaper } from 'lucide-react';
import { AppImage } from '@/components/ui/AppImage';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost } from '@/api/types';
import styles from './ProfileFeedCard.module.css';

interface Props {
  post: FeedPost;
  onClick: () => void;
}

/**
 * 프로필 "게시물" 전용 카드 — `UserProfile.tsx` 에서 그대로 추출(신규 디자인 없음).
 * 카드 탭 → 게시물 상세.
 * FR-1 제안 ⑤ — 상대를 판단하러 온 화면(타인 프로필)에서 상대 글에 응원하는 행동은
 * 판단 여정과 무관하다. 매물 레일 카드(ProfileListingCard)와 동일하게 이동 전용 카드로
 * 통일한다 — 응원 토글은 제거하고, 카운트는 매물 카드의 좋아요·채팅 수처럼 죽은 신호가
 * 아닐 때만 표시하는 표시 전용 요소로 남긴다.
 */
export default function ProfileFeedCard({ post: p, onClick }: Props) {
  const { t } = useTranslation();
  return (
    <button className={styles.feedCard} type="button" onClick={onClick}>
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
        {(p.cheerCount > 0 || p.commentCount > 0) && (
          <span className={styles.feedMeta}>
            {p.cheerCount > 0 && <span className={styles.cheerCount}><Flame size={12} />{p.cheerCount}</span>}
            {p.commentCount > 0 && <span className={styles.commentCount}><MessageCircle size={12} />{p.commentCount}</span>}
          </span>
        )}
      </span>
    </button>
  );
}
