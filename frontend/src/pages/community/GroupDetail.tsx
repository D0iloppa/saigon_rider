import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flame, MessageCircle, MessagesSquare, Newspaper, Plus, UserCheck, UserX, UsersRound } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { formatRelativeTime } from '@/lib/format';
import { getGroup, joinGroup, listMembers, removeGroupMember, approveMember, listGroupPosts } from '@/api/community_groups';
import { toggleCheer } from '@/api/feed';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import type { CommunityGroup, CommunityGroupMember, FeedPost } from '@/api/types';
import feedStyles from '@/pages/feed/FeedList.module.css';
import styles from './GroupDetail.module.css';

type Tab = 'board' | 'chat' | 'members';
const MANAGE_ROLES = new Set(['owner', 'manager']);

export default function GroupDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const me = useUserStore((s) => s.user);
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('board');
  const [joining, setJoining] = useState(false);

  const loadGroup = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    getGroup(slug)
      .then(setGroup)
      .catch(() => setGroup(null))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(loadGroup, [loadGroup]);

  const isMember = group?.myMembershipStatus === 'ACTIVE';

  const handleJoin = async () => {
    if (!group || joining) return;
    setJoining(true);
    try {
      const updated = await joinGroup(group.id);
      setGroup(updated);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <TopBar title="" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className={styles.page}>
        <TopBar title={t('communityGroup.groupTitle')} />
        <StateBlock icon={UsersRound} tone="error" title={t('communityGroup.notFound')} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopBar title={group.name} />
      <div className={styles.body}>
        <div className={styles.header}>
          {group.description && <div className={styles.headerDesc}>{group.description}</div>}
          <div className={styles.headerMeta}>{t('communityGroup.memberCount', { count: group.memberCount })}</div>
          {!isMember && group.myMembershipStatus !== 'PENDING' && (
            <div style={{ marginTop: 10 }}>
              <Button size="sm" fullWidth={false} onClick={handleJoin} disabled={joining} loading={joining}>
                {t('communityGroup.join')}
              </Button>
            </div>
          )}
          {group.myMembershipStatus === 'PENDING' && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-3)' }}>
              {t('communityGroup.pending')}
            </div>
          )}
        </div>

        <div className={styles.tabRow} role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'board'}
            className={`${styles.tabBtn} ${tab === 'board' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('board')}
          >
            {t('communityGroup.tabBoard')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'chat'}
            className={`${styles.tabBtn} ${tab === 'chat' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('chat')}
          >
            {t('communityGroup.tabChat')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'members'}
            className={`${styles.tabBtn} ${tab === 'members' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('members')}
          >
            {t('communityGroup.tabMembers')}
          </button>
        </div>

        {tab === 'board' && (
          <BoardTab group={group} isMember={isMember} navigate={navigate} t={t} />
        )}
        {tab === 'chat' && (
          <div className={styles.chatEntry}>
            {isMember && group.conversationId ? (
              <Button onClick={() => navigate(`/dm/${group.conversationId}`)}>
                <MessagesSquare size={16} strokeWidth={2.2} style={{ marginRight: 6 }} />
                {t('communityGroup.enterChat')}
              </Button>
            ) : (
              <StateBlock icon={MessagesSquare} title={t('communityGroup.chatRequiresMembership')} />
            )}
          </div>
        )}
        {tab === 'members' && (
          <MembersTab group={group} isMember={isMember} myUserId={me?.id} t={t} />
        )}
      </div>
    </div>
  );
}

function BoardTab({ group, isMember, navigate, t }: any) {
  const fetchPage = useCallback(
    async (page: number) => {
      if (!isMember) return { items: [], total: 0, page, size: 20 };
      return listGroupPosts(group.id, page, 20);
    },
    [group.id, isMember],
  );

  const { items: posts, setItems: setPosts, isLoading, isLoadingMore, hasMore, sentinelRef } =
    useInfiniteScroll<FeedPost>(fetchPage, 20, [group.id, isMember]);

  const handleCheer = async (p: FeedPost, e: React.MouseEvent) => {
    e.stopPropagation();
    const { cheered, count } = await toggleCheer(p.id);
    setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, iCheered: cheered, cheerCount: count } : x)));
  };

  if (!isMember) {
    return <StateBlock icon={UsersRound} title={t('communityGroup.boardRequiresMembership')} />;
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className={styles.writeFab}
        onClick={() => navigate(`/feed/new?groupId=${group.id}`)}
        aria-label={t('feedCreate.title')}
      >
        <Plus size={22} strokeWidth={2.4} />
      </button>
      {!isLoading && posts.length === 0 ? (
        <StateBlock icon={Newspaper} title={t('feed.emptyTitle')} desc={t('feed.emptySub')} />
      ) : (
        <div className={feedStyles.feedGrid}>
          {posts.map((p) => (
            <article
              key={p.id}
              className={feedStyles.feedCard}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/feed/post/${p.id}`)}
            >
              <div className={feedStyles.feedThumb}>
                {p.photoUrl ? (
                  <AppImage src={p.photoUrl} alt="" className={feedStyles.feedPhoto} />
                ) : (
                  <span className={feedStyles.feedPlaceholder}><Newspaper size={22} /></span>
                )}
              </div>
              <span className={feedStyles.feedBody}>
                <span className={feedStyles.feedAuthor}>
                  <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={feedStyles.avatar} variant="circle" />
                  <strong>{p.userNickname ?? '—'}</strong>
                  <small>{formatRelativeTime(p.createdAt)}</small>
                </span>
                <span className={feedStyles.feedCaption}>{p.caption ?? t('feed.noCaption')}</span>
                <span className={feedStyles.feedMeta}>
                  <button
                    type="button"
                    className={`${feedStyles.cheerBtn} ${p.iCheered ? feedStyles.cheerBtnActive : ''}`}
                    onClick={(e) => handleCheer(p, e)}
                  >
                    <Flame size={12} />
                    {p.cheerCount > 0 && <span>{p.cheerCount}</span>}
                  </button>
                  {p.commentCount > 0 && <span><MessageCircle size={12} />{p.commentCount}</span>}
                </span>
              </span>
            </article>
          ))}
        </div>
      )}
      <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
    </div>
  );
}

