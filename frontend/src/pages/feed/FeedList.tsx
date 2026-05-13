import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { fetchFeed, fetchComments, toggleCheer } from '@/api/feed';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost, Comment } from '@/api/types';
import styles from './FeedList.module.css';

const FILTERS = [
  { key: 'all', label: '🌐 전체' },
  { key: 'neighborhood', label: '📍 내 동네' },
  { key: 'friends', label: '👥 친구' },
  { key: 'hot', label: '🔥 핫' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export default function FeedList() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [activePost, setActivePost] = useState<FeedPost | null>(null);

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
        title="피드"
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
            <div className={styles.storyAvatar}>+</div>
            <span>내 스토리</span>
          </div>
          {['@minh', '@linh', '@nam', '@thanh', '@mai'].map((n, i) => (
            <div key={n} className={styles.story}>
              <div className={styles.storyRing}>
                <img src={`https://i.pravatar.cc/96?img=${12 + i * 7}`} alt="" />
              </div>
              <span>{n}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className={styles.filterRow}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`${styles.filterChip} ${filter === f.key ? styles.filterActive : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📸</div>
            <h2>첫 인증을 기다리고 있어요</h2>
            <p>라이딩을 완료하고 사이공의 한 컷을 남겨보세요</p>
          </div>
        ) : (
          <div className={styles.feed}>
            {posts.map((p) => (
              <article key={p.id} className={styles.post}>
                <div className={styles.postImg}>
                  <img src={p.photoUrl} alt="" />
                  <div className={styles.imgStats}>
                    {p.distanceKm.toFixed(1)}km · 안전 {p.safetyGrade}
                  </div>
                  <div className={styles.imgReward}>+{p.rewardExp} EXP</div>
                </div>
                <div className={styles.postBody}>
                  <div className={styles.postHeader}>
                    <img src={p.userAvatarUrl} alt="" className={styles.userAvatar} />
                    <div className={styles.userInfo}>
                      <div className={styles.userName}>
                        {p.userNickname}
                        <span className={styles.levelChip}>LV.{p.userLevel}</span>
                      </div>
                      <div className={styles.timestamp}>
                        {formatRelativeTime(p.createdAt)}
                      </div>
                    </div>
                  </div>
                  <p className={styles.caption}>{p.caption}</p>
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
      <h3 className={styles.commentTitle}>댓글 {comments.length}</h3>
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
          placeholder="댓글을 남겨보세요..."
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
