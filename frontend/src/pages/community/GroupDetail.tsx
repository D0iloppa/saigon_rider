import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Globe, Lock, MessagesSquare, Newspaper, Plus, UserPlus, Users, UsersRound } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { getGroup, joinGroup, listMembers, removeGroupMember, approveMember, listGroupPosts, listGroupBans, unbanGroupMember } from '@/api/community_groups';
import { extractErrorCode } from '@/api/client';
import { toggleCheer } from '@/api/feed';
import { toast } from '@/components/ui/Toast';
import confirmStyles from '@/components/ui/ConfirmDialog.module.css';
import { useUserStore } from '@/store/useUserStore';
import type { CommunityGroup, CommunityGroupMember, FeedPost } from '@/api/types';
import feedStyles from '@/pages/feed/FeedList.module.css';
import { FeedPostCard } from '@/pages/feed/FeedPostCard';
import { GroupCover } from './GroupCard';
import { pickTopicLabel } from './groupTopics';
import styles from './GroupDetail.module.css';

type Tab = 'board' | 'chat' | 'members';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'board', label: 'communityGroup.tabBoard' },
  { key: 'chat', label: 'communityGroup.tabChat' },
  { key: 'members', label: 'communityGroup.tabMembers' },
];
const MANAGE_ROLES = new Set(['owner', 'manager']);

