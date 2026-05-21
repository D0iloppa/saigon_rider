import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchQuests, fetchCompletedQuestIds } from '@/api/quests';
import { fetchDistricts, fetchRiderTypes, fetchSafetyGrades, localizedName } from '@/api/master';
import { useUserStore } from '@/store/useUserStore';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import type { District, RiderType, SafetyGrade } from '@/api/master';
import { formatDistance, formatTimeLeft, formatNumber } from '@/lib/format';
import type { Quest, QuestType } from '@/api/types';
import { StatusBar } from '@/components/layout/StatusBar';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { Chip } from '@/components/ui/Chip';
import { AppImage } from '@/components/ui/AppImage';
import { emojiUrl } from '@/lib/emoji';
import styles from './QuestList.module.css';

function getTimerStyle(iso?: string): { bg: string; color: string } {
  if (!iso) return { bg: 'var(--surface-2)', color: 'var(--text-3)' };
  const diffMin = (new Date(iso).getTime() - Date.now()) / 60000;
  if (diffMin < 180) return { bg: 'rgba(239,59,59,.1)', color: 'var(--danger)' };
  if (diffMin < 480) return { bg: 'rgba(245,158,11,.1)', color: 'var(--warn)' };
  return { bg: 'rgba(139,92,246,.1)', color: 'var(--xp)' };
}

function GifIcon({ code, size = 18 }: { code: string; size?: number }) {
  return (
    <img
      src={emojiUrl(code)}
      width={size} height={size} alt=""
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

type FilterParams = { districtId?: number; riderTypeId?: number; safetyGradeId?: number };

function buildFilterParams(
  districtId: number | null,
  riderTypeId: number | null,
  safetyGradeId: number | null,
): FilterParams {
  const p: FilterParams = {};
  if (districtId)    p.districtId    = districtId;
  if (riderTypeId)   p.riderTypeId   = riderTypeId;
  if (safetyGradeId) p.safetyGradeId = safetyGradeId;
  return p;
}

export default function QuestList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);
  const [tab, setTab] = useState<QuestType>('daily');
  const [activeDistrictId, setActiveDistrictId] = useState<number | null>(null);
  const [activeRiderTypeId, setActiveRiderTypeId] = useState<number | null>(null);
  const [activeSafetyGradeId, setActiveSafetyGradeId] = useState<number | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [riderTypes, setRiderTypes] = useState<RiderType[]>([]);
  const [safetyGrades, setSafetyGrades] = useState<SafetyGrade[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [completedQuests, setCompletedQuests] = useState<Quest[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);

  useEffect(() => {
    fetchDistricts().then(setDistricts);
    fetchRiderTypes().then(setRiderTypes);
    fetchSafetyGrades().then(setSafetyGrades);
  }, []);

  const TABS: { key: QuestType; label: string }[] = [
    { key: 'daily',  label: t('quest.tabDaily') },
    { key: 'weekly', label: t('quest.tabWeekly') },
    { key: 'event',  label: t('quest.tabEvent') },
  ];

  // completedIds를 먼저 가져온 다음 excludeCompleted로 메인 리스트 fetch
  const fetchPage = useCallback(async (page: number) => {
    const params = buildFilterParams(activeDistrictId, activeRiderTypeId, activeSafetyGradeId);
    return fetchQuests({
      type: tab,
      ...params,
      page,
      userId: userId ?? undefined,
      excludeCompleted: !!userId,
    });
  }, [tab, activeDistrictId, activeRiderTypeId, activeSafetyGradeId, userId]);

  const { items: quests, isLoading: loading, isLoadingMore, hasMore, sentinelRef, reset } =
    useInfiniteScroll<Quest>(fetchPage, 20, [tab, activeDistrictId, activeRiderTypeId, activeSafetyGradeId, userId]);

  // 완료 퀘스트 수 별도 fetch (카운트 표시용)
  useEffect(() => {
    if (!userId) { setCompletedCount(0); return; }
    fetchCompletedQuestIds(userId, tab).then((ids) => setCompletedCount(ids.size));
    setCompletedOpen(false);
    setCompletedQuests([]);
  }, [tab, userId]);

  const handleToggleCompleted = useCallback(async () => {
    if (completedOpen) {
      setCompletedOpen(false);
      return;
    }
    setCompletedOpen(true);
    if (completedQuests.length === 0 && completedCount > 0) {
      setCompletedLoading(true);
      try {
        const params = buildFilterParams(activeDistrictId, activeRiderTypeId, activeSafetyGradeId);
        const page = await fetchQuests({ type: tab, ...params, userId: userId ?? undefined, onlyCompleted: true, size: 50 });
        setCompletedQuests(page.items);
      } finally {
        setCompletedLoading(false);
      }
    }
  }, [completedOpen, completedQuests.length, completedCount, tab, activeDistrictId, activeRiderTypeId, activeSafetyGradeId, userId]);

  const handleRefresh = useCallback(async () => {
    if (userId) {
      fetchCompletedQuestIds(userId, tab).then((ids) => setCompletedCount(ids.size));
    }
    setCompletedOpen(false);
    setCompletedQuests([]);
    reset();
  }, [reset, userId, tab]);

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

        {/* Segment tabs */}
        <div className={styles.segmentWrap}>
          {TABS.map((tb) => (
            <button
              key={tb.key}
              className={`${styles.segTab} ${tab === tb.key ? styles.segTabActive : ''}`}
              onClick={() => setTab(tb.key)}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* District chips */}
        <div className={styles.filterRow}>
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
        </div>

        {/* Rider type + Safety grade chips */}
        <div className={styles.filterRow}>
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
          {safetyGrades.map((s) => (
            <Chip
              key={s.id}
              variant={activeSafetyGradeId === s.id ? 'dark' : 'surface'}
              onClick={() => setActiveSafetyGradeId(activeSafetyGradeId === s.id ? null : s.id)}
              style={{ cursor: 'pointer' }}
            >
              🛡 {localizedName(s)}
            </Chip>
          ))}
        </div>
      </div>

      {/* List */}
      <div className={styles.listArea} ref={listRef as React.RefObject<HTMLDivElement>}>
      <div className={styles.listContent} style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`shimmer ${styles.skeleton}`} />
            ))}
          </>
        ) : quests.length === 0 && completedCount === 0 ? (
          <div className={styles.empty}>
            <GifIcon code="1f9ed" size={120} />
            <h2 className={styles.emptyTitle}>{t('quest.emptyTitle')}</h2>
            <p className={styles.emptySub}>{t('quest.emptySub')}</p>
            <p className={styles.emptyQuote}>{t('quest.emptyQuote')}</p>
          </div>
        ) : (
          <>
            {quests.map((q) => (
              <QuestCard key={q.id} quest={q} onClick={() => navigate(`/quests/${q.id}`)} />
            ))}
            {completedCount > 0 && !loading && (
              <>
                <button className={styles.completedDivider} onClick={handleToggleCompleted}>
                  <span>{t('quest.completedSection')} ({completedCount})</span>
                  <span className={`${styles.completedToggleIcon} ${completedOpen ? styles.completedToggleIconOpen : ''}`}>
                    ▼
                  </span>
                </button>
                {completedOpen && (
                  completedLoading ? (
                    <div className={`shimmer ${styles.skeleton}`} />
                  ) : (
                    completedQuests.map((q) => (
                      <QuestCard key={q.id} quest={q} completed onClick={() => navigate(`/quests/${q.id}`)} />
                    ))
                  )
                )}
              </>
            )}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </>
        )}
      </div>{/* contentStyle wrapper */}
      </div>
    </div>
  );
}

