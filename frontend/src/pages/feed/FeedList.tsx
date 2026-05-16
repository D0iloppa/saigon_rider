import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { fetchFeed, fetchComments, toggleCheer, toggleCommentLike, postComment, fetchStories } from '@/api/feed';
import type { StoryItem } from '@/api/feed';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost, Comment } from '@/api/types';
import { StoryAvatar } from '@/components/ui/StoryAvatar';
import { Chip } from '@/components/ui/Chip';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { useUserStore } from '@/store/useUserStore';
import { loadSession } from '@/lib/session';
import { nativeInterface, NATIVE_KEYS } from '@/lib/native';
import styles from './FeedList.module.css';

type FilterKey = 'all' | 'neighborhood' | 'friends' | 'hot';

// ─── PostImage ────────────────────────────────────────────────────────────────
function PostImage({ src, onClick }: { src: string; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button className={styles.postImgWrap} onClick={onClick} aria-label="사진 자세히 보기">
      {!loaded && <div className={styles.imgSkeleton} />}
      <img
        src={src}
        alt=""
        className={`${styles.postImgEl} ${loaded ? styles.postImgVisible : ''}`}
        onLoad={() => setLoaded(true)}
      />
    </button>
  );
}

// ─── ImageViewer ─────────────────────────────────────────────────────────────
interface TouchState {
  type: 'none' | 'single' | 'pinch';
  // single finger
  startX: number;
  startY: number;
  startTX: number;
  startTY: number;
  // pinch
  startDist: number;
  startScale: number;
  // double-tap detection
  lastTap: number;
}

