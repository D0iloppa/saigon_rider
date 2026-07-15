import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { fetchFeedPost, fetchComments, toggleCheer, toggleCommentLike, postComment } from '@/api/feed';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost, Comment } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { ProfileCard } from '@/components/ProfileCard';
import { useUserStore } from '@/store/useUserStore';
import { loadSession } from '@/lib/session';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { ImageViewer } from './FeedList';
import feedStyles from './FeedList.module.css';
import styles from './FeedDetail.module.css';

/** 피드 상세 — 상품(매물) 상세(/market/:id)와 레이아웃 통일 (2026-07-12). 게시글 + 댓글 인라인 + 하단 액션바(응원·댓글 입력). */
export default function FeedDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  const user = useUserStore((s) => s.user);

  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState('');
  const [viewerState, setViewerState] = useState<{ srcs: string[]; index: number } | null>(null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이(웹뷰 리사이즈 없음) → 입력바가 flex 하단에
  // 있어도 그 자리를 키보드가 그냥 덮는다. 키보드 높이만큼 padding 을 더해 위로 밀어낸다.
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    Promise.all([fetchFeedPost(postId), fetchComments(postId)])
      .then(([p, cs]) => {
        setPost(p);
        setComments(cs);
      })
      .catch(() => {
        toast.error(t('feed.postNotFound', { defaultValue: '게시글을 찾을 수 없어요' }));
        navigate('/feed', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheer = async () => {
    if (!post) return;
    const { cheered, count } = await toggleCheer(post.id);
    setPost({ ...post, iCheered: cheered, cheerCount: count });
  };

  const handleCommentLike = async (c: Comment) => {
    if (!post) return;
    const { liked, count } = await toggleCommentLike(post.id, c.id);
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, iLiked: liked, likeCount: count } : x)));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !post) return;
    setInput('');
    const session = loadSession();
    if (!session) return;
    const { id, createdAt } = await postComment(post.id, text, session.userId);
    setComments((prev) => [
      ...prev,
      {
        id,
        postId: post.id,
        userNickname: user?.nickname ?? session.userId,
        userAvatarUrl: user?.avatarUrl ?? undefined,
        content: text,
        createdAt,
        likeCount: 0,
        iLiked: false,
      },
    ]);
    setPost({ ...post, commentCount: post.commentCount + 1 });
  };

  const handleAuthorTap = () => {
    if (!post) return;
    if (user && post.userId === user.id) navigate('/profile');
    else setProfileCardUserId(post.userId);
  };

  return (
    <div className={styles.root}>
      {/* Top bar (MarketDetail 미러 — back + 타이틀) */}
      <div className={styles.topbar}>
        <StatusBar variant="dark" />
        <div className={styles.topbarRow}>
          <button className={styles.backBtn} type="button" onClick={() => navigate(-1)} aria-label={t('common.back', { defaultValue: '뒤로' })}>
            <ArrowLeft size={24} strokeWidth={2} />
          </button>
          <h1 className={styles.topTitle}>{t('feed.detailTitle', { defaultValue: '피드' })}</h1>
          <span className={styles.topSpacer} />
        </div>
      </div>

      {loading || !post ? (
        <div className={styles.scroll}>
          <div className={`shimmer ${styles.heroSkeleton}`} />
          <div className={styles.body}>
            <div className={`shimmer ${styles.lineSkeleton}`} />
            <div className={`shimmer ${styles.lineSkeleton}`} style={{ width: '60%' }} />
          </div>
        </div>
      ) : (
        <>
          <div className={styles.scroll}>
            {post.photoUrls.length > 0 && (
              <div className={styles.hero}>
                <ImageCarousel
                  urls={post.photoUrls}
                  onImageClick={(i) => setViewerState({ srcs: post.photoUrls, index: i })}
                />
                {(post.distanceKm != null || post.safetyGrade) && (
                  <div className={feedStyles.imgStats}>
                    {post.distanceKm != null ? `${post.distanceKm.toFixed(1)}km` : ''}
                    {post.distanceKm != null && post.safetyGrade ? ' · ' : ''}
                    {post.safetyGrade ? t('feed.safetyLabel', { grade: post.safetyGrade }) : ''}
                  </div>
                )}
                {post.rewardExp != null && <div className={feedStyles.imgReward}>+{post.rewardExp} EXP</div>}
              </div>
            )}

            <div className={styles.body}>
              {/* Author (MarketDetail sellerRow 미러) */}
              <div className={styles.authorBlock}>
                <button className={styles.authorRow} type="button" onClick={handleAuthorTap}>
                  <AppImage src={post.userAvatarUrl ?? undefined} alt="" className={styles.authorAvatar} variant="circle" />
                  <div className={styles.authorInfo}>
                    <span className={styles.authorName}>
                      {post.userNickname ?? 'Unknown'}
                      <LevelBadge level={post.userLevel} />
                    </span>
                    <span className={styles.authorSub}>{formatRelativeTime(post.createdAt)}</span>
                  </div>
                </button>
              </div>

              {/* Caption + hashtags */}
              {post.caption && <p className={styles.description}>{post.caption}</p>}
              {post.hashtags.length > 0 && (
                <div className={styles.hashtagRow}>
                  {post.hashtags.map((tag) => (
                    <span key={tag} className={feedStyles.hashtag}>#{tag}</span>
                  ))}
                </div>
              )}

              {/* 댓글 — 인라인 (MarketDetail otherSection 구획 관례) */}
              <div className={styles.commentsSection}>
                <h2 className={styles.commentsTitle}>{t('feed.commentsCount', { count: comments.length })}</h2>
                {comments.map((c) => (
                  <div key={c.id} className={`${feedStyles.comment} ${c.parentId ? feedStyles.commentReply : ''}`}>
                    <AppImage src={c.userAvatarUrl} alt="" className={feedStyles.commentAvatar} variant="circle" />
                    <div className={feedStyles.commentBody}>
                      <div className={feedStyles.commentNick}>
                        {c.userNickname}
                        <span>{formatRelativeTime(c.createdAt)}</span>
                      </div>
                      <div className={feedStyles.commentText}>{c.content}</div>
                    </div>
                    <button
                      className={`${feedStyles.commentLike} ${c.iLiked ? feedStyles.commentLikeActive : ''}`}
                      onClick={() => handleCommentLike(c)}
                    >
                      ♥ {c.likeCount > 0 && c.likeCount}
                    </button>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className={styles.noComments}>{t('feed.noComments', { defaultValue: '첫 댓글을 남겨보세요' })}</p>
                )}
              </div>
            </div>
          </div>

          {/* Bottom action bar (MarketDetail actionBar 미러) — 🔥응원 토글 + 💬수 + 댓글 입력 (탭바 숨김 화면 — safe-area 직접 처리) */}
          <div
            className={styles.actionBar}
            style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}
          >
            <button
              className={`${styles.cheerBtn} ${post.iCheered ? styles.cheerBtnActive : ''}`}
              onClick={handleCheer}
            >
              🔥 {post.cheerCount}
            </button>
            <span className={styles.countChip}>💬 {post.commentCount}</span>
            <input
              className={styles.commentInput}
              placeholder={t('feed.commentPlaceholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button
              className={`${feedStyles.sendBtn} ${input.trim() ? feedStyles.sendBtnActive : ''}`}
              onClick={handleSend}
              disabled={!input.trim()}
            >
              ↗
            </button>
          </div>
        </>
      )}

      {viewerState && <ImageViewer srcs={viewerState.srcs} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />}

      <ProfileCard userId={profileCardUserId} open={!!profileCardUserId} onClose={() => setProfileCardUserId(null)} />
    </div>
  );
}
