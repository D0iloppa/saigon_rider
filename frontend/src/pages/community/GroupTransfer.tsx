import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, SearchX, UsersRound, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import confirmStyles from '@/components/ui/ConfirmDialog.module.css';
import { extractErrorCode } from '@/api/client';
import { useUserStore } from '@/store/useUserStore';
import { getGroup, listMembers, transferGroupOwner } from '@/api/community_groups';
import type { CommunityGroup, CommunityGroupMember } from '@/api/types';
import communityStyles from './Community.module.css';
import styles from './GroupTransfer.module.css';

// 방장 위임 (방장 전용) — ACTIVE 멤버 중 한 명을 골라 방장을 넘긴다. 이전 방장은 매니저가 된다 (F-CM-02 FR-6).
export default function GroupTransfer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const me = useUserStore((s) => s.user);
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [members, setMembers] = useState<CommunityGroupMember[]>([]);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<CommunityGroupMember | null>(null);

  useEffect(() => {
    if (!slug) return;
    getGroup(slug)
      .then(setGroup)
      .catch(() => setGroup(null))
      .finally(() => setGroupLoading(false));
  }, [slug]);

  const isOwner = group?.myMembershipStatus === 'ACTIVE' && group.myRole === 'owner';

  useEffect(() => {
    if (!group || !isOwner) return;
    listMembers(group.id).then(setMembers).catch(() => setMembers([]));
  }, [group, isOwner]);

  if (groupLoading) {
    return (
      <div className={styles.page}>
        <TopBar title={t('communityGroup.transferTitle')} />
      </div>
    );
  }

  if (!group || !isOwner) {
    return (
      <div className={styles.page}>
        <TopBar title={t('communityGroup.transferTitle')} />
        <StateBlock icon={UsersRound} tone="error" title={t(group ? 'communityGroup.ownerOnly' : 'communityGroup.notFound')} />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const candidates = members.filter((m) => m.userId !== me?.id && (!q || (m.nickname ?? '').toLowerCase().includes(q)));

  const handleTransfer = async () => {
    const picked = target;
    if (!picked) return;
    setTarget(null);
    try {
      await transferGroupOwner(group.id, picked.userId);
      toast.success(t('communityGroup.transferDone'));
      navigate(`/group/${group.slug ?? group.id}`, { replace: true });
    } catch (err) {
      const code = extractErrorCode(err);
      toast.error(code === 'owner_only' ? t('communityGroup.ownerOnly') : code === 'target_not_active' ? t('communityGroup.targetNotActive') : t('common.errorUnexpected'));
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('communityGroup.transferTitle')} />
      <div className={communityStyles.searchWrap}>
        <div className={communityStyles.searchBox}>
          <Search size={18} className={communityStyles.searchIcon} />
          <input
            className={communityStyles.searchInput}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            data-testid="transfer-search-input"
            placeholder={t('communityGroup.transferSearchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('communityGroup.transferSearchPlaceholder')}
          />
          {query && (
            <button type="button" className={communityStyles.searchClear} onClick={() => setQuery('')} aria-label={t('common.clear')}>
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {candidates.length === 0 ? (
          q ? (
            <StateBlock icon={SearchX} title={t('communityGroup.searchEmpty')} desc={t('communityGroup.searchEmptySub')} />
          ) : (
            <StateBlock icon={UsersRound} title={t('communityGroup.transferEmpty')} />
          )
        ) : (
          candidates.map((m) => (
            <button key={m.userId} type="button" className={styles.row} data-testid="transfer-row" data-user-id={m.userId} onClick={() => setTarget(m)}>
              <AppImage src={m.avatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
              <span className={styles.name}>{m.nickname ?? '—'}</span>
              <span className={styles.role}>{t(`communityGroup.role_${m.role}`, { defaultValue: m.role })}</span>
            </button>
          ))
        )}
      </div>

      {target && (
        <div className={confirmStyles.backdrop} onClick={() => setTarget(null)}>
          <div className={confirmStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={confirmStyles.message}>{t('communityGroup.transferConfirm', { name: target.nickname ?? '—' })}</p>
            <div className={confirmStyles.actions}>
              <button className={confirmStyles.cancel} onClick={() => setTarget(null)}>
                {t('common.cancel')}
              </button>
              <button className={confirmStyles.confirm} data-testid="transfer-confirm" onClick={handleTransfer}>
                {t('communityGroup.transferAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
