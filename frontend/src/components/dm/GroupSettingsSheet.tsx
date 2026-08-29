import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Crown, LayoutList, ShieldCheck, UserMinus, UserPlus, Ban, RotateCcw } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { RoomPhotoPicker } from '@/components/dm/RoomPhotoPicker';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { api } from '@/api/client';
import { useUserStore } from '@/store/useUserStore';
import { fetchFollowing } from '@/api/follows';
import {
  banMember,
  fetchBans,
  fetchMembers,
  inviteMembers,
  patchConversation,
  removeMember,
  setMemberRole,
  unbanMember,
  type DmBan,
  type DmMember,
} from '@/api/dm';
import type { DmConversation, FollowUser } from '@/api/types';
import styles from './GroupSettingsSheet.module.css';

type Tab = 'info' | 'members' | 'bans';

/**
 * 그룹 대화방 설정 (대표 지시 2026-08-28) — 헤더 "..." → "설정" 진입점.
 *
 * 서버 규칙(ai-docs/context/service-rules.md "그룹 대화방 권한")을 화면에 그대로 반영한다:
 * - 운영진은 개설자(owner)/관리자(admin) 2단. **admin 임명·해임은 owner 만** 한다.
 * - 강퇴는 재초대로 복귀 가능, 블랙리스트는 해제 전까지 초대·입장 모두 거부 — 그래서 두 액션을
 *   나란히 두되 문구로 결과를 구분해준다.
 * - 초대 후보는 **내가 팔로우하는 사람** (서버도 같은 기준을 강제한다).
 */
