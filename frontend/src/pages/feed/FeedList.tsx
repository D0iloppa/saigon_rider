import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { fetchFeed, fetchComments, toggleCheer } from '@/api/feed';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost, Comment } from '@/api/types';
import { StoryAvatar } from '@/components/ui/StoryAvatar';
import { Chip } from '@/components/ui/Chip';
import { LevelBadge } from '@/components/ui/LevelBadge';
import styles from './FeedList.module.css';

type FilterKey = 'all' | 'neighborhood' | 'friends' | 'hot';

export default function FeedList() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [activePost, setActivePost] = useState<FeedPost | null>(null);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',          label: t('feed.filterAll') },
    { key: 'neighborhood', label: t('feed.filterNeighborhood') },
    { key: 'friends',      label: t('feed.filterFriends') },
    { key: 'hot',          label: t('feed.filterHot') },
  ];

  useEffect(() => {
    fetchFeed(filter).then(setPosts);
  }, [filter]);

  const handleCheer = async (p: FeedPost, e: React.MouseEvent) => {
    e.stopPropagation();
    const { cheered, count } = await toggleCheer(p.id);
    setPosts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, iCheered: cheered, cheerCount: count } : x))
    );
  };

  return (
    <>
      <TopBar
        title={t('feed.title')}
        showBack={false}
        rightContent={
          <>
            <button className={styles.iconBtn}>📷</button>
            <button className={styles.iconBtn}>🔔</button>
          </>
        }
      />

      <div className={styles.body}>
        {/* Story strip */}
        <div className={styles.storyRow}>
          <div className={`${styles.story} ${styles.storyMe}`}>
            <StoryAvatar label={t('feed.myStory')} isMe />
          </div>
          {['@minh', '@linh', '@nam', '@thanh', '@mai'].map((n, i) => (
            <div key={n} className={styles.story}>
              <StoryAvatar src={`https://i.pravatar.cc/96?img=${12 + i * 7}`} label={n} hasStory />
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
                  <div className={styles.postImg}>
                    <img src={p.photoUrl} alt="" />
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
                      <div className={styles.timestamp}>
                        {formatRelativeTime(p.createdAt)}
                      </div>
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
                    <button
                      className={styles.actionBtn}
                      onClick={() => setActivePost(p)}
                    >
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

      <BottomSheet
        open={!!activePost}
        onClose={() => setActivePost(null)}
        height="full"
      >
        {activePost && <CommentSheet post={activePost} />}
      </BottomSheet>
    </>
  );
}

function CommentSheet({ post }: { post: FeedPost }) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    fetchComments(post.id).then(setComments);
  }, [post.id]);

  const handleSend = () => {
    if (!input.trim()) return;
    const newC: Comment = {
      id: `c-new-${Date.now()}`,
      postId: post.id,
      userNickname: '@nguyen_rider',
      userAvatarUrl: 'https://i.pravatar.cc/60?img=12',
      content: input.trim(),
      createdAt: new Date().toISOString(),
      likeCount: 0,
    };
    setComments((prev) => [...prev, newC]);
    setInput('');
  };

  return (
    <div className={styles.commentRoot}>
      <h3 className={styles.commentTitle}>
        {t('feed.commentsCount', { count: comments.length })}
      </h3>
      <div className={styles.commentList}>
        {comments.map((c) => (
          <div
            key={c.id}
            className={`${styles.comment} ${c.parentId ? styles.commentReply : ''}`}
          >
            <img src={c.userAvatarUrl} alt="" className={styles.commentAvatar} />
            <div className={styles.commentBody}>
              <div className={styles.commentNick}>
                {c.userNickname}
                <span>{formatRelativeTime(c.createdAt)}</span>
              </div>
              <div className={styles.commentText}>{c.content}</div>
            </div>
            <button className={styles.commentLike}>
              ♥ {c.likeCount > 0 && c.likeCount}
            </button>
          </div>
        ))}
      </div>
      <div className={styles.commentInputBar}>
        <img src="https://i.pravatar.cc/60?img=12" alt="" className={styles.commentAvatar} />
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
