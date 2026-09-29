import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flame, MessageCircle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { OwnerBadge } from '@/components/ui/OwnerBadge';
import { useUserStore } from '@/store/useUserStore';
import styles from './FeedList.module.css';

// 본문 클램프 — 사진 글 3줄 / 글만 있는 글 6줄. 넘칠 때만 "더보기"(탭은 카드 탭과 같이 상세로 버블링).
function ClampedCaption({ text, lines }: { text: string; lines: number }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [text, lines]);
  return (
    <div className={styles.postText}>
      <p ref={ref} className={styles.postCaption} style={{ WebkitLineClamp: lines }}>{text}</p>
      {overflow && <span className={styles.readMore}>{t('feed.readMore')}</span>}
    </div>
  );
}


// 1열 게시물 카드 — 피드 목록·그룹 게시판·좋아요한 글이 공유한다.
export function FeedPostCard({ p, onCheer }: { p: FeedPost; onCheer: (p: FeedPost, e: React.MouseEvent) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  // 사진 비율(가로/세로) — 로드 전엔 1:1 자리를 잡아 두고, 로드 후 1:1~4:5 로 제한해 반영
  const [photoRatio, setPhotoRatio] = useState(1);
  return (
    <article
        className={styles.postCard}
      data-testid="feed-post-card"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/feed/post/${p.id}`)}
      onKeyDown={(e) => {
        // 내부 아바타/응원 버튼에서 버블링된 키다운은 무시 (그 버튼 자체가 반응한다)
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/feed/post/${p.id}`);
        }
      }}
    >
      <span className={styles.postAuthor}>
        <button
          type="button"
          className={styles.avatarBtn}
          onClick={(e) => {
            e.stopPropagation();
            if (user && p.userId === user.id) {
              navigate('/profile');
            } else {
              navigate(`/profile/${p.userId}`);
            }
          }}
        >
          <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
        </button>
        {/* 닉네임도 프로필 진입점 — 아바타만 탭 가능한 건 인스타·Threads 관례와
            어긋나고 히트 영역이 작다(2026-08-13). */}
        <strong
          role="button"
          tabIndex={0}
          className={styles.nickBtn}
          onClick={(e) => {
            e.stopPropagation();
            navigate(user && p.userId === user.id ? '/profile' : `/profile/${p.userId}`);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            navigate(user && p.userId === user.id ? '/profile' : `/profile/${p.userId}`);
          }}
        >{p.userNickname ?? '—'}</strong>
        <small>{formatRelativeTime(p.createdAt)}</small>
        {user && p.userId === user.id && <OwnerBadge label={t('common.myPostBadge')} />}
      </span>
      {p.photoUrl && (
        <div className={styles.postMedia} style={{ aspectRatio: photoRatio }}>
          <AppImage
            src={p.photoUrl}
            alt=""
            className={styles.postPhoto}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              if (!w || !h) return;
              const ratio = Math.min(1, Math.max(0.8, w / h));
              setPhotoRatio(ratio);
            }}
          />
          {p.photoUrls.length > 1 && <span className={styles.mediaCount}>1/{p.photoUrls.length}</span>}
        </div>
      )}
      <span className={styles.postBody}>
        {p.caption && <ClampedCaption text={p.caption} lines={p.photoUrl ? 3 : 6} />}
        <span className={styles.feedMeta}>
          <button
            type="button"
            className={`${styles.cheerBtn} ${p.iCheered ? styles.cheerBtnActive : ''}`}
            aria-label={t('feed.cheer')}
            aria-pressed={p.iCheered}
            onClick={(e) => onCheer(p, e)}
          >
            <Flame size={16} />
            <span>{p.cheerCount}</span>
          </button>
          {/* 💬 = 상세의 댓글 위치로 (FeedDetail #comments) */}
          <button
            type="button"
            className={styles.cheerBtn}
            aria-label={t('feed.comments')}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/feed/post/${p.id}#comments`);
            }}
          >
            <MessageCircle size={16} />
            <span>{p.commentCount}</span>
          </button>
        </span>
      </span>
    </article>
  );
}
