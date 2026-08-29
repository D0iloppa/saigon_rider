import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Trash2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { fetchMembers } from '@/api/dm';
import { deleteChannelPost, fetchChannelPost, type DmChannelPost } from '@/api/dmChannels';
import { formatRelativeTime } from '@/lib/format';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useUserStore } from '@/store/useUserStore';
import styles from './DmBoardPost.module.css';

/**
 * 게시판 글 상세 (init/218, P1) — 본문 + 사진.
 * 삭제는 작성자 본인 또는 운영진(owner/admin) — 서버와 같은 기준으로 버튼을 노출한다.
 * 댓글은 P2 — 여기서는 API 없이 비활성 플레이스홀더 한 줄만 둔다.
 */
export default function DmBoardPost() {
  const { conversationId = '', postId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const me = useUserStore((s) => s.user);
  const openConfirm = useConfirmStore((s) => s.open);

  const [post, setPost] = useState<DmChannelPost | null>(null);
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!conversationId || !postId) return;
    fetchChannelPost(conversationId, postId)
      .then(setPost)
      .catch(() => setFailed(true));
    fetchMembers(conversationId)
      .then((rows) => setMyRole(rows.find((m) => m.userId === me?.id)?.role ?? 'member'))
      .catch(() => {});
  }, [conversationId, postId, me?.id]);

  const canDelete = !!post && (post.authorId === me?.id || myRole === 'owner' || myRole === 'admin');

  const handleDelete = () =>
    openConfirm(t('dm.board.deletePostConfirm', { defaultValue: '이 글을 삭제할까요?' }), async () => {
      try {
        await deleteChannelPost(conversationId, postId);
        navigate(`/dm/${conversationId}/board`, { replace: true });
      } catch {
        toast.error(t('common.errorUnexpected'));
      }
    });

  const authorName = post?.authorNickname ?? t('dm.unknownMember', { defaultValue: '알 수 없음' });

  return (
    <div className={styles.page}>
      <TopBar
        title={t('dm.board.title', { defaultValue: '게시판' })}
        rightContent={
          canDelete ? (
            <button
              type="button"
              className={styles.headerBtn}
              onClick={handleDelete}
              aria-label={t('dm.board.deletePost', { defaultValue: '글 삭제' })}
            >
              <Trash2 size={20} strokeWidth={2} />
            </button>
          ) : undefined
        }
      />

      <div className={styles.body}>
        {failed && (
          <StateBlock
            icon={MessageSquare}
            tone="error"
            title={t('dm.board.postGone', { defaultValue: '글을 찾을 수 없어요' })}
          />
        )}

        {post && (
          <>
            <div className={styles.head}>
              <Avatar src={post.authorAvatarUrl} name={authorName} seed={post.authorId} size={36} />
              <div className={styles.headText}>
                <span className={styles.author}>{authorName}</span>
                <span className={`${styles.time} num`}>{formatRelativeTime(post.createdAt)}</span>
              </div>
            </div>

            <p className={styles.content}>{post.body}</p>

            {post.imageUrls.map((url) => (
              <span key={url} className={styles.image}>
                <AppImage src={url} alt="" />
              </span>
            ))}

            {/* 댓글은 P2 — 자리만 잡아두고 아직 열지 않는다 */}
            <div className={styles.commentsPlaceholder} aria-disabled="true">
              <MessageSquare size={14} />
              <span>{t('dm.board.commentsSoon', { defaultValue: '댓글은 곧 열려요' })}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
