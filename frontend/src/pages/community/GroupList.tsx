import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Users, UsersRound } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { Chip } from '@/components/ui/Chip';
import { AppImage } from '@/components/ui/AppImage';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { listGroups } from '@/api/community_groups';
import type { CommunityGroup } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import feedStyles from '@/pages/feed/FeedList.module.css';
import styles from '@/pages/dm/DmList.module.css';

type FilterKey = 'all' | 'mine';

// 그룹 탐색 화면 — 신규 카드 디자인 없이 DmList 의 리스트 아이템 패턴을 재사용한다 (§4.3).
export default function GroupList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const [filter, setFilter] = useState<FilterKey>('all');

  const fetchPage = useCallback(
    async (page: number) => {
      if (filter === 'mine' && !user) return { items: [], total: 0, page, size: 20 };
      return listGroups(filter, page, 20);
    },
    [filter, user],
  );

  const { items: groups, isLoading, isLoadingMore, hasMore, sentinelRef } =
    useInfiniteScroll<CommunityGroup>(fetchPage, 20, [filter, user?.id]);

  return (
    <div className={styles.page}>
      <TopBar
        title={t('communityGroup.exploreTitle')}
        rightContent={
          <button
            className={styles.headerAddBtn}
            type="button"
            onClick={() => navigate('/community/groups/new')}
            aria-label={t('communityGroup.createTitle')}
          >
            <Plus size={20} strokeWidth={2.2} />
          </button>
        }
      />

      <div className={styles.body}>
        <div className={feedStyles.filterRow} role="radiogroup" aria-label={t('communityGroup.exploreTitle')}>
          <Chip
            as="button"
            variant={filter === 'all' ? 'dark' : 'surface'}
            role="radio"
            aria-checked={filter === 'all'}
            onClick={() => setFilter('all')}
            style={{ cursor: 'pointer' }}
          >
            <UsersRound size={13} strokeWidth={2.2} />
            {t('communityGroup.filterAll')}
          </Chip>
          <Chip
            as="button"
            variant={filter === 'mine' ? 'dark' : 'surface'}
            role="radio"
            aria-checked={filter === 'mine'}
            onClick={() => setFilter('mine')}
            style={{ cursor: 'pointer' }}
          >
            <Users size={13} strokeWidth={2.2} />
            {t('communityGroup.filterMine')}
          </Chip>
        </div>

        {!isLoading && groups.length === 0 ? (
          <StateBlock icon={UsersRound} title={t('communityGroup.empty')} />
        ) : (
          <div className={styles.list}>
            {groups.map((g) => (
              <button
                key={g.id}
                className={styles.row}
                onClick={() => navigate(`/group/${g.slug ?? g.id}`)}
              >
                <AppImage src={g.coverUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
                <div className={styles.info}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>
                      {g.name}
                      <span className={styles.memberCount}> ({g.memberCount})</span>
                    </span>
                  </div>
                  <div className={styles.preview}>{g.description ?? ''}</div>
                </div>
                {g.myMembershipStatus === 'ACTIVE' && (
                  <span className={styles.badge}>{t('communityGroup.joined')}</span>
                )}
              </button>
            ))}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </div>
        )}
      </div>
    </div>
  );
}
