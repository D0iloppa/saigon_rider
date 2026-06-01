import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { fetchFeed, fetchComments, toggleCheer, toggleCommentLike, postComment, fetchStories } from '@/api/feed';
import type { StoryItem } from '@/api/feed';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost, Comment } from '@/api/types';
import { StoryAvatar } from '@/components/ui/StoryAvatar';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { Chip } from '@/components/ui/Chip';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { useUserStore } from '@/store/useUserStore';
import { useDmStore } from '@/store/useDmStore';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { loadSession } from '@/lib/session';
import { native } from '@/lib/native';
import { ProfileCard } from '@/components/ProfileCard';
import styles from './FeedList.module.css';

type FilterKey = 'all' | 'neighborhood' | 'friends' | 'hot';

// ─── ImageViewer (다중 이미지 + 확대/축소/스와이프) ─────────────────────────
interface ViewerTouchState {
  type: 'none' | 'single' | 'pinch';
  startX: number;
  startY: number;
  startTX: number;
  startTY: number;
  startDist: number;
  startScale: number;
  lastTap: number;
}

export function ImageViewer({ srcs, initialIndex = 0, onClose }: { srcs: string[]; initialIndex?: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [visible, setVisible] = useState(false);

  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const swipeDx = useRef(0);
  const touch = useRef<ViewerTouchState>({
    type: 'none',
    startX: 0, startY: 0, startTX: 0, startTY: 0,
    startDist: 0, startScale: 1, lastTap: 0,
  });

  scaleRef.current = scale;
  txRef.current = tx;
  tyRef.current = ty;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function resetZoom() { setScale(1); setTx(0); setTy(0); }
  function close() { setVisible(false); setTimeout(onClose, 200); }
  function clampScale(s: number) { return Math.min(Math.max(s, 1), 5); }

  function goTo(i: number) {
    setIdx(i);
    resetZoom();
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = clampScale(scaleRef.current - e.deltaY * 0.002);
    setScale(next);
    if (next <= 1) { setTx(0); setTy(0); }
  }

  function dist(t: React.TouchList | TouchList) {
    return Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    swipeDx.current = 0;
    if (e.touches.length === 2) {
      touch.current = { ...touch.current, type: 'pinch', startDist: dist(e.touches), startScale: scaleRef.current, startX: 0, startY: 0, startTX: 0, startTY: 0 };
    } else {
      const now = Date.now();
      const isDoubleTap = now - touch.current.lastTap < 280;
      touch.current = { ...touch.current, type: 'single', startX: e.touches[0].clientX, startY: e.touches[0].clientY, startTX: txRef.current, startTY: tyRef.current, lastTap: isDoubleTap ? 0 : now };
      if (isDoubleTap) {
        const next = scaleRef.current > 1 ? 1 : 2.5;
        setScale(next);
        if (next <= 1) { setTx(0); setTy(0); }
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const t = touch.current;
    if (t.type === 'pinch' && e.touches.length === 2) {
      const next = clampScale(t.startScale * (dist(e.touches) / t.startDist));
      setScale(next);
      if (next <= 1) { setTx(0); setTy(0); }
    } else if (t.type === 'single' && e.touches.length === 1) {
      const dxVal = e.touches[0].clientX - t.startX;
      const dy = e.touches[0].clientY - t.startY;
      swipeDx.current = dxVal;
      if (scaleRef.current <= 1) {
        if (dy > 80) { close(); return; }
        setTy(dy * 0.3);
      } else {
        setTx(t.startTX + dxVal);
        setTy(t.startTY + dy);
      }
    }
  }

  function handleTouchEnd() {
    if (scaleRef.current <= 1) {
      setTy(0);
      if (srcs.length > 1) {
        if (swipeDx.current < -60 && idx < srcs.length - 1) { goTo(idx + 1); return; }
        if (swipeDx.current > 60 && idx > 0) { goTo(idx - 1); return; }
      }
    }
    touch.current.type = 'none';
  }

  const imgStyle: React.CSSProperties = {
    transform: `scale(${scale}) translate(${tx / scale}px, ${ty / scale}px)`,
    cursor: scale > 1 ? 'grab' : 'zoom-in',
    transition: touch.current.type !== 'none' ? 'none' : 'transform 0.2s ease',
  };

  return createPortal(
    <div className={`${styles.lightbox} ${visible ? styles.lightboxVisible : ''}`} onClick={close}>
      <button className={styles.lightboxClose} onClick={close} aria-label={t('common.close')}>✕</button>
      {srcs.length > 1 && (
        <div className={styles.lightboxCounter}>{idx + 1} / {srcs.length}</div>
      )}
      <div
        className={styles.lightboxImgWrap}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img src={srcs[idx]} alt="" style={imgStyle} className={styles.lightboxImg} draggable={false} />
      </div>
      {srcs.length > 1 && (
        <div className={styles.lightboxDots}>
          {srcs.map((_, i) => (
            <span key={i} className={`${styles.lightboxDot} ${i === idx ? styles.lightboxDotActive : ''}`} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ─── FeedList ────────────────────────────────────────────────────────────────
export default function FeedList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const totalUnread = useDmStore((s) => s.totalUnread);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [activePost, setActivePost] = useState<FeedPost | null>(null);
  const [viewerState, setViewerState] = useState<{ srcs: string[]; index: number } | null>(null);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => { fetchStories().then(setStories); }, []);

  // neighborhood 필터 시 위치를 미리 캐시
  useEffect(() => {
    if (filter === 'neighborhood') {
      native.getLocation()
        .then((pos) => { locationRef.current = { lat: pos.lat, lng: pos.lng }; })
        .catch(() => {});
    }
  }, [filter]);

  const fetchPage = useCallback(async (page: number) => {
    if (filter === 'neighborhood' && locationRef.current) {
      return fetchFeed({ filter, lat: locationRef.current.lat, lng: locationRef.current.lng, userId: user?.id, page });
    }
    if (filter === 'friends' && user) {
      return fetchFeed({ filter, userId: user.id, page });
    }
    return fetchFeed({ filter, page });
  }, [filter, user]);

  const { items: posts, setItems: setPosts, isLoading, isLoadingMore, hasMore, sentinelRef, reset } =
    useInfiniteScroll<FeedPost>(fetchPage, 20, [filter, user?.id]);

  const { containerRef: scrollBodyRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(reset);

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
          <button className={styles.iconBtn} onClick={() => navigate('/feed/new')} aria-label={t('feedCreate.title')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        }
        rightContent={
          <>
            <button className={styles.iconBtn} onClick={() => navigate('/profile')} aria-label={t('tabbar.profile')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M5 20c0-3.3 2.7-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <button className={styles.iconBtn} onClick={() => navigate('/dm')} aria-label="DM" style={{ position: 'relative' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {totalUnread > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#ff4b4b',
                  border: '1.5px solid var(--surface)',
                }} />
              )}
            </button>
          </>
        }
      />

      <div className={styles.scrollBody} ref={scrollBodyRef as React.RefObject<HTMLDivElement>}>
      <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div className={styles.body}>
        {/* Story strip — 추후 구현 예정, 임시 숨김 */}
        <div className={styles.storyRow} style={{ display: 'none' }}>
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
        {!isLoading && posts.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📸</div>
            <h2>{t('feed.emptyTitle')}</h2>
            <p>{t('feed.emptySub')}</p>
          </div>
        ) : (
          <div className={styles.feed}>
            {isLoading && posts.length === 0 ? (
              <div className={styles.feedLoading}>
                <ScrollSentinel sentinelRef={{ current: null }} isLoadingMore={true} hasMore={true} />
              </div>
            ) : posts.map((p) => (
              <article key={p.id} className={styles.post}>
                {p.photoUrls.length > 0 && (
                  <div className={styles.postImgContainer}>
                    <ImageCarousel
                      urls={p.photoUrls}
                      onImageClick={(i) => setViewerState({ srcs: p.photoUrls, index: i })}
                    />
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
                  <button
                    className={styles.postHeader}
                    onClick={() => {
                      if (user && p.userId === user.id) {
                        navigate('/profile');
                      } else {
                        setProfileCardUserId(p.userId);
                      }
                    }}
                  >
                    <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.userAvatar} variant="circle" />
                    <div className={styles.userInfo}>
                      <div className={styles.userName}>
                        {p.userNickname ?? 'Unknown'}
                        <LevelBadge level={p.userLevel} />
                      </div>
                      <div className={styles.timestamp}>{formatRelativeTime(p.createdAt)}</div>
                    </div>
                  </button>
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
                  </div>
                </div>
              </article>
            ))}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </div>
        )}
      </div>
      </div>{/* contentStyle wrapper */}
      </div>{/* scrollBody */}

      <BottomSheet open={!!activePost} onClose={() => setActivePost(null)} height="full">
        {activePost && <CommentSheet post={activePost} />}
      </BottomSheet>

      {viewerState && <ImageViewer srcs={viewerState.srcs} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />}

      <ProfileCard
        userId={profileCardUserId}
        open={!!profileCardUserId}
        onClose={() => setProfileCardUserId(null)}
      />
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
            <AppImage src={c.userAvatarUrl} alt="" className={styles.commentAvatar} variant="circle" />
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
        <AppImage src={user?.avatarUrl ?? undefined} alt="" className={styles.commentAvatar} variant="circle" />
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