// 그룹 상세 — 동네지도 업체 상세(BizPublic)와 같은 구조: intro → sticky 탭 → 탭 콘텐츠 → 하단 CTA (F-CM-02 FR-2 r14).
// 탭 전환 시 탭 줄이 상단에 붙도록 스크롤하는 동작과 스크롤 후 헤더에 제목이 나타나는 동작을 그대로 미러한다.
export default function GroupDetail() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const me = useUserStore((s) => s.user);
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('board');
  const [joining, setJoining] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLElement | null>(null);
  const pendingTabScrollRef = useRef(false);

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
  const isPending = group?.myMembershipStatus === 'PENDING';
  const isBanned = group?.myMembershipStatus === 'BANNED';

  const handleJoin = async () => {
    if (!group || joining) return;
    setJoining(true);
    try {
      const updated = await joinGroup(group.id);
      setGroup(updated);
    } catch (err) {
      const code = extractErrorCode(err);
      if (code === 'group_banned' || code === 'invite_required') {
        toast.error(t(code === 'group_banned' ? 'communityGroup.groupBannedNote' : 'communityGroup.inviteRequired'));
        loadGroup();
      } else {
        toast.error(t('common.errorUnexpected'));
      }
    } finally {
      setJoining(false);
    }
  };

  const scrollToTabsTop = () => {
    const body = bodyRef.current;
    const intro = introRef.current;
    if (body && intro) {
      // sticky 로 붙은 탭 줄의 rect 는 고정 위치를 주므로, 비-sticky 인 intro 의 flow 하단(= 탭 줄의 원래 위치)으로 계산한다.
      const tabTop = intro.getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTo({ top: Math.max(0, tabTop), behavior: 'smooth' });
    }
  };

  const handleTabChange = (next: Tab) => {
    // 그룹 공식 채팅 — 멤버는 자동 참여 상태라 중간 화면 없이 바로 방으로 간다
    if (next === 'chat' && isMember && group?.conversationId) {
      navigate(`/dm/${group.conversationId}`);
      return;
    }
    if (next === tab) {
      scrollToTabsTop();
      return;
    }
    pendingTabScrollRef.current = true;
    setTab(next);
  };

  useLayoutEffect(() => {
    if (!pendingTabScrollRef.current) return;
    pendingTabScrollRef.current = false;
    scrollToTabsTop();
  });

  if (loading) {
    return (
      <div className={styles.page}>
        <TopBar />
        <div className={styles.body}>
          <p className={styles.loading}>{t('common.loading')}</p>
        </div>
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

  const joinPolicyLabel =
    group.joinPolicy === 'approval' ? t('communityGroup.joinPolicyApproval')
      : group.joinPolicy === 'open' ? t('communityGroup.joinPolicyOpen')
        : null;

  return (
    <div className={styles.page}>
      <TopBar title={compactHeader ? group.name : undefined} />
      <div ref={bodyRef} className={styles.body} onScroll={(e) => setCompactHeader(e.currentTarget.scrollTop > 72)}>
        <section ref={introRef} className={styles.intro}>
          <h1 className={styles.name}>{group.name}</h1>
          <div className={styles.profileMeta}>
            <span data-testid="group-detail-topic">{pickTopicLabel(group.topicLabels, i18n.language)}</span>
            <span>{t(group.groupType === 'neighborhood' ? 'communityGroup.typeNeighborhood' : 'communityGroup.typeInterest')}</span>
            <span>
              {group.visibility === 'private' ? <Lock size={13} strokeWidth={2.2} /> : <Globe size={13} strokeWidth={2.2} />}
              {t(group.visibility === 'private' ? 'communityGroup.visibilityPrivate' : 'communityGroup.visibilityPublic')}
            </span>
            {joinPolicyLabel && <span>{joinPolicyLabel}</span>}
          </div>
          {group.description && <p className={styles.introText}>{group.description}</p>}
          <div className={styles.followRow}>
            <span className={styles.followCount}>
              <Users size={14} strokeWidth={2.2} />
              {t('communityGroup.memberCount', { count: group.memberCount })}
              {' · '}
              <FileText size={14} strokeWidth={2.2} />
              {t('communityGroup.postCount', { count: group.postCount })}
            </span>
            {isMember && <span className={styles.statusBadge}>{t('communityGroup.joined')}</span>}
            {isPending && <span className={styles.statusBadgeMuted}>{t('communityGroup.pending')}</span>}
          </div>
          <GroupCover name={group.name} coverUrl={group.coverUrl} className={styles.banner} />
        </section>

        <nav className={styles.tabs} role="tablist">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? styles.tabActive : styles.tab}
              onClick={() => handleTabChange(key)}
            >
              {t(label)}
            </button>
          ))}
        </nav>

        <div className={styles.tabContent}>
          {tab === 'board' && (
            <BoardTab group={group} isMember={isMember} navigate={navigate} t={t} />
          )}
          {tab === 'chat' &&
            (isMember && group.conversationId ? (
              // 탭에 머문 채 가입한 경우 — 탭 재클릭은 탭 변경이 아니라 이동이 안 되므로 진입 버튼을 준다
              <StateBlock
                icon={MessagesSquare}
                title={t('dm.groupOfficialChat', { name: group.name })}
                actionLabel={t('market.chat')}
                onAction={() => navigate(`/dm/${group.conversationId}`)}
              />
            ) : (
              <StateBlock icon={MessagesSquare} title={t('communityGroup.chatRequiresMembership')} />
            ))}
          {tab === 'members' && (
            <MembersTab group={group} isMember={isMember} myUserId={me?.id} t={t} />
          )}
        </div>
      </div>

      {!isMember && !isPending && (
        <div className={styles.ctaBar}>
          {isBanned ? (
            <p className={styles.ctaNote} data-testid="group-banned-note">{t('communityGroup.groupBannedNote')}</p>
          ) : (
            <>
              {group.myInvite && (
                <p className={styles.ctaNote} data-testid="group-invite-notice">
                  {t('communityGroup.inviteNotice', { name: group.myInvite.inviterNickname ?? '' })}
                </p>
              )}
              {group.joinPolicy === 'invite' && !group.myInvite ? (
                <p className={styles.ctaNote}>{t('communityGroup.inviteRequired')}</p>
              ) : (
                <button className={styles.ctaBtn} type="button" onClick={handleJoin} disabled={joining}>
                  <UserPlus size={20} strokeWidth={2.2} />
                  {t(group.myMembershipStatus === 'REMOVED' ? 'communityGroup.requestJoin' : 'communityGroup.join')}
                </button>
              )}
            </>
          )}
        </div>
      )}
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
    <>
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
        <div className={feedStyles.postList} data-testid="group-board-list">
          {posts.map((p) => <FeedPostCard key={p.id} p={p} onCheer={handleCheer} />)}
        </div>
      )}
      <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
    </>
  );
}

