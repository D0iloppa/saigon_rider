import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, LayoutList, MessageSquare, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Avatar } from '@/components/ui/Avatar';
import { AppImage } from '@/components/ui/AppImage';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { fetchConversation, fetchMembers } from '@/api/dm';
import {
  createChannel,
  deleteChannel,
  fetchChannelPosts,
  fetchChannels,
  patchChannel,
  type DmChannel,
  type DmChannelPost,
} from '@/api/dmChannels';
import { formatRelativeTime } from '@/lib/format';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useUserStore } from '@/store/useUserStore';
import styles from './DmBoard.module.css';

/**
 * 대화방 게시판 (init/218, P1) — 채널 탭 + 글 목록.
 *
 * 서버 규칙을 화면에 그대로 반영한다:
 * - direct 방에는 게시판이 없다(서버도 400) — 진입점 자체를 DmDetail 이 group/open 에서만 노출한다.
 * - 채널 만들기/이름변경/순서변경/삭제는 운영진(owner/admin)만 — 일반 멤버에게는 관리 진입점을 숨긴다.
 * - 글은 멤버 누구나 쓴다.
 * 카드의 댓글 수는 진입할 때마다 목록을 다시 불러와 갱신된다(상세에서 달고 뒤로 오면 최신).
 */
export default function DmBoard() {
  const { conversationId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const me = useUserStore((s) => s.user);

  const [channels, setChannels] = useState<DmChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [posts, setPosts] = useState<DmChannelPost[]>([]);
  const [roomTitle, setRoomTitle] = useState('');
  const [myRole, setMyRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [postsFailed, setPostsFailed] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const openConfirm = useConfirmStore((s) => s.open);

  const isManager = myRole === 'owner' || myRole === 'admin';

  const loadChannels = useCallback(async () => {
    setFailed(false);
    try {
      const rows = await fetchChannels(conversationId);
      setChannels(rows);
      setActiveId((prev) => (prev && rows.some((c) => c.id === prev) ? prev : (rows[0]?.id ?? null)));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    loadChannels();
    fetchConversation(conversationId)
      .then((c) => setRoomTitle(c.title ?? ''))
      .catch(() => {});
    fetchMembers(conversationId)
      .then((rows) => setMyRole(rows.find((m) => m.userId === me?.id)?.role ?? 'member'))
      .catch(() => {});
  }, [conversationId, loadChannels, me?.id]);

  const loadPosts = useCallback(() => {
    if (!activeId) {
      setPosts([]);
      setPostsFailed(false);
      return () => {};
    }
    let alive = true;
    setPostsFailed(false);
    fetchChannelPosts(conversationId, activeId)
      .then((res) => {
        if (alive) setPosts(res.items);
      })
      .catch(() => {
        // 글 목록 실패는 "글 없음" 과 구분한다 — 빈 화면 대신 재시도를 준다.
        if (alive) setPostsFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [conversationId, activeId]);

  useEffect(() => loadPosts(), [loadPosts]);

  const guard = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await loadChannels();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateChannel = () =>
    guard(async () => {
      const name = newName.trim();
      if (!name) return;
      const created = await createChannel(conversationId, name);
      setNewName('');
      setActiveId(created.id);
    });

  const handleRenameSubmit = (channel: DmChannel) => {
    const next = editingName.trim();
    setEditingId(null);
    if (!next || next === channel.name) return;
    void guard(() => patchChannel(conversationId, channel.id, { name: next }));
  };

  // 위/아래 이동 — 옮길 자리(index)만 서버에 보낸다. 재번호는 서버가 한 트랜잭션에서 처리한다.
  const handleMove = (index: number, delta: -1 | 1) => {
    const target = channels[index];
    if (!target || !channels[index + delta]) return;
    void guard(() => patchChannel(conversationId, target.id, { position: index + delta }));
  };

  const handleDeleteChannel = (channel: DmChannel) => {
    openConfirm(
      t('dm.board.deleteChannelConfirm', { defaultValue: '채널과 안의 글이 모두 사라져요. 삭제할까요?' }),
      () =>
        void guard(async () => {
          await deleteChannel(conversationId, channel.id);
          setActiveId((prev) => (prev === channel.id ? null : prev));
        }),
    );
  };

  const renderBody = () => {
    if (loading) return null;
    if (failed) {
      return (
        <StateBlock
          icon={LayoutList}
          tone="error"
          title={t('common.errorUnexpected')}
          actionLabel={t('common.retry', { defaultValue: '다시 시도' })}
          onAction={loadChannels}
        />
      );
    }
    if (channels.length === 0) {
      return (
        <StateBlock
          icon={LayoutList}
          title={t('dm.board.channelsEmpty', { defaultValue: '아직 채널이 없어요' })}
          desc={
            isManager
              ? undefined
              : t('dm.board.channelsEmptyMemberHint', { defaultValue: '운영진이 채널을 만들면 글을 쓸 수 있어요' })
          }
          actionLabel={isManager ? t('dm.board.createChannel', { defaultValue: '채널 만들기' }) : undefined}
          onAction={isManager ? () => setManageOpen(true) : undefined}
        />
      );
    }
    if (postsFailed) {
      return (
        <StateBlock
          icon={LayoutList}
          tone="error"
          title={t('common.errorUnexpected')}
          actionLabel={t('common.retry', { defaultValue: '다시 시도' })}
          onAction={loadPosts}
        />
      );
    }
    if (posts.length === 0) {
      return <StateBlock icon={LayoutList} title={t('dm.board.postEmpty', { defaultValue: '첫 글을 남겨보세요' })} />;
    }
    return (
      <div className={styles.list}>
        {posts.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.card}
            onClick={() => navigate(`/dm/${conversationId}/board/${p.id}`)}
          >
            <div className={styles.cardHead}>
              <Avatar
                src={p.authorAvatarUrl}
                name={p.authorNickname ?? t('dm.unknownMember', { defaultValue: '알 수 없음' })}
                seed={p.authorId}
                size={28}
              />
              <span className={styles.author}>
                {p.authorNickname ?? t('dm.unknownMember', { defaultValue: '알 수 없음' })}
              </span>
              <span className={`${styles.time} num`}>{formatRelativeTime(p.createdAt)}</span>
            </div>
            <div className={styles.cardBodyRow}>
              <p className={styles.preview}>{p.body}</p>
              {p.imageUrls[0] && (
                <span className={styles.thumb}>
                  <AppImage src={p.imageUrls[0]} alt="" />
                </span>
              )}
            </div>
            {p.commentCount > 0 && (
              <span className={styles.commentCount}>
                <MessageSquare size={13} strokeWidth={2.2} />
                <span className="num">{p.commentCount}</span>
              </span>
            )}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <TopBar
        title={roomTitle || t('dm.board.title', { defaultValue: '게시판' })}
        rightContent={
          isManager ? (
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => setManageOpen(true)}
              aria-label={t('dm.board.manageChannels', { defaultValue: '채널 관리' })}
            >
              <Settings2 size={21} strokeWidth={2} />
            </button>
          ) : undefined
        }
      />

      {channels.length > 0 && (
        <div className={styles.tabs}>
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.tab}
              data-active={c.id === activeId || undefined}
              onClick={() => setActiveId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className={styles.body}>{renderBody()}</div>

      {activeId && (
        <button
          type="button"
          className={styles.fab}
          onClick={() => navigate(`/dm/${conversationId}/board/new?channel=${activeId}`)}
          aria-label={t('dm.board.postCompose', { defaultValue: '글쓰기' })}
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      )}

      <BottomSheet open={manageOpen} onClose={() => setManageOpen(false)}>
        <div className={styles.sheet}>
          <div className={styles.sheetTitle}>{t('dm.board.manageChannels', { defaultValue: '채널 관리' })}</div>
          <div className={styles.createRow}>
            <input
              className={styles.input}
              value={newName}
              maxLength={40}
              placeholder={t('dm.board.channelName', { defaultValue: '채널 이름' })}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button onClick={handleCreateChannel} disabled={busy || !newName.trim()}>
              {t('dm.board.createChannel', { defaultValue: '채널 만들기' })}
            </Button>
          </div>
          {channels.map((c, i) => (
            <div key={c.id} className={styles.manageRow}>
              {editingId === c.id ? (
                <input
                  className={`${styles.input} ${styles.manageName}`}
                  value={editingName}
                  maxLength={40}
                  autoFocus
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleRenameSubmit(c)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(c)}
                />
              ) : (
                <span className={styles.manageName}>{c.name}</span>
              )}
              <button
                type="button"
                className={styles.iconBtn}
                disabled={busy || i === 0}
                onClick={() => handleMove(i, -1)}
                aria-label={t('dm.board.moveUp', { defaultValue: '위로' })}
              >
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                disabled={busy || i === channels.length - 1}
                onClick={() => handleMove(i, 1)}
                aria-label={t('dm.board.moveDown', { defaultValue: '아래로' })}
              >
                <ChevronDown size={16} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                disabled={busy}
                onClick={() => {
                  setEditingId(c.id);
                  setEditingName(c.name);
                }}
                aria-label={t('dm.board.renameChannel', { defaultValue: '이름 바꾸기' })}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                data-danger
                disabled={busy}
                onClick={() => handleDeleteChannel(c)}
                aria-label={t('dm.board.deleteChannel', { defaultValue: '채널 삭제' })}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