function QuestCard({ quest, onClick, completed = false }: { quest: Quest; onClick: () => void; completed?: boolean }) {
  const { t } = useTranslation();
  const timeLeft = formatTimeLeft(quest.expiresAt);
  const timerStyle = getTimerStyle(quest.expiresAt);
  const tag = quest.tags[0];

  return (
    <button className={`${styles.card} ${completed ? styles.cardCompleted : ''}`} onClick={onClick}>
      {/* Top shine */}
      <div className={styles.cardShine} />

      {/* Completed badge */}
      {completed && (
        <span className={styles.completedBadge}>✓ DONE</span>
      )}

      {/* Tag chip */}
      {!completed && tag && (
        <span className={`${styles.tag} ${
          tag === 'HOT' ? styles.tagHot :
          tag === 'NEW' ? styles.tagNew :
          styles.tagLimited
        }`}>
          {tag}
        </span>
      )}

      {/* Thumbnail */}
      <div className={styles.thumb}>
        <AppImage src={quest.thumbnailUrls} alt="" />
      </div>

      {/* Content */}
      <div className={styles.cardBody}>
        <div className={styles.metaRow}>
          <Chip variant="surface">Lv.{quest.minLevel} · {quest.districtName || t('quest.everywhere')}</Chip>
        </div>
        <h3 className={styles.cardTitle}>{quest.title}</h3>
        <div className={styles.cardMeta}>
          {formatDistance(quest.minDistanceM)} · {'★'.repeat(quest.difficulty)}{'☆'.repeat(5 - quest.difficulty)}
        </div>
        <div className={styles.cardFooter}>
          <span className={styles.rewardItem}>
            <img
              src={emojiUrl('1f48e')}
              width={16} height={16} alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className={styles.rewardNum} style={{ color: 'var(--xp)' }}>+{formatNumber(quest.rewardExp, { compact: true })}</span>
          </span>
          {quest.rewardGold > 0 && (
            <span className={styles.rewardItem}>
              <img
                src={emojiUrl('1fa99')}
                width={16} height={16} alt=""
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <span className={styles.rewardNum} style={{ color: 'var(--gold)' }}>+{formatNumber(quest.rewardGold, { compact: true })}</span>
            </span>
          )}
          {timeLeft && (
            <Chip
              style={{ background: timerStyle.bg, color: timerStyle.color, border: 'none' }}
            >
              ⏱ {timeLeft}
            </Chip>
          )}
        </div>
      </div>
    </button>
  );
}
