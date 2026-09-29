import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, LogOut, Pencil, ShieldOff, UsersRound } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { toast } from '@/components/ui/Toast';
import confirmStyles from '@/components/ui/ConfirmDialog.module.css';
import { extractErrorCode } from '@/api/client';
import { useUserStore } from '@/store/useUserStore';
import { getGroup, listGroupBans, removeGroupMember } from '@/api/community_groups';
import type { CommunityGroup } from '@/api/types';
import styles from './GroupManage.module.css';

// 그룹 관리 (owner/manager 전용) — 관리 항목 목록. 이후 가입 신청/공지/운영진 항목이 행으로 추가된다 (F-CM-02 FR-4).
export default function GroupManage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [banCount, setBanCount] = useState<number | null>(null);
  const me = useUserStore((s) => s.user);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getGroup(slug)
      .then(setGroup)
      .catch(() => setGroup(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const canManage = group?.myMembershipStatus === 'ACTIVE' && (group.myRole === 'owner' || group.myRole === 'manager');

  useEffect(() => {
    if (!group || !canManage) return;
    listGroupBans(group.id).then((bans) => setBanCount(bans.length)).catch(() => setBanCount(null));
  }, [group, canManage]);

  if (loading) {
    return (
      <div className={styles.page}>
        <TopBar title={t('communityGroup.manageTitle')} />
      </div>
    );
  }

  if (!group || !canManage) {
    return (
      <div className={styles.page}>
        <TopBar title={t('communityGroup.manageTitle')} />
        <StateBlock icon={UsersRound} tone="error" title={t(group ? 'communityGroup.noPermission' : 'communityGroup.notFound')} />
      </div>
    );
  }

  const base = `/group/${group.slug ?? group.id}`;
  const handleLeave = async () => {
    if (!me) return;
    setLeaveOpen(false);
    try {
      await removeGroupMember(group.id, me.id);
      toast.success(t('communityGroup.leftGroup'));
      navigate(group.visibility === 'private' ? '/community/groups' : base, { replace: true });
    } catch (err) {
      toast.error(extractErrorCode(err) === 'owner_cannot_leave' ? t('communityGroup.ownerCannotLeave') : t('common.errorUnexpected'));
    }
  };
  return (
    <div className={styles.page}>
      <TopBar title={t('communityGroup.manageTitle')} />
      <div className={styles.body}>
        <div className={styles.card}>
          <div data-testid="manage-edit-row">
            <SettingsRow
              icon={<Pencil size={18} />}
              label={t('communityGroup.manageEdit')}
              arrow
              onClick={() => navigate(`${base}/edit`)}
            />
          </div>
          <div data-testid="manage-bans-row">
            <SettingsRow
              icon={<ShieldOff size={18} />}
              label={t('communityGroup.manageBans')}
              value={banCount === null ? undefined : String(banCount)}
              arrow
              onClick={() => navigate(`${base}/bans`)}
            />
          </div>
          {group.myRole === 'owner' && (
            <div data-testid="manage-transfer-row">
              <SettingsRow
                icon={<ArrowRightLeft size={18} />}
                label={t('communityGroup.manageTransfer')}
                arrow
                onClick={() => navigate(`${base}/transfer`)}
              />
            </div>
          )}
        </div>
        {group.myRole === 'manager' && (
          <div className={`${styles.card} ${styles.leaveCard}`}>
            <button type="button" className={styles.leaveBtn} data-testid="manage-leave-btn" onClick={() => setLeaveOpen(true)}>
              <LogOut size={18} /> {t('communityGroup.leaveGroup')}
            </button>
          </div>
        )}
      </div>
      {leaveOpen && (
        <div className={confirmStyles.backdrop} onClick={() => setLeaveOpen(false)}>
          <div className={confirmStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={confirmStyles.message}>{t('communityGroup.leaveGroupConfirm')}</p>
            <div className={confirmStyles.actions}>
              <button className={confirmStyles.cancel} onClick={() => setLeaveOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className={confirmStyles.confirm} data-testid="manage-leave-confirm" onClick={handleLeave}>
                {t('communityGroup.leaveGroup')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
