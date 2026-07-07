import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchFeedPost, fetchComments, toggleCheer, toggleCommentLike, postComment } from '@/api/feed';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost, Comment } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { ProfileCard } from '@/components/ProfileCard';
import { useUserStore } from '@/store/useUserStore';
import { loadSession } from '@/lib/session';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { ImageViewer } from './FeedList';
import feedStyles from './FeedList.module.css';
import styles from './FeedDetail.module.css';

/** 게시글 상세 — 홈 인기글 카드 등에서 진입. 게시글 + 댓글 인라인 + 하단 입력바. */
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
    <div className={styles.page}>
      <TopBar title={t('feed.detailTitle', { defaultValue: '게시글' })} />

      <div className={styles.scroll}>
        {loading || !post ? (
          <div className={styles.loading}>
            <ScrollSentinel sentinelRef={{ current: null }} isLoadingMore={true} hasMore={true} />
          </div>
        ) : (
          <>
            <article className={feedStyles.post}>
              {post.photoUrls.length > 0 && (
                <div className={feedStyles.postImgContainer}>
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
              <div className={feedStyles.postBody}>
                <button className={feedStyles.postHeader} onClick={handleAuthorTap}>
                  <AppImage src={post.userAvatarUrl ?? undefined} alt="" className={feedStyles.userAvatar} variant="circle" />
                  <div className={feedStyles.userInfo}>
                    <div className={feedStyles.userName}>
                      {post.userNickname ?? 'Unknown'}
                      <LevelBadge level={post.userLevel} />
                    </div>
                    <div className={feedStyles.timestamp}>{formatRelativeTime(post.createdAt)}</div>
                  </div>
                </button>
                {post.caption && <p className={feedStyles.caption}>{post.caption}</p>}
                {post.hashtags.length > 0 && (
                  <div className={feedStyles.hashtagRow}>
                    {post.hashtags.map((tag) => (
                      <span key={tag} className={feedStyles.hashtag}>#{tag}</span>
                    ))}
                  </div>
                )}
                <div className={feedStyles.actions}>
                  <button
                    className={`${feedStyles.actionBtn} ${post.iCheered ? feedStyles.actionActive : ''}`}
                    onClick={handleCheer}
                  >
                    🔥 <span>{post.cheerCount}</span>
                  </button>
                  <span className={feedStyles.actionBtn}>
                    💬 <span>{post.commentCount}</span>
                  </span>
                </div>
              </div>
            </article>

            {/* 댓글 — 시트 대신 인라인 */}
            <div className={styles.comments}>
              <h3 className={feedStyles.commentTitle}>{t('feed.commentsCount', { count: comments.length })}</h3>
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
          </>
        )}
      </div>

      {/* 하단 댓글 입력바 (탭바 숨김 화면 — safe-area 직접 처리) */}
      <div
        className={styles.inputBarWrap}
        style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}
      >
        <div className={feedStyles.commentInputBar}>
          <AppImage src={user?.avatarUrl ?? undefined} alt="" className={feedStyles.commentAvatar} variant="circle" />
          <input
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
      </div>

      {viewerState && <ImageViewer srcs={viewerState.srcs} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />}

      <ProfileCard userId={profileCardUserId} open={!!profileCardUserId} onClose={() => setProfileCardUserId(null)} />
    </div>
  );
}
