import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, SearchX, UsersRound, X } from 'lucide-react';
import StateBlock from '@/components/ui/StateBlock';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { listGroups } from '@/api/community_groups';
import type { CommunityGroup } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import { CommunityHeader } from './CommunityHeader';
import { GroupCard, GroupCover } from './GroupCard';
import { pickTopicLabel, useGroupTopics } from './groupTopics';
import styles from './Community.module.css';

const SEARCH_DEBOUNCE_MS = 300;

// 커뮤니티 [그룹] 탭 — 검색 + 내 그룹(로그인 시 항상) + 그룹 둘러보기 1열 카드 (F-CM-02 FR-1 r13·r14).
export default function GroupList() {
  const { t, i18n } = useTranslation();
  const topics = useGroupTopics();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const [mine, setMine] = useState<CommunityGroup[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [topic, setTopic] = useState('');

  useEffect(() => {
    if (!user) { setMine([]); return; }
    listGroups('mine', 1, 20).then((r) => setMine(r.items)).catch(() => setMine([]));
  }, [user]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  const fetchPage = useCallback((page: number) => listGroups('all', page, 20, debouncedQuery, topic), [debouncedQuery, topic]);
  const { items: groups, isLoading, isLoadingMore, hasMore, sentinelRef } =
    useInfiniteScroll<CommunityGroup>(fetchPage, 20, [debouncedQuery, topic]);

  const searching = debouncedQuery.length > 0;
  const filtering = searching || topic !== '';

  return (
    <div className={styles.page}>
      <CommunityHeader active="group" />

      <div className={styles.scroll}>
        <div className={styles.searchWrap}>
          <div className={styles.searchBox}>
            <Search size={18} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              data-testid="group-search-input"
              placeholder={t('communityGroup.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('communityGroup.searchPlaceholder')}
            />
            {query && (
              <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label={t('common.clear')}>
                <X size={13} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        <div className={styles.topicRow} data-testid="group-topic-chips" role="radiogroup" aria-label={t('communityGroup.topicLabel')}>
          {[{ code: '', labels: null }, ...topics].map(({ code: c, labels }) => (
            <button
              key={c || 'all'}
              type="button"
              role="radio"
              aria-checked={topic === c}
              data-testid={`group-topic-${c || 'all'}`}
              className={`${styles.topicBtn} ${topic === c ? styles.topicBtnActive : ''}`}
              onClick={() => setTopic(c)}
            >
              {c ? pickTopicLabel(labels, i18n.language) : t('communityGroup.topicAll')}
            </button>
          ))}
        </div>

        {user && !filtering && (
          <>
            <div className={styles.sectionTitle}>{t('communityGroup.myGroups')}</div>
            {mine.length > 0 ? (
              <div className={styles.rail} data-testid="my-groups-rail">
                {mine.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={styles.railItem}
                    data-testid="my-groups-rail-item"
                    onClick={() => navigate(`/group/${g.slug ?? g.id}`)}
                  >
                    <GroupCover name={g.name} coverUrl={g.coverUrl} />
                    <span className={styles.railName}>{g.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.myGroupsEmpty} data-testid="my-groups-empty">
                <UsersRound size={16} strokeWidth={2} />
                {t('communityGroup.myGroupsEmpty')}
              </div>
            )}
          </>
        )}

        <div className={styles.sectionTitle}>
          {filtering ? t('communityGroup.searchResults') : t('communityGroup.browseTitle')}
        </div>
        {!isLoading && groups.length === 0 ? (
          <div className={styles.empty}>
            {filtering ? (
              <StateBlock icon={SearchX} title={t('communityGroup.searchEmpty')} desc={t('communityGroup.searchEmptySub')} />
            ) : (
              <StateBlock
                icon={UsersRound}
                title={t('communityGroup.empty')}
                actionLabel={t('communityGroup.createTitle')}
                onAction={() => navigate('/community/groups/new')}
              />
            )}
          </div>
        ) : (
          <div className={styles.cardList}>
            {groups.map((g) => <GroupCard key={g.id} g={g} />)}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </div>
        )}
      </div>

      <button
        className={styles.createFab}
        type="button"
        data-testid="group-create-fab"
        onClick={() => navigate('/community/groups/new')}
      >
        <Plus size={20} strokeWidth={2.4} />
        {t('communityGroup.createTitle')}
      </button>
    </div>
  );
}
