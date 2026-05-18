import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { fetchUserProfile } from '@/api/profile';
import { fetchMyFeed, toggleCheer, fetchComments, postComment, toggleCommentLike } from '@/api/feed';
import { followUser, unfollowUser } from '@/api/follows';
import { createConversation } from '@/api/dm';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { SessionExpiredError } from '@/api/client';
import { toast } from '@/components/ui/Toast';
import { loadSession } from '@/lib/session';
import type { UserProfile } from '@/api/types';
import type { FeedPost, Comment } from '@/api/types';
import styles from './ProfileCard.module.css';

interface Props {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}

const HANDLE_H = 28;
const BOTTOM_PAD = 20;

export function ProfileCard({ userId, open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useUserStore((s) => s.user);

  // Profile
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Feed
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const feedPageRef = useRef(1);
  const feedLoadingRef = useRef(false);
  const feedUserIdRef = useRef<string | null>(null);

  // Comment overlay
  const [activePost, setActivePost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState('');

  // Draggable sheet
  const profileSectionRef = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);

  const snapCollapsedRef = useRef(9999);
  const INITIAL_TY = typeof window !== 'undefined' ? window.innerHeight - 60 : 9999;
  const translateYRef = useRef(INITIAL_TY);
  const [translateY, _setTranslateY] = useState(INITIAL_TY);
  function setTranslateY(v: number) { translateYRef.current = v; _setTranslateY(v); }

  const isScrollableRef = useRef(false);
  const [isScrollable, _setIsScrollable] = useState(false);
  function setIsScrollable(v: boolean) { isScrollableRef.current = v; _setIsScrollable(v); }

  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const touchZoneRef = useRef<'handle' | 'profile' | 'feed'>('handle');
  const dragStartYRef = useRef(0);
  const dragStartTYRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const prevTouchYRef = useRef(0);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PAGE_SIZE = 10;

  const loadFeedPage = useCallback(async (targetUserId: string, page: number, append: boolean) => {
    if (feedLoadingRef.current) return;
    feedLoadingRef.current = true;
    if (append) setFeedLoadingMore(true);
    else setFeedLoading(true);
    try {
      const result = await fetchMyFeed(targetUserId, page, PAGE_SIZE);
      if (append) {
        setFeedPosts((prev) => [...prev, ...result.items]);
      } else {
        setFeedPosts(result.items);
      }
      feedPageRef.current = page;
      setFeedHasMore(page * PAGE_SIZE < result.total);
    } catch {
      // keep existing
    } finally {
      feedLoadingRef.current = false;
      setFeedLoading(false);
      setFeedLoadingMore(false);
    }
  }, []);

  // Load profile + first feed page when open
  useEffect(() => {
    if (!open || !userId) {
      setProfile(null);
      setFeedPosts([]);
      setFeedHasMore(true);
      feedPageRef.current = 1;
      feedLoadingRef.current = false;
      feedUserIdRef.current = null;
      return;
    }
    setProfileLoading(true);
    fetchUserProfile(userId, me?.id)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileLoading(false));

    feedUserIdRef.current = userId;
    feedPageRef.current = 1;
    feedLoadingRef.current = false;
    setFeedHasMore(true);
    loadFeedPage(userId, 1, false);
  }, [open, userId, me?.id, loadFeedPage]);

  // Feed scroll → load next page when near bottom
  const handleFeedScroll = useCallback(() => {
    const el = feedScrollRef.current;
    const uid = feedUserIdRef.current;
    if (!el || !uid || feedLoadingRef.current || !feedHasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadFeedPage(uid, feedPageRef.current + 1, true);
    }
  }, [feedHasMore, loadFeedPage]);

  // Compute snap and animate in after profile section renders
  useEffect(() => {
    if (!open || !profile) return;
    requestAnimationFrame(() => {
      if (!profileSectionRef.current) return;
      const ph = profileSectionRef.current.offsetHeight;
      const sheetH = window.innerHeight - 60;
      const collapsed = Math.max(0, sheetH - HANDLE_H - ph - BOTTOM_PAD);
      snapCollapsedRef.current = collapsed;
      setTranslateY(collapsed);
    });
  }, [open, profile]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setTranslateY(typeof window !== 'undefined' ? window.innerHeight - 60 : 9999);
      setIsScrollable(false);
      setActivePost(null);
    }
  }, [open]);

  // ESC key
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  // ── Follow handlers ───────────────────────────────────────────
  async function doFollow() {
    if (!profile || !me) return;
    setToggling(true);
    try {
      await followUser(profile.id);
      setProfile((prev) => prev ? { ...prev, isFollowing: true, followerCount: prev.followerCount + 1 } : prev);
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError) return;
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setToggling(false);
    }
  }

  async function doUnfollow() {
    if (!profile || !me) return;
    setToggling(true);
    try {
      await unfollowUser(profile.id);
      setProfile((prev) => prev ? { ...prev, isFollowing: false, followerCount: Math.max(0, prev.followerCount - 1) } : prev);
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError) return;
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setToggling(false);
    }
  }

  const [dmLoading, setDmLoading] = useState(false);

  async function handleDm() {
    if (!profile) return;
    setDmLoading(true);
    try {
      const conv = await createConversation(profile.id);
      onClose();
      navigate(`/dm/${conv.id}`);
    } catch {
      toast.error('DM을 시작할 수 없습니다');
    } finally {
      setDmLoading(false);
    }
  }

  function handleToggleFollow() {
    if (!profile || !me) return;
    if (profile.isFollowing) {
      useDialogStore.getState().open({
        message: { mode: 'code', value: 'follow.unfollowConfirm' },
        onConfirm: doUnfollow,
      });
    } else {
      doFollow();
    }
  }

  // ── Like handler ──────────────────────────────────────────────
  async function handleLike(post: FeedPost, e: React.MouseEvent) {
    e.stopPropagation();
    const { cheered, count } = await toggleCheer(post.id);
    setFeedPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, iCheered: cheered, cheerCount: count } : p));
  }

  // ── Comment handlers ──────────────────────────────────────────
  async function openComments(post: FeedPost) {
    setActivePost(post);
    setComments([]);
    setCommentInput('');
    const list = await fetchComments(post.id);
    setComments(list);
  }

  async function handleSendComment() {
    if (!activePost || !commentInput.trim()) return;
    const session = loadSession();
    if (!session) return;
    const text = commentInput.trim();
    setCommentInput('');
    const { id, createdAt } = await postComment(activePost.id, text, session.userId);
    const newC: Comment = {
      id,
      postId: activePost.id,
      userNickname: me?.nickname ?? session.userId,
      userAvatarUrl: me?.avatarUrl ?? undefined,
      content: text,
      createdAt,
      likeCount: 0,
      iLiked: false,
    };
    setComments((prev) => [...prev, newC]);
    setFeedPosts((prev) => prev.map((p) => p.id === activePost.id ? { ...p, commentCount: p.commentCount + 1 } : p));
  }

  async function handleCommentLike(c: Comment) {
    if (!activePost) return;
    const { liked, count } = await toggleCommentLike(activePost.id, c.id);
    setComments((prev) => prev.map((x) => x.id === c.id ? { ...x, iLiked: liked, likeCount: count } : x));
  }

  // ── Drag handlers ─────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const zone = (e.currentTarget as HTMLElement).dataset.zone as 'handle' | 'profile' | 'feed';
    touchZoneRef.current = zone ?? 'profile';
    dragStartYRef.current = e.touches[0].clientY;
    dragStartTYRef.current = translateYRef.current;
    dragStartTimeRef.current = Date.now();
    prevTouchYRef.current = e.touches[0].clientY;
    draggingRef.current = false;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    // Don't disable scrollable here for feed zone — let onTouchMove decide
    if (zone !== 'feed') setIsScrollable(false);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const clientY = e.touches[0].clientY;
    const dy = clientY - dragStartYRef.current;
    prevTouchYRef.current = clientY;

    if (touchZoneRef.current === 'feed') {
      const scrollTop = feedScrollRef.current?.scrollTop ?? 0;
      if (scrollTop > 0) {
        setIsScrollable(true);
        return;
      }
      if (dy < 0) {
        // dragging upward at scroll top → let feed scroll
        setIsScrollable(true);
        return;
      }
      // dragging downward at scroll top → collapse sheet
      setIsScrollable(false);
    }

    draggingRef.current = true;
    setIsDragging(true);
    const newTY = Math.max(0, Math.min(snapCollapsedRef.current, dragStartTYRef.current + dy));
    setTranslateY(newTY);
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    setIsDragging(false);

    if (!draggingRef.current) {
      if (translateYRef.current === 0) {
        scrollTimerRef.current = setTimeout(() => setIsScrollable(true), 100);
      }
      return;
    }
    draggingRef.current = false;

    const totalDy = e.changedTouches[0].clientY - dragStartYRef.current;
    const totalTime = Math.max(1, Date.now() - dragStartTimeRef.current);
    const velocity = totalDy / totalTime; // px/ms, positive = downward

    const snap = snapCollapsedRef.current;
    let target: number;
    if (velocity > 0.4) {
      target = snap;
    } else if (velocity < -0.4) {
      target = 0;
    } else {
      target = translateYRef.current < snap / 2 ? 0 : snap;
    }

    setTranslateY(target);
    if (target === 0) {
      scrollTimerRef.current = setTimeout(() => setIsScrollable(true), 300);
    } else {
      setIsScrollable(false);
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────
  if (!open) return null;

  const riderStyleLabel = profile?.riderStyle === 'commuter'
    ? t('profileSetup.styleCommuterTitle')
    : profile?.riderStyle === 'cafe_hunter'
    ? t('profileSetup.styleCafeHunterTitle')
    : profile?.riderStyle === 'night_rider'
    ? t('profileSetup.styleNightRiderTitle')
    : null;

  return createPortal(
    <div className={styles.root}>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Draggable sheet */}
      <div
        className={`${styles.sheet} ${isDragging ? styles.dragging : ''}`}
        style={{ transform: `translateY(${translateY}px)` }}
      >
        {/* Drag handle */}
        <div
          className={styles.handleArea}
          data-zone="handle"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className={styles.grabber} />
        </div>

        {/* Profile section */}
        <div
          ref={profileSectionRef}
          className={styles.profileSection}
          data-zone="profile"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {profileLoading ? (
            <div className={styles.loading}>{t('common.loading')}</div>
          ) : profile ? (
            <>
              <div className={styles.header}>
                <AppImage
                  src={profile.avatarUrl || '/saigon-default.jpg'}
                  alt=""
                  className={styles.avatar}
                  variant="circle"
                />
                <div className={styles.info}>
                  <div className={styles.nickRow}>
                    <span className={styles.nickname}>{profile.nickname ?? 'Unknown'}</span>
                    <LevelBadge level={profile.level} />
                  </div>
                  {riderStyleLabel && (
                    <Chip variant="surface">🌙 {riderStyleLabel}</Chip>
                  )}
                </div>
              </div>

              <div className={styles.statsRow}>
                <div className={styles.statCell}>
                  <span className={styles.statNum}>{formatNumber(profile.followerCount)}</span>
                  <span className={styles.statLabel}>{t('follow.followers')}</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statCell}>
                  <span className={styles.statNum}>{formatNumber(profile.followingCount)}</span>
                  <span className={styles.statLabel}>{t('follow.following')}</span>
                </div>
              </div>

              {me && me.id !== profile.id && (
                <div className={styles.actionRow}>
                  <Button
                    variant={profile.isFollowing ? 'secondary' : 'primary'}
                    onClick={handleToggleFollow}
                    disabled={toggling}
                    className={styles.followBtn}
                  >
                    {profile.isFollowing ? t('follow.unfollowBtn', '언팔로우') : t('follow.followBtn')}
                  </Button>
                  <button
                    className={styles.dmBtn}
                    onClick={handleDm}
                    disabled={dmLoading}
                    aria-label="DM"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              )}

              <div className={styles.feedHint}>
                <span>{t('profile.tabFeeds', '게시물')}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </>
          ) : (
            <div className={styles.loading}>{t('common.error', 'Error')}</div>
          )}
        </div>

        {/* Feed section */}
        <div
          ref={feedScrollRef}
          className={`${styles.feedSection} ${isScrollable ? styles.feedScrollable : ''}`}
          data-zone="feed"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onScroll={handleFeedScroll}
        >
          {feedLoading ? (
            <div className={styles.feedPlaceholder}>{t('common.loading')}</div>
          ) : feedPosts.length === 0 ? (
            <div className={styles.feedPlaceholder}>{t('profile.emptyFeeds', '게시물이 없습니다')}</div>
          ) : (
            <div className={styles.feedList}>
              {feedPosts.map((p) => (
                <article key={p.id} className={styles.post}>
                  {p.photoUrls.length > 0 && (
                    <div className={styles.postImg}>
                      <ImageCarousel urls={p.photoUrls} />
                    </div>
                  )}
                  <div className={styles.postBody}>
                    <div className={styles.postMeta}>
                      <AppImage
                        src={p.userAvatarUrl ?? undefined}
                        alt=""
                        className={styles.postAvatar}
                        variant="circle"
                      />
                      <div className={styles.postUser}>
                        <span className={styles.postNick}>{p.userNickname ?? 'Unknown'}</span>
                        <span className={styles.postTime}>{formatRelativeTime(p.createdAt)}</span>
                      </div>
                    </div>
                    {p.caption && <p className={styles.postCaption}>{p.caption}</p>}
                    {p.hashtags.length > 0 && (
                      <div className={styles.hashtagRow}>
                        {p.hashtags.map((tag) => (
                          <span key={tag} className={styles.hashtag}>#{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className={styles.postActions}>
                      <button
                        className={`${styles.actionBtn} ${p.iCheered ? styles.actionActive : ''}`}
                        onClick={(e) => handleLike(p, e)}
                      >
                        🔥 <span>{p.cheerCount}</span>
                      </button>
                      <button className={styles.actionBtn} onClick={() => openComments(p)}>
                        💬 <span>{p.commentCount}</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {feedLoadingMore && <div className={styles.feedLoadingMore} />}
              {!feedHasMore && feedPosts.length > 0 && <div className={styles.feedEnd} />}
            </div>
          )}
        </div>
      </div>

      {/* Comment overlay — stacked above the sheet */}
      {activePost && (
        <>
          <div className={styles.commentBackdrop} onClick={() => setActivePost(null)} />
          <div className={styles.commentSheet}>
            <div className={styles.commentGrabber} />
            <h3 className={styles.commentTitle}>
              {t('feed.commentsCount', { count: comments.length })}
            </h3>
            <div className={styles.commentList}>
              {comments.map((c) => (
                <div key={c.id} className={styles.commentItem}>
                  <AppImage src={c.userAvatarUrl} alt="" className={styles.commentAvatar} variant="circle" />
                  <div className={styles.commentBody}>
                    <div className={styles.commentNick}>{c.userNickname}</div>
                    <div className={styles.commentText}>{c.content}</div>
                  </div>
                  <button
                    className={`${styles.commentLike} ${c.iLiked ? styles.commentLikeActive : ''}`}
                    onClick={() => handleCommentLike(c)}
                  >
                    ♥{c.likeCount > 0 ? ` ${c.likeCount}` : ''}
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.commentInputBar}>
              <AppImage src={me?.avatarUrl ?? undefined} alt="" className={styles.commentAvatar} variant="circle" />
              <input
                placeholder={t('feed.commentPlaceholder')}
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
              />
              <button
                className={`${styles.sendBtn} ${commentInput.trim() ? styles.sendBtnActive : ''}`}
                onClick={handleSendComment}
                disabled={!commentInput.trim()}
              >
                ↗
              </button>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