function MembersTab({ group, isMember, myUserId, t }: any) {
  const [members, setMembers] = useState<CommunityGroupMember[]>([]);
  const [pending, setPending] = useState<CommunityGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const canManage = MANAGE_ROLES.has(group.myRole ?? '');

  useEffect(() => {
    if (!isMember) { setLoading(false); return; }
    Promise.all([
      listMembers(group.id),
      canManage ? listMembers(group.id, 'pending') : Promise.resolve([]),
    ])
      .then(([active, pendingList]) => {
        setMembers(active);
        setPending(pendingList);
      })
      .finally(() => setLoading(false));
  }, [group.id, isMember, canManage]);

  const handleRemove = async (userId: string) => {
    try {
      await removeGroupMember(group.id, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await approveMember(group.id, userId);
      setPending((prev) => {
        const approved = prev.find((m) => m.userId === userId);
        if (approved) setMembers((cur) => [...cur, { ...approved, status: 'ACTIVE' }]);
        return prev.filter((m) => m.userId !== userId);
      });
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  if (!isMember) {
    return <StateBlock icon={UsersRound} title={t('communityGroup.membersRequiresMembership')} />;
  }
  if (loading) return null;

  return (
    <div className={styles.membersBody}>
      {canManage && pending.length > 0 && (
        <>
          <div className={styles.memberRole} style={{ padding: '8px 0' }}>
            {t('communityGroup.pendingMembers')}
          </div>
          {pending.map((m) => (
            <div key={m.userId} className={styles.memberRow}>
              <AppImage src={m.avatarUrl ?? undefined} alt="" className={feedStyles.avatar} variant="circle" />
              <span className={styles.memberName}>{m.nickname ?? '—'}</span>
              <button
                type="button"
                aria-label={t('communityGroup.approveMember')}
                onClick={() => handleApprove(m.userId)}
                style={{ background: 'none', border: 'none', color: 'var(--primary, #3b82f6)', cursor: 'pointer' }}
              >
                <UserCheck size={16} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </>
      )}
      {members.map((m) => (
        <div key={m.userId} className={styles.memberRow}>
          <AppImage src={m.avatarUrl ?? undefined} alt="" className={feedStyles.avatar} variant="circle" />
          <span className={styles.memberName}>{m.nickname ?? '—'}</span>
          <span className={styles.memberRole}>{t(`communityGroup.role_${m.role}`, { defaultValue: m.role })}</span>
          {canManage && m.userId !== myUserId && (
            <button
              type="button"
              aria-label={t('communityGroup.removeMember')}
              onClick={() => handleRemove(m.userId)}
              style={{ background: 'none', border: 'none', color: 'var(--danger, #e5484d)', cursor: 'pointer' }}
            >
              <UserX size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