export default function GroupSettingsSheet({
  open,
  onClose,
  conversationId,
  conv,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  conv: DmConversation | null;
  onUpdated: (next: DmConversation) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useUserStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('info');
  const [title, setTitle] = useState(conv?.title ?? '');
  const [members, setMembers] = useState<DmMember[]>([]);
  const [bans, setBans] = useState<DmBan[]>([]);
  const [candidates, setCandidates] = useState<FollowUser[]>([]);
  const [busy, setBusy] = useState(false);

  const myRole = members.find((m) => m.userId === me?.id)?.role ?? 'member';
  const isOwner = myRole === 'owner';
  const isManager = isOwner || myRole === 'admin';

  const reload = useCallback(async () => {
    const [nextMembers, nextBans] = await Promise.all([
      fetchMembers(conversationId).catch(() => [] as DmMember[]),
      // 블랙리스트 조회는 운영진 전용이라 일반 멤버에게는 403 이 정상이다 — 빈 목록으로 둔다.
      fetchBans(conversationId).catch(() => [] as DmBan[]),
    ]);
    setMembers(nextMembers);
    setBans(nextBans);
  }, [conversationId]);

  useEffect(() => {
    if (!open) return;
    setTitle(conv?.title ?? '');
    reload();
    if (me) fetchFollowing(me.id).then((r) => setCandidates(r.items)).catch(() => {});
  }, [open, conversationId, conv?.title, me, reload]);

  const guard = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTitle = () =>
    guard(async () => {
      const next = await patchConversation(conversationId, { title: title.trim() });
      onUpdated(next);
      toast.success(t('dm.settingsSaved', { defaultValue: '저장했어요' }));
    });

  // 방 사진: /contents/upload → PATCH photo_content_id (앱 표준 업로드 관용구)
  const handlePhotoFile = (file: File) => {
    if (!me) return;
    void guard(async () => {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      form.append('owner_id', me.id);
      const { id } = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      const next = await patchConversation(conversationId, { photoContentId: id });
      onUpdated(next);
      toast.success(t('dm.settingsSaved', { defaultValue: '저장했어요' }));
    });
  };

  const memberIds = new Set(members.map((m) => m.userId));
  const bannedIds = new Set(bans.map((b) => b.userId));
  const invitable = candidates.filter((c) => !memberIds.has(c.id) && !bannedIds.has(c.id));

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <div className={styles.tabs}>
          {(['info', 'members', 'bans'] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              className={styles.tab}
              data-active={tab === key || undefined}
              onClick={() => setTab(key)}
            >
              {key === 'info' && t('dm.settingsTabInfo', { defaultValue: '방 정보' })}
              {key === 'members' && t('dm.settingsTabMembers', { defaultValue: '멤버' })}
              {key === 'bans' && t('dm.settingsTabBans', { defaultValue: '차단' })}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className={styles.section}>
            <RoomPhotoPicker
              src={conv?.photoUrl}
              name={title || '?'}
              seed={conversationId}
              disabled={!isManager || busy}
              onFile={handlePhotoFile}
            />
            <label className={styles.label} htmlFor="group-title">
              {t('dm.groupTitlePlaceholder', { defaultValue: '방 이름' })}
            </label>
            <input
              id="group-title"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isManager}
            />
            <Button onClick={handleSaveTitle} disabled={!isManager || busy || !title.trim()}>
              {t('common.save', { defaultValue: '저장' })}
            </Button>
            {!isManager && (
              <p className={styles.hint}>
                {t('dm.settingsManagerOnly', { defaultValue: '방 정보 수정은 운영진만 할 수 있어요' })}
              </p>
            )}
            {/* 게시판(init/218) — 헤더 아이콘과 같은 목적지. 설정에서 찾는 사람을 위한 두 번째 진입점 */}
            <button type="button" className={styles.linkRow} onClick={() => navigate(`/dm/${conversationId}/board`)}>
              <LayoutList size={16} />
              <span>{t('dm.board.title', { defaultValue: '게시판' })}</span>
            </button>
          </div>
        )}

        {tab === 'members' && (
          <div className={styles.section}>
            {members.map((m) => (
              <div key={m.userId} className={styles.row}>
                <Avatar src={m.avatarUrl} name={m.nickname ?? m.userId} seed={m.userId} size={32} />
                <span className={styles.name}>
                  {m.nickname ?? m.userId.slice(0, 6)}
                  {m.role === 'owner' && <Crown size={13} className={styles.roleIcon} aria-label="owner" />}
                  {m.role === 'admin' && <ShieldCheck size={13} className={styles.roleIcon} aria-label="admin" />}
                </span>
                {/* owner 는 위임·강등되지 않는다(서버도 거부). 본인도 대상이 아니다. */}
                {isOwner && m.role !== 'owner' && m.userId !== me?.id && (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() =>
                      guard(() => setMemberRole(conversationId, m.userId, m.role === 'admin' ? 'member' : 'admin'))
                    }
                  >
                    {m.role === 'admin'
                      ? t('dm.settingsDemote', { defaultValue: '관리자 해제' })
                      : t('dm.settingsPromote', { defaultValue: '관리자 지정' })}
                  </button>
                )}
                {isManager && m.role !== 'owner' && m.userId !== me?.id && (
                  <>
                    <button
                      type="button"
                      className={styles.action}
                      title={t('dm.settingsKickHint', { defaultValue: '내보내도 다시 초대하면 돌아올 수 있어요' })}
                      onClick={() => guard(() => removeMember(conversationId, m.userId))}
                    >
                      <UserMinus size={14} />
                    </button>
                    <button
                      type="button"
                      className={styles.actionDanger}
                      title={t('dm.settingsBanHint', { defaultValue: '차단하면 해제 전까지 초대해도 들어올 수 없어요' })}
                      onClick={() => guard(() => banMember(conversationId, m.userId))}
                    >
                      <Ban size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}

            <p className={styles.sectionTitle}>
              {t('dm.settingsInvite', { defaultValue: '초대하기' })}
            </p>
            {invitable.length === 0 ? (
              <StateBlock icon={UserPlus} title={t('follow.emptyFollowing')} />
            ) : (
              invitable.map((c) => (
                <div key={c.id} className={styles.row}>
                  <Avatar src={c.avatarUrl} name={c.nickname ?? c.id} seed={c.id} size={32} />
                  <span className={styles.name}>{c.nickname ?? c.id.slice(0, 6)}</span>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => guard(() => inviteMembers(conversationId, [c.id]))}
                  >
                    <UserPlus size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'bans' && (
          <div className={styles.section}>
            {!isManager ? (
              <p className={styles.hint}>
                {t('dm.settingsManagerOnly', { defaultValue: '방 정보 수정은 운영진만 할 수 있어요' })}
              </p>
            ) : bans.length === 0 ? (
              <StateBlock icon={Ban} title={t('dm.settingsNoBans', { defaultValue: '차단한 사람이 없어요' })} />
            ) : (
              bans.map((b) => (
                <div key={b.userId} className={styles.row}>
                  <Avatar src={b.avatarUrl} name={b.nickname ?? b.userId} seed={b.userId} size={32} />
                  <span className={styles.name}>{b.nickname ?? b.userId.slice(0, 6)}</span>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => guard(() => unbanMember(conversationId, b.userId))}
                  >
                    <RotateCcw size={14} />
                    {t('dm.settingsUnban', { defaultValue: '차단 해제' })}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