function MembersTab({ group, isMember, myUserId, t }: any) {
  const [members, setMembers] = useState<CommunityGroupMember[]>([]);
  const [pending, setPending] = useState<CommunityGroupMember[]>([]);
  const [bans, setBans] = useState<CommunityGroupMember[]>([]);
  const [showBans, setShowBans] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [kickBan, setKickBan] = useState(false);
  const [loading, setLoading] = useState(true);
  const canManage = MANAGE_ROLES.has(group.myRole ?? '');
  // 초대: ACTIVE 멤버 누구나, 초대전용 그룹은 owner/manager 만 (서버 규칙과 동일)
  const canInvite = group.joinPolicy !== 'invite' || canManage;
  const navigate = useNavigate();

  useEffect(() => {
    if (!isMember) { setLoading(false); return; }
    Promise.all([
      listMembers(group.id),
      canManage ? listMembers(group.id, 'pending') : Promise.resolve([]),
      canManage ? listGroupBans(group.id) : Promise.resolve([]),
    ])
      .then(([active, pendingList, banList]) => {
        setMembers(active);
        setPending(pendingList);
        setBans(banList);
      })
      .finally(() => setLoading(false));
  }, [group.id, isMember, canManage]);

  const handleKick = async () => {
    const userId = kickTarget;
    if (!userId) return;
    const ban = kickBan;
    setKickTarget(null);
    setKickBan(false);
    try {
      await removeGroupMember(group.id, userId, ban);
      const removed = members.find((m) => m.userId === userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      if (ban && removed) setBans((prev) => [{ ...removed, status: 'BANNED' }, ...prev]);
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  const handleUnban = async (userId: string) => {
    try {
      await unbanGroupMember(group.id, userId);
      setBans((prev) => prev.filter((m) => m.userId !== userId));
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
    <div>
      {canManage && pending.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>
            {t('communityGroup.pendingMembers')}
            <span className={styles.sectionCount}>{pending.length}</span>
          </h3>
          <div className={styles.memberCard}>
            {pending.map((m) => (
              <div key={m.userId} className={styles.memberRow}>
                <AppImage src={m.avatarUrl ?? undefined} alt="" className={styles.memberAvatar} variant="circle" />
                <span className={styles.memberName}>{m.nickname ?? '—'}</span>
                <button
                  type="button"
                  className={styles.memberAction}
                  onClick={() => handleApprove(m.userId)}
                >
                  {t('communityGroup.approveMember')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <h3 className={styles.sectionTitle}>
        {t('communityGroup.tabMembers')}
        <span className={styles.sectionCount}>{members.length}</span>
        {canInvite && (
          <button
            type="button"
            className={`${styles.memberAction} ${styles.inviteAction}`}
            data-testid="group-invite-btn"
            onClick={() => navigate(`/group/${group.slug ?? group.id}/invite`)}
          >
            <UserPlus size={14} strokeWidth={2.2} />
            {t('communityGroup.invite')}
          </button>
        )}
      </h3>
      <div className={styles.memberCard}>
        {members.map((m) => (
          <div key={m.userId} className={styles.memberRow}>
            <AppImage src={m.avatarUrl ?? undefined} alt="" className={styles.memberAvatar} variant="circle" />
            <span className={styles.memberName}>{m.nickname ?? '—'}</span>
            <span className={styles.memberRole}>{t(`communityGroup.role_${m.role}`, { defaultValue: m.role })}</span>
            {canManage && m.userId !== myUserId && (
              <button
                type="button"
                className={`${styles.memberAction} ${styles.memberActionDanger}`}
                data-testid="member-kick-btn"
                onClick={() => { setKickTarget(m.userId); setKickBan(false); }}
              >
                {t('communityGroup.removeMember')}
              </button>
            )}
          </div>
        ))}
      </div>
      {canManage && (
        <>
          <button
            type="button"
            className={`${styles.memberAction} ${styles.banListToggle}`}
            data-testid="group-ban-list"
            onClick={() => setShowBans((v) => !v)}
          >
            {t('communityGroup.banList')} {bans.length}
          </button>
          {showBans && (
            <div className={styles.memberCard}>
              {bans.length === 0 && <p className={styles.ctaNote}>{t('communityGroup.banListEmpty')}</p>}
              {bans.map((m) => (
                <div key={m.userId} className={styles.memberRow}>
                  <AppImage src={m.avatarUrl ?? undefined} alt="" className={styles.memberAvatar} variant="circle" />
                  <span className={styles.memberName}>{m.nickname ?? '—'}</span>
                  <button
                    type="button"
                    className={styles.memberAction}
                    data-testid="ban-unban-btn"
                    onClick={() => handleUnban(m.userId)}
                  >
                    {t('communityGroup.unban')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {kickTarget && (
        <div className={confirmStyles.backdrop} onClick={() => setKickTarget(null)}>
          <div className={confirmStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={confirmStyles.message}>{t('communityGroup.removeMemberConfirm')}</p>
            <label className={styles.kickBanRow}>
              <input
                type="checkbox"
                data-testid="member-kick-ban-checkbox"
                checked={kickBan}
                onChange={(e) => setKickBan(e.target.checked)}
              />
              {t('communityGroup.kickBanLabel')}
            </label>
            <div className={confirmStyles.actions}>
              <button className={confirmStyles.cancel} onClick={() => setKickTarget(null)}>
                {t('common.cancel')}
              </button>
              <button className={confirmStyles.confirm} data-testid="member-kick-confirm" onClick={handleKick}>
                {t('communityGroup.removeMember')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
