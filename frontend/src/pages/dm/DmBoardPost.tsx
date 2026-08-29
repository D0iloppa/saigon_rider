import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, MessageSquare, Trash2, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { fetchMembers } from '@/api/dm';
import {
  createChannelComment,
  deleteChannelComment,
  deleteChannelPost,
  fetchChannelComments,
  fetchChannelPost,
  type DmChannelComment,
  type DmChannelPost,
} from '@/api/dmChannels';
import { formatRelativeTime } from '@/lib/format';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useUserStore } from '@/store/useUserStore';
import styles from './DmBoardPost.module.css';

/**
 * 게시판 글 상세 (init/218 글 + init/219 댓글) — 본문 + 사진 + 댓글 스레드.
 * 글·댓글 삭제는 작성자 본인 또는 운영진(owner/admin) — 서버와 같은 기준으로 버튼을 노출한다.
 * 답글은 한 단계만 들여쓴다(서버가 답글의 답글을 같은 단으로 접는다).
 */
export default function DmBoardPost() {
  const { conversationId = '', postId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const me = useUserStore((s) => s.user);
  const openConfirm = useConfirmStore((s) => s.open);

  const [post, setPost] = useState<DmChannelPost | null>(null);
  const [comments, setComments] = useState<DmChannelComment[]>([]);
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [failed, setFailed] = useState(false);
  const [input, setInput] = useState('');
  // mention: 답글의 답글일 때 실제로 답한 상대 — 스레드는 최상위(id)에 붙으므로 본문 앞에 "@닉" 으로 남긴다.
  const [replyTo, setReplyTo] = useState<{ id: string; name: string; mention: string | null } | null>(null);
  const [sending, setSending] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브 키보드는 웹뷰를 리사이즈하지 않는 순수 오버레이 → 입력바를 직접 밀어올린다(FeedDetail 과 동일).
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    if (!conversationId || !postId) return;
    fetchChannelPost(conversationId, postId)
      .then(setPost)
      .catch(() => setFailed(true));
    fetchChannelComments(conversationId, postId)
      .then(setComments)
      .catch(() => {});
    fetchMembers(conversationId)
      .then((rows) => setMyRole(rows.find((m) => m.userId === me?.id)?.role ?? 'member'))
      .catch(() => {});
  }, [conversationId, postId, me?.id]);

  const isManager = myRole === 'owner' || myRole === 'admin';
  const canDelete = !!post && (post.authorId === me?.id || myRole === 'owner' || myRole === 'admin');
  const unknown = t('dm.unknownMember', { defaultValue: '알 수 없음' });

  const handleDelete = () =>
    openConfirm(t('dm.board.deletePostConfirm', { defaultValue: '이 글을 삭제할까요?' }), async () => {
      try {
        await deleteChannelPost(conversationId, postId);
        navigate(`/dm/${conversationId}/board`, { replace: true });
      } catch {
        toast.error(t('common.errorUnexpected'));
      }
    });

  const handleSend = async () => {
    const typed = input.trim();
    if (!typed || sending) return;
    const body = replyTo?.mention ? `@${replyTo.mention} ${typed}` : typed;
    setSending(true);
    try {
      const created = await createChannelComment(conversationId, postId, body, replyTo?.id ?? null);
      setComments((prev) => [...prev, created]);
      // 글 카드의 댓글 수는 목록 화면이 다시 불러온다 — 여기서는 상세의 표시만 맞춘다.
      setPost((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
      setInput('');
      setReplyTo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = (comment: DmChannelComment) =>
    openConfirm(t('dm.board.commentDeleteConfirm', { defaultValue: '이 댓글을 삭제할까요?' }), async () => {
      try {
        await deleteChannelComment(conversationId, postId, comment.id);
        setComments((prev) => {
          // 답글이 남아 있으면 서버도 자리표시로 남긴다 — 화면도 같은 규칙으로 갱신한다.
          const hasReply = prev.some((c) => c.parentId === comment.id && !c.deleted);
          return hasReply
            ? prev.map((c) =>
                c.id === comment.id
                  ? { ...c, deleted: true, body: '', authorNickname: null, authorAvatarUrl: null }
                  : c,
              )
            : prev.filter((c) => c.id !== comment.id);
        });
        setPost((prev) => (prev ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) } : prev));
        setReplyTo((prev) => (prev?.id === comment.id ? null : prev));
      } catch {
        toast.error(t('common.errorUnexpected'));
      }
    });

  const renderComment = (c: DmChannelComment, isReply: boolean) => {
    const name = c.authorNickname ?? unknown;
    const canDeleteComment = !c.deleted && (c.authorId === me?.id || isManager);
    return (
      <div key={c.id} className={styles.comment} data-reply={isReply || undefined}>
        {c.deleted ? (
          <p className={styles.commentGone}>{t('dm.board.commentDeleted', { defaultValue: '삭제된 댓글이에요' })}</p>
        ) : (
          <>
            <Avatar src={c.authorAvatarUrl} name={name} seed={c.authorId} size={28} />
            <div className={styles.commentBody}>
              <div className={styles.commentHead}>
                <span className={styles.commentAuthor}>{name}</span>
                <span className={`${styles.time} num`}>{formatRelativeTime(c.createdAt)}</span>
              </div>
              <p className={styles.commentText}>{c.body}</p>
              <div className={styles.commentActions}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    // 답글에 답글을 달면 스레드는 최상위 댓글에 붙는다 — 칩 이름도 그 최상위 작성자로 맞추고,
                    // 정작 답한 상대는 본문 앞 "@닉" 으로 보존한다.
                    const parent = c.parentId ? comments.find((p) => p.id === c.parentId) : null;
                    setReplyTo({
                      id: c.parentId ?? c.id,
                      name: parent ? (parent.authorNickname ?? unknown) : name,
                      mention: parent ? name : null,
                    });
                  }}
                >
                  {t('dm.board.commentReply', { defaultValue: '답글' })}
                </button>
                {canDeleteComment && (
                  <button type="button" className={styles.linkBtn} onClick={() => handleDeleteComment(c)}>
                    {t('dm.board.commentDelete', { defaultValue: '삭제' })}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const authorName = post?.authorNickname ?? unknown;
  const topLevel = comments.filter((c) => !c.parentId);

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

            <div className={styles.comments}>
              <h2 className={styles.commentsTitle}>
                <MessageSquare size={14} strokeWidth={2.2} />
                {t('dm.board.comments', { defaultValue: '댓글' })}
                <span className="num">{post.commentCount}</span>
              </h2>
              {topLevel.length === 0 ? (
                <p className={styles.commentsEmpty}>
                  {t('dm.board.commentsEmpty', { defaultValue: '첫 댓글을 남겨보세요' })}
                </p>
              ) : (
                topLevel.map((c) => (
                  <div key={c.id} className={styles.thread}>
                    {renderComment(c, false)}
                    {comments.filter((r) => r.parentId === c.id).map((r) => renderComment(r, true))}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {post && (
        <div className={styles.composer} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
          {replyTo && (
            <div className={styles.replyChip}>
              <span>{t('dm.board.commentReplyingTo', { name: replyTo.name, defaultValue: `${replyTo.name}에게 답글` })}</span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label={t('dm.board.commentCancelReply', { defaultValue: '답글 취소' })}
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>
          )}
          <div className={styles.composerRow}>
            <input
              className={styles.commentInput}
              value={input}
              maxLength={1000}
              placeholder={t('dm.board.commentPlaceholder', { defaultValue: '댓글을 남겨보세요' })}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && handleSend()}
            />
            <button
              type="button"
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!input.trim() || sending}
              aria-label={t('dm.board.commentSubmit', { defaultValue: '댓글 올리기' })}
            >
              <ArrowUp size={20} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
