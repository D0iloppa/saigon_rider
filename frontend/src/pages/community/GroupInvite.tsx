import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, SearchX, UsersRound, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { getGroup, listInviteCandidates, sendGroupInvites } from '@/api/community_groups';
import type { CommunityGroup, GroupInviteCandidate } from '@/api/types';
import communityStyles from './Community.module.css';
import styles from './GroupInvite.module.css';

const SEARCH_DEBOUNCE_MS = 300;
const STATE_LABEL: Record<string, string> = {
  member: 'communityGroup.inviteStateMember',
  invited: 'communityGroup.inviteStateInvited',
  pending_request: 'communityGroup.inviteStatePending',
};

// 그룹 초대 — 후보는 서버가 내 팔로우/팔로워/1:1 대화 상대로만 좁혀 내려준다(전역 검색 없음).
export default function GroupInvite() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [candidates, setCandidates] = useState<GroupInviteCandidate[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getGroup(slug).then(setGroup).catch(() => setGroup(null));
  }, [slug]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!group) return;
    setLoading(true);
    listInviteCandidates(group.id, debouncedQuery)
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [group, debouncedQuery]);

  const toggle = (userId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const handleSend = async () => {
    if (!group || selected.size === 0 || sending) return;
    setSending(true);
    try {
      const { sent } = await sendGroupInvites(group.id, [...selected]);
      if (sent > 0) toast.success(t('communityGroup.inviteSent', { count: sent }));
      else toast.error(t('communityGroup.inviteSentNone'));
      navigate(-1);
    } catch {
      toast.error(t('common.errorUnexpected'));
      setSending(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('communityGroup.invite')} />
      <div className={communityStyles.searchWrap}>
        <div className={communityStyles.searchBox}>
          <Search size={18} className={communityStyles.searchIcon} />
          <input
            className={communityStyles.searchInput}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            data-testid="invite-search-input"
            placeholder={t('communityGroup.invitePlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('communityGroup.invitePlaceholder')}
          />
          {query && (
            <button type="button" className={communityStyles.searchClear} onClick={() => setQuery('')} aria-label={t('common.clear')}>
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {!loading && candidates.length === 0 ? (
          debouncedQuery ? (
            <StateBlock icon={SearchX} title={t('communityGroup.searchEmpty')} desc={t('communityGroup.searchEmptySub')} />
          ) : (
            <StateBlock icon={UsersRound} title={t('communityGroup.inviteEmpty')} desc={t('communityGroup.inviteEmptySub')} />
          )
        ) : (
          candidates.map((c) => {
            const disabled = c.state !== 'invitable';
            return (
              <label
                key={c.userId}
                className={disabled ? styles.rowDisabled : styles.row}
                data-testid="invite-row"
                data-user-id={c.userId}
              >
                <AppImage src={c.avatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
                <span className={styles.name}>{c.nickname ?? '—'}</span>
                {disabled && <span className={styles.stateLabel}>{t(STATE_LABEL[c.state] ?? '')}</span>}
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  data-testid="invite-row-checkbox"
                  disabled={disabled}
                  checked={selected.has(c.userId)}
                  onChange={() => toggle(c.userId)}
                />
              </label>
            );
          })
        )}
      </div>

      <div className={styles.ctaBar}>
        <button
          type="button"
          className={styles.ctaBtn}
          data-testid="invite-send-btn"
          disabled={selected.size === 0 || sending}
          onClick={handleSend}
        >
          {t('communityGroup.inviteSend', { count: selected.size })}
        </button>
      </div>
    </div>
  );
}
