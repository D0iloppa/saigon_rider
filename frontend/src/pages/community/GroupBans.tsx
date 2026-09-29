import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, SearchX, ShieldOff, UsersRound, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import confirmStyles from '@/components/ui/ConfirmDialog.module.css';
import { getGroup, listGroupBans, unbanGroupMember } from '@/api/community_groups';
import type { CommunityGroup, CommunityGroupBan } from '@/api/types';
import communityStyles from './Community.module.css';
import styles from './GroupBans.module.css';

const SEARCH_DEBOUNCE_MS = 300;

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

// 차단 멤버 관리 (owner/manager 전용) — 언제·누가 차단했는지 + 닉네임 검색 + 해제 (F-CM-02 FR-5).
export default function GroupBans() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [bans, setBans] = useState<CommunityGroupBan[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [unbanTarget, setUnbanTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    getGroup(slug)
      .then(setGroup)
      .catch(() => setGroup(null))
      .finally(() => setGroupLoading(false));
  }, [slug]);

  const canManage = group?.myMembershipStatus === 'ACTIVE' && (group.myRole === 'owner' || group.myRole === 'manager');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!group || !canManage) return;
    let cancelled = false; // 늦게 도착한 이전 검색 응답이 최신 결과를 덮지 않게
    setLoading(true);
    listGroupBans(group.id, debouncedQuery)
      .then((list) => !cancelled && setBans(list))
      .catch(() => !cancelled && setBans([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [group, canManage, debouncedQuery]);

  const handleUnban = async () => {
    const userId = unbanTarget;
    if (!group || !userId) return;
    setUnbanTarget(null);
    try {
      await unbanGroupMember(group.id, userId);
      setBans((prev) => prev.filter((b) => b.userId !== userId));
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  if (groupLoading) {
    return (
      <div className={styles.page}>
        <TopBar title={t('communityGroup.manageBans')} />
      </div>
    );
  }

  if (!group || !canManage) {
    return (
      <div className={styles.page}>
        <TopBar title={t('communityGroup.manageBans')} />
        <StateBlock icon={UsersRound} tone="error" title={t(group ? 'communityGroup.noPermission' : 'communityGroup.notFound')} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopBar title={t('communityGroup.manageBans')} />
      <div className={communityStyles.searchWrap}>
        <div className={communityStyles.searchBox}>
          <Search size={18} className={communityStyles.searchIcon} />
          <input
            className={communityStyles.searchInput}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            data-testid="ban-search-input"
            placeholder={t('communityGroup.banSearchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('communityGroup.banSearchPlaceholder')}
          />
          {query && (
            <button type="button" className={communityStyles.searchClear} onClick={() => setQuery('')} aria-label={t('common.clear')}>
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {!loading && bans.length === 0 ? (
          debouncedQuery ? (
            <StateBlock icon={SearchX} title={t('communityGroup.searchEmpty')} desc={t('communityGroup.searchEmptySub')} />
          ) : (
            <StateBlock icon={ShieldOff} title={t('communityGroup.banListEmpty')} />
          )
        ) : (
          bans.map((b) => (
            <div key={b.userId} className={styles.row} data-testid="ban-row" data-user-id={b.userId}>
              <AppImage src={b.avatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
              <div className={styles.text}>
                <span className={styles.name}>{b.nickname ?? '—'}</span>
                <span className={styles.meta} data-testid="ban-row-meta">
                  {t('communityGroup.banMeta', { date: formatDate(b.bannedAt), name: b.bannedByNickname ?? '-' })}
                </span>
              </div>
              <button
                type="button"
                className={styles.unbanBtn}
                data-testid="ban-unban-btn"
                onClick={() => setUnbanTarget(b.userId)}
              >
                {t('communityGroup.unban')}
              </button>
            </div>
          ))
        )}
      </div>

      {unbanTarget && (
        <div className={confirmStyles.backdrop} onClick={() => setUnbanTarget(null)}>
          <div className={confirmStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={confirmStyles.message}>{t('communityGroup.unbanConfirm')}</p>
            <div className={confirmStyles.actions}>
              <button className={confirmStyles.cancel} onClick={() => setUnbanTarget(null)}>
                {t('common.cancel')}
              </button>
              <button className={confirmStyles.confirm} data-testid="ban-unban-confirm" onClick={handleUnban}>
                {t('communityGroup.unban')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
