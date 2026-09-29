import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CardMessage } from '@/components/dm/CardMessage';
import cardStyles from '@/components/dm/CardMessage.module.css';
import { toast } from '@/components/ui/Toast';
import { extractErrorCode } from '@/api/client';
import { acceptGroupInvite, getInviteState } from '@/api/community_groups';
import type { GroupInviteState } from '@/api/types';
import { GroupCover } from '@/pages/community/GroupCard';
import styles from './GroupInviteCard.module.css';

interface Props {
  meta: Record<string, any> | null | undefined;
  isMine: boolean;
  timeLabel: string;
}

// 그룹 초대 카드 — 스냅샷(이름·커버·인원)은 meta, 버튼 상태는 초대/멤버십 현재값(getInviteState)으로 결정한다.
// 초대한 사람은 읽기 전용, 초대받은 사람만 [가입하기]를 본다.
export function GroupInviteCard({ meta, isMine, timeLabel }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<GroupInviteState | null>(null);
  const [busy, setBusy] = useState(false);
  const groupId: string | undefined = meta?.groupId;
  const inviteId: string | undefined = meta?.inviteId;

  useEffect(() => {
    if (!groupId || !inviteId) return;
    getInviteState(groupId, inviteId).then(setState).catch(() => setState(null));
  }, [groupId, inviteId]);

  const membership = state?.group.myMembershipStatus ?? null;
  const isApproval = (state?.group.joinPolicy ?? meta?.joinPolicy) === 'approval';
  const canJoin = !!state?.isInvitee && state.status === 'pending' && membership === null;
  const expired = !!state?.isInvitee && state.status !== 'pending' && state.status !== 'accepted';

  const handleJoin = async () => {
    if (!groupId || !inviteId || busy) return;
    setBusy(true);
    try {
      const group = await acceptGroupInvite(groupId, inviteId);
      setState((prev) => (prev ? { ...prev, status: 'accepted', group } : prev));
      toast.success(t(group.myMembershipStatus === 'PENDING' ? 'communityGroup.inviteRequestSent' : 'communityGroup.inviteJoined'));
    } catch (err) {
      if (extractErrorCode(err) === 'invite_not_pending') {
        setState((prev) => (prev ? { ...prev, status: 'revoked' } : prev));
        toast.error(t('communityGroup.inviteExpired'));
      } else {
        toast.error(t('common.errorUnexpected'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <CardMessage
      type="group_invite"
      isMine={isMine}
      headerLabel={t('communityGroup.inviteCardLabel')}
      timeLabel={timeLabel}
    >
      <div data-testid="invite-card">
        <div className={styles.groupRow}>
          <GroupCover name={meta?.groupName ?? ''} coverUrl={meta?.coverUrl ?? null} className={styles.cover} />
          <div className={styles.info}>
            <div className={cardStyles.cardTitle}>{meta?.groupName ?? ''}</div>
            <div className={cardStyles.cardSubtitle}>
              {t('communityGroup.memberCount', { count: state?.group.memberCount ?? meta?.memberCount ?? 0 })}
            </div>
          </div>
        </div>
        <div className={cardStyles.cardButtonSlot}>
          {membership === 'PENDING' ? (
            <span className={styles.note}>{t('communityGroup.inviteCardRequested')}</span>
          ) : (
            <button type="button" className={styles.viewBtn} onClick={() => navigate(`/group/${groupId}`)}>
              {t('communityGroup.inviteCardView')}
            </button>
          )}
          {canJoin && (
            <button
              type="button"
              className={styles.joinBtn}
              data-testid="invite-card-join"
              disabled={busy}
              onClick={handleJoin}
            >
              {t(isApproval ? 'communityGroup.inviteCardRequest' : 'communityGroup.inviteCardJoin')}
            </button>
          )}
          {expired && <span className={styles.note}>{t('communityGroup.inviteExpired')}</span>}
        </div>
      </div>
    </CardMessage>
  );
}