function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [visible, setVisible] = useState(false);

  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const touch = useRef<TouchState>({
    type: 'none',
    startX: 0, startY: 0, startTX: 0, startTY: 0,
    startDist: 0, startScale: 1,
    lastTap: 0,
  });

  // sync refs so touch handlers always read fresh value
  scaleRef.current = scale;
  txRef.current = tx;
  tyRef.current = ty;

  useEffect(() => {
    // mount → fade in
    requestAnimationFrame(() => setVisible(true));
    // lock body scroll
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  function clampScale(s: number) { return Math.min(Math.max(s, 1), 5); }

  function resetIfMin(s: number) {
    if (s <= 1) { setTx(0); setTy(0); }
  }

  // ── wheel (desktop) ──────────────────────────────────────────────
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = clampScale(scaleRef.current - e.deltaY * 0.002);
    setScale(next);
    resetIfMin(next);
  }

  // ── touch ────────────────────────────────────────────────────────
  function dist(t: React.TouchList | TouchList) {
    return Math.hypot(
      t[1].clientX - t[0].clientX,
      t[1].clientY - t[0].clientY,
    );
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      touch.current = {
        ...touch.current,
        type: 'pinch',
        startDist: dist(e.touches),
        startScale: scaleRef.current,
        startX: 0, startY: 0, startTX: 0, startTY: 0,
      };
    } else {
      const now = Date.now();
      const isDoubleTap = now - touch.current.lastTap < 280;
      touch.current = {
        ...touch.current,
        type: 'single',
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startTX: txRef.current,
        startTY: tyRef.current,
        lastTap: isDoubleTap ? 0 : now,  // reset so triple-tap doesn't re-trigger
      };
      if (isDoubleTap) {
        // double tap: toggle 1x ↔ 2.5x
        const next = scaleRef.current > 1 ? 1 : 2.5;
        setScale(next);
        resetIfMin(next);
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const t = touch.current;

    if (t.type === 'pinch' && e.touches.length === 2) {
      const next = clampScale(t.startScale * (dist(e.touches) / t.startDist));
      setScale(next);
      resetIfMin(next);
    } else if (t.type === 'single' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - t.startX;
      const dy = e.touches[0].clientY - t.startY;

      if (scaleRef.current <= 1) {
        // swipe down to close
        if (dy > 80) { close(); return; }
        setTy(dy * 0.3); // drag down slightly as hint
      } else {
        // pan while zoomed
        setTx(t.startTX + dx);
        setTy(t.startTY + dy);
      }
    }
  }

  function handleTouchEnd() {
    if (scaleRef.current <= 1) {
      setTy(0); // snap back if not closed
    }
    touch.current.type = 'none';
  }

  const imgStyle: React.CSSProperties = {
    transform: `scale(${scale}) translate(${tx / scale}px, ${ty / scale}px)`,
    cursor: scale > 1 ? 'grab' : 'zoom-in',
    transition: touch.current.type !== 'none' ? 'none' : 'transform 0.2s ease',
  };

  return createPortal(
    <div
      className={`${styles.lightbox} ${visible ? styles.lightboxVisible : ''}`}
      onClick={close}
    >
      <button className={styles.lightboxClose} onClick={close} aria-label="닫기">✕</button>
      <div
        className={styles.lightboxImgWrap}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img src={src} alt="" style={imgStyle} className={styles.lightboxImg} draggable={false} />
      </div>
    </div>,
    document.body,
  );
}

// ─── FeedList ────────────────────────────────────────────────────────────────
export default function FeedList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [activePost, setActivePost] = useState<FeedPost | null>(null);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryItem[]>([]);

  useEffect(() => { fetchStories().then(setStories); }, []);

  useEffect(() => {
    (async () => {
      if (filter === 'neighborhood') {
        try {
          const loc = await nativeInterface.request(NATIVE_KEYS.GET_LOCATION) as any;
          if (loc?.lat != null && loc?.lng != null) {
            const result = await fetchFeed({ filter, lat: loc.lat, lng: loc.lng, userId: user?.id });
            setPosts(result);
            return;
          }
        } catch { /* location unavailable, fall through to all */ }
        const result = await fetchFeed({ filter: 'all' });
        setPosts(result);
        return;
      }
      if (filter === 'friends' && user) {
        const result = await fetchFeed({ filter, userId: user.id });
        setPosts(result);
        return;
      }
      const result = await fetchFeed({ filter });
      setPosts(result);
    })();
  }, [filter]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',          label: t('feed.filterAll') },
    { key: 'neighborhood', label: t('feed.filterNeighborhood') },
    { key: 'friends',      label: t('feed.filterFriends') },
    { key: 'hot',          label: t('feed.filterHot') },
  ];

  const handleCheer = async (p: FeedPost, e: React.MouseEvent) => {
    e.stopPropagation();
    const { cheered, count } = await toggleCheer(p.id);
    setPosts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, iCheered: cheered, cheerCount: count } : x))
    );
  };

  return (
    <div className={styles.page}>
      <TopBar
        title={t('feed.title')}
        showBack={false}
        leftContent={
          <button className={styles.iconBtn} onClick={() => navigate('/feed/new')} aria-label="새 글">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        }
        rightContent={
          <>
            <button className={styles.iconBtn} onClick={() => navigate('/profile')} aria-label="프로필">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M5 20c0-3.3 2.7-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <button className={styles.iconBtn} onClick={() => navigate('/dm')} aria-label="DM">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        }
      />

      <div className={styles.scrollBody}>
      <div className={styles.body}>
        {/* Story strip */}
        <div className={styles.storyRow}>
          <div className={`${styles.story} ${styles.storyMe}`}>
            <StoryAvatar label={t('feed.myStory')} isMe />
          </div>
          {stories.map((s) => (
            <div key={s.userId} className={styles.story}>
              <StoryAvatar src={s.avatarUrl ?? undefined} label={`@${s.nickname}`} hasStory />
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className={styles.filterRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              variant={filter === f.key ? 'dark' : 'surface'}
              onClick={() => setFilter(f.key)}
              style={{ cursor: 'pointer' }}
            >
              {f.label}
            </Chip>
          ))}
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📸</div>
            <h2>{t('feed.emptyTitle')}</h2>
            <p>{t('feed.emptySub')}</p>
          </div>
        ) : (
          <div className={styles.feed}>
            {posts.map((p) => (
              <article key={p.id} className={styles.post}>
                {p.photoUrl && (
                  <div className={styles.postImgContainer}>
                    <PostImage src={p.photoUrl} onClick={() => setViewerSrc(p.photoUrl!)} />
                    {(p.distanceKm != null || p.safetyGrade) && (
                      <div className={styles.imgStats}>
                        {p.distanceKm != null ? `${p.distanceKm.toFixed(1)}km` : ''}
                        {p.distanceKm != null && p.safetyGrade ? ' · ' : ''}
                        {p.safetyGrade ? t('feed.safetyLabel', { grade: p.safetyGrade }) : ''}
                      </div>
                    )}
                    {p.rewardExp != null && (
                      <div className={styles.imgReward}>+{p.rewardExp} EXP</div>
                    )}
                  </div>
                )}
                <div className={styles.postBody}>
                  <div className={styles.postHeader}>
                    <img src={p.userAvatarUrl ?? undefined} alt="" className={styles.userAvatar} />
                    <div className={styles.userInfo}>
                      <div className={styles.userName}>
                        {p.userNickname ?? 'Unknown'}
                        <LevelBadge level={p.userLevel} />
                      </div>
                      <div className={styles.timestamp}>{formatRelativeTime(p.createdAt)}</div>
                    </div>
                  </div>
                  {p.caption && <p className={styles.caption}>{p.caption}</p>}
                  {p.hashtags.length > 0 && (
                    <div className={styles.hashtagRow}>
                      {p.hashtags.map((tag) => (
                        <span key={tag} className={styles.hashtag}>#{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className={styles.actions}>
                    <button
                      className={`${styles.actionBtn} ${p.iCheered ? styles.actionActive : ''}`}
                      onClick={(e) => handleCheer(p, e)}
                    >
                      🔥 <span>{p.cheerCount}</span>
                    </button>
                    <button className={styles.actionBtn} onClick={() => setActivePost(p)}>
                      💬 <span>{p.commentCount}</span>
                    </button>
                    <button className={styles.actionBtn}>↗</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      </div>{/* scrollBody */}

      <BottomSheet open={!!activePost} onClose={() => setActivePost(null)} height="full">
        {activePost && <CommentSheet post={activePost} />}
      </BottomSheet>

      {viewerSrc && <ImageViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />}
    </div>
  );
}

// ─── CommentSheet ─────────────────────────────────────────────────────────────
function CommentSheet({ post }: { post: FeedPost }) {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => { fetchComments(post.id).then(setComments); }, [post.id]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const session = loadSession();
    if (!session) return;
    const { id, createdAt } = await postComment(post.id, text, session.userId);
    const newC: Comment = {
      id,
      postId: post.id,
      userNickname: user?.nickname ?? session.userId,
      userAvatarUrl: user?.avatarUrl ?? undefined,
      content: text,
      createdAt,
      likeCount: 0,
      iLiked: false,
    };
    setComments((prev) => [...prev, newC]);
  };

  const handleCommentLike = async (c: Comment, e: React.MouseEvent) => {
    e.stopPropagation();
    const { liked, count } = await toggleCommentLike(post.id, c.id);
    setComments((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, iLiked: liked, likeCount: count } : x))
    );
  };

  return (
    <div className={styles.commentRoot}>
      <h3 className={styles.commentTitle}>
        {t('feed.commentsCount', { count: comments.length })}
      </h3>
      <div className={styles.commentList}>
        {comments.map((c) => (
          <div key={c.id} className={`${styles.comment} ${c.parentId ? styles.commentReply : ''}`}>
            <img src={c.userAvatarUrl} alt="" className={styles.commentAvatar} />
            <div className={styles.commentBody}>
              <div className={styles.commentNick}>
                {c.userNickname}
                <span>{formatRelativeTime(c.createdAt)}</span>
              </div>
              <div className={styles.commentText}>{c.content}</div>
            </div>
            <button
              className={`${styles.commentLike} ${c.iLiked ? styles.commentLikeActive : ''}`}
              onClick={(e) => handleCommentLike(c, e)}
            >
              ♥ {c.likeCount > 0 && c.likeCount}
            </button>
          </div>
        ))}
      </div>
      <div className={styles.commentInputBar}>
        <img src={user?.avatarUrl ?? undefined} alt="" className={styles.commentAvatar} />
        <input
          placeholder={t('feed.commentPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
          onClick={handleSend}
          disabled={!input.trim()}
        >
          ↗
        </button>
      </div>
    </div>
  );
}
