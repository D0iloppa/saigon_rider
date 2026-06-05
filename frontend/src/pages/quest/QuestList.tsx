import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchQuests, fetchMyAccepted, fetchMyCompleted, type MyAcceptedItem, type MyCompletedItem } from '@/api/quests';
import { fetchDistricts, fetchRiderTypes, localizedName } from '@/api/master';
import { useUserStore } from '@/store/useUserStore';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import type { District, RiderType } from '@/api/master';
import { formatDistance } from '@/lib/format';
import type { Quest, QuestType } from '@/api/types';
import { StatusBar } from '@/components/layout/StatusBar';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { Chip } from '@/components/ui/Chip';
import QuestCardBase from '@/components/quest/QuestCard';
import { emojiUrl } from '@/lib/emoji';
import styles from './QuestList.module.css';

function GifIcon({ code, size = 18 }: { code: string; size?: number }) {
  return (
    <img
      src={emojiUrl(code)}
      width={size} height={size} alt=""
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

type FilterParams = { districtId?: number; riderTypeId?: number };

function buildFilterParams(
  districtId: number | null,
  riderTypeId: number | null,
): FilterParams {
  const p: FilterParams = {};
  if (districtId)    p.districtId    = districtId;
  if (riderTypeId)   p.riderTypeId   = riderTypeId;
  return p;
}

export default function QuestList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);
  const userLevel = useUserStore((s) => s.user?.level) ?? 1;
  const [mode, setMode] = useState<'catalog' | 'accepted'>('catalog');
  const [acceptedSub, setAcceptedSub] = useState<'active' | 'completed'>('active');
  const [tab, setTab] = useState<QuestType>('daily');
  const [accepted, setAccepted] = useState<MyAcceptedItem[]>([]);
  const [acceptedLoading, setAcceptedLoading] = useState(false);
  const [activeDistrictId, setActiveDistrictId] = useState<number | null>(null);
  const [activeRiderTypeId, setActiveRiderTypeId] = useState<number | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [riderTypes, setRiderTypes] = useState<RiderType[]>([]);
  const [completedQuests, setCompletedQuests] = useState<MyCompletedItem[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);

  useEffect(() => {
    fetchDistricts().then(setDistricts);
    fetchRiderTypes().then(setRiderTypes);
  }, []);

  const TABS: { key: QuestType; label: string }[] = [
    { key: 'daily',  label: t('quest.tabDaily') },
    { key: 'weekly', label: t('quest.tabWeekly') },
    { key: 'event',  label: t('quest.tabEvent') },
  ];

  // 카탈로그: 이미 수령(ACCEPTED)했거나 완료한 항목 제외
  const fetchPage = useCallback(async (page: number) => {
    const params = buildFilterParams(activeDistrictId, activeRiderTypeId);
    return fetchQuests({
      type: tab,
      ...params,
      page,
      userId: userId ?? undefined,
      excludeCompleted: !!userId,
      excludeAccepted: !!userId,
    });
  }, [tab, activeDistrictId, activeRiderTypeId, userId]);

  // 내 퀘스트(수령함) — mode 전환 또는 userId 변경 시 로드
  useEffect(() => {
    if (mode !== 'accepted' || !userId) return;
    setAcceptedLoading(true);
    fetchMyAccepted(userId)
      .then(setAccepted)
      .finally(() => setAcceptedLoading(false));
  }, [mode, userId]);

  // 완료 퀘스트 — '내 퀘스트 > 완료' 하위 탭 진입 시 전체 기간 로드
  useEffect(() => {
    if (mode !== 'accepted' || acceptedSub !== 'completed' || !userId) return;
    setCompletedLoading(true);
    fetchMyCompleted(userId)
      .then(setCompletedQuests)
      .finally(() => setCompletedLoading(false));
  }, [mode, acceptedSub, userId]);

  const { items: quests, isLoading: loading, isLoadingMore, hasMore, sentinelRef, reset } =
    useInfiniteScroll<Quest>(fetchPage, 20, [tab, activeDistrictId, activeRiderTypeId, userId]);

  const handleRefresh = useCallback(async () => {
    setCompletedQuests([]);
    reset();
  }, [reset]);

  const { containerRef: listRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(handleRefresh);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ position: 'relative', zIndex: 10 }}>
          <StatusBar variant="dark" />
        </div>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>{t('quest.title')}</h1>
          <GifIcon code="1f4cd" size={32} />
        </div>

        {/* Mode toggle: 가능 / 내 퀘스트 */}
        <div className={styles.segmentWrap} style={{ marginBottom: 8 }}>
          <button
            className={`${styles.segTab} ${mode === 'catalog' ? styles.segTabActive : ''}`}
            onClick={() => setMode('catalog')}
          >
            {t('quest.modeCatalog', { defaultValue: '가능' })}
          </button>
          <button
            className={`${styles.segTab} ${mode === 'accepted' ? styles.segTabActive : ''}`}
            onClick={() => setMode('accepted')}
          >
            {t('quest.modeAccepted', { defaultValue: '내 퀘스트' })}
            {accepted.length > 0 && <span style={{ marginLeft: 6, opacity: .7 }}>({accepted.length})</span>}
          </button>
        </div>

        {/* Accepted 하위 토글: 수령 중 / 완료 */}
        {mode === 'accepted' && <div className={styles.segmentWrap}>
          <button
            className={`${styles.segTab} ${acceptedSub === 'active' ? styles.segTabActive : ''}`}
            onClick={() => setAcceptedSub('active')}
          >
            {t('quest.acceptedSubActive', { defaultValue: '수령 중' })}
          </button>
          <button
            className={`${styles.segTab} ${acceptedSub === 'completed' ? styles.segTabActive : ''}`}
            onClick={() => setAcceptedSub('completed')}
          >
            {t('quest.completedSection')}
          </button>
        </div>}

        {/* Segment tabs (카탈로그 모드에서만) */}
        {mode === 'catalog' && <div className={styles.segmentWrap}>
          {TABS.map((tb) => (
            <button
              key={tb.key}
              className={`${styles.segTab} ${tab === tb.key ? styles.segTabActive : ''}`}
              onClick={() => setTab(tb.key)}
            >
              {tb.label}
            </button>
          ))}
        </div>}

        {/* District chips */}
        {mode === 'catalog' && <div className={styles.filterRow}>
          {districts.map((d) => (
            <Chip
              key={d.id}
              variant={activeDistrictId === d.id ? 'dark' : 'surface'}
              onClick={() => setActiveDistrictId(activeDistrictId === d.id ? null : d.id)}
              style={{ cursor: 'pointer' }}
            >
              🌆 {localizedName(d)}
            </Chip>
          ))}
        </div>}

        {/* Rider type chips */}
        {mode === 'catalog' && <div className={styles.filterRow}>
          {riderTypes.map((r) => (
            <Chip
              key={r.id}
              variant={activeRiderTypeId === r.id ? 'dark' : 'surface'}
              onClick={() => setActiveRiderTypeId(activeRiderTypeId === r.id ? null : r.id)}
              style={{ cursor: 'pointer' }}
            >
              {r.icon} {localizedName(r)}
            </Chip>
          ))}
        </div>}
      </div>

      {/* List */}
      <div className={styles.listArea} ref={listRef as React.RefObject<HTMLDivElement>}>
      <div className={styles.listContent} style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {mode === 'accepted' ? (
          acceptedSub === 'active' ? (
            acceptedLoading ? (
              <div className={`shimmer ${styles.skeleton}`} />
            ) : accepted.length === 0 ? (
              <div className={styles.empty}>
                <GifIcon code="1f4dd" size={120} />
                <h2 className={styles.emptyTitle}>{t('quest.acceptedEmptyTitle', { defaultValue: '수령한 퀘스트가 없어요' })}</h2>
                <p className={styles.emptySub}>{t('quest.acceptedEmptySub', { defaultValue: '가능 탭에서 퀘스트를 수령해보세요' })}</p>
              </div>
            ) : (
              accepted.map((a) => (
                <QuestCard key={a.userQuestId} quest={a.quest} onClick={() => navigate(`/quests/${a.quest.id}`)} />
              ))
            )
          ) : (
            completedLoading ? (
              <div className={`shimmer ${styles.skeleton}`} />
            ) : completedQuests.length === 0 ? (
              <div className={styles.empty}>
                <GifIcon code="2705" size={120} />
                <h2 className={styles.emptyTitle}>{t('quest.completedEmptyTitle', { defaultValue: '완료한 퀘스트가 없어요' })}</h2>
                <p className={styles.emptySub}>{t('quest.completedEmptySub', { defaultValue: '퀘스트를 완료하면 여기에 모여요' })}</p>
              </div>
            ) : (
              completedQuests.map((c) => (
                <QuestCard key={c.userQuestId} quest={c.quest} completed completedAt={c.completedAt} />
              ))
            )
          )
        ) : loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`shimmer ${styles.skeleton}`} />
            ))}
          </>
        ) : quests.length === 0 ? (
          <div className={styles.empty}>
            <GifIcon code="1f9ed" size={120} />
            <h2 className={styles.emptyTitle}>{t('quest.emptyTitle')}</h2>
            <p className={styles.emptySub}>{t('quest.emptySub')}</p>
            <p className={styles.emptyQuote}>{t('quest.emptyQuote')}</p>
          </div>
        ) : (
          <>
            {quests.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                locked={userLevel < q.minLevel}
                onClick={() => navigate(`/quests/${q.id}`)}
              />
            ))}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </>
        )}
      </div>{/* contentStyle wrapper */}
      </div>
    </div>
  );
}

function QuestCard({ quest, onClick, completed = false, completedAt, locked = false }: { quest: Quest; onClick?: () => void; completed?: boolean; completedAt?: string | null; locked?: boolean }) {
  const { t } = useTranslation();
  return (
    <QuestCardBase
      variant="list"
      missionCode={quest.missionCode}
      rarity={quest.rarity}
      csv={quest.csv}
      customImageUrl={quest.thumbnailImageUrl}
      title={quest.title}
      level={quest.minLevel}
      distance={[quest.districtName || t('quest.everywhere'), formatDistance(quest.minDistanceM)].filter(Boolean).join(' · ')}
      tags={quest.tags}
      rewards={{ xp: quest.rewardXpPoints, gp: quest.rewardGold }}
      expiresAt={quest.expiresAt}
      completed={completed}
      completedAt={completedAt}
      locked={locked}
      onClick={onClick}
    />
  );
}
