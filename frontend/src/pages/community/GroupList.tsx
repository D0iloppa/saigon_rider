import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, UsersRound } from 'lucide-react';
import StateBlock from '@/components/ui/StateBlock';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { listGroups } from '@/api/community_groups';
import type { CommunityGroup } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import { CommunityHeader } from './CommunityHeader';
import { GroupCard, GroupCover } from './GroupCard';
import styles from './Community.module.css';

// 커뮤니티 [그룹] 탭 — 내 그룹 레일 + 그룹 둘러보기 1열 카드 (F-CM-02 r13).
export default function GroupList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const [mine, setMine] = useState<CommunityGroup[]>([]);

  useEffect(() => {
    if (!user) { setMine([]); return; }
    listGroups('mine', 1, 20).then((r) => setMine(r.items)).catch(() => setMine([]));
  }, [user]);

  const fetchPage = useCallback((page: number) => listGroups('all', page, 20), []);
  const { items: groups, isLoading, isLoadingMore, hasMore, sentinelRef } =
    useInfiniteScroll<CommunityGroup>(fetchPage, 20, []);

  return (
    <div className={styles.page}>
      <CommunityHeader active="group" />

      <div className={styles.scroll}>
        {mine.length > 0 && (
          <>
            <div className={styles.sectionTitle}>{t('communityGroup.myGroups')}</div>
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
          </>
        )}

        <div className={styles.sectionTitle}>{t('communityGroup.browseTitle')}</div>
        {!isLoading && groups.length === 0 ? (
          <div className={styles.empty}>
            <StateBlock
              icon={UsersRound}
              title={t('communityGroup.empty')}
              actionLabel={t('communityGroup.createTitle')}
              onAction={() => navigate('/community/groups/new')}
            />
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
