import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchQuests, fetchCompletedQuestIds } from '@/api/quests';
import { fetchDistricts, fetchRiderTypes, fetchSafetyGrades, localizedName } from '@/api/master';
import { useUserStore } from '@/store/useUserStore';
import type { District, RiderType, SafetyGrade } from '@/api/master';
import { formatDistance, formatTimeLeft } from '@/lib/format';
import type { Quest, QuestType } from '@/api/types';
import { StatusBar } from '@/components/layout/StatusBar';
import { Chip } from '@/components/ui/Chip';
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
  const [quests, setQuests] = useState<Quest[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [completedOpen, setCompletedOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    setLoading(true);
    const params = buildFilterParams(activeDistrictId, activeRiderTypeId, activeSafetyGradeId);
    const questsPromise = fetchQuests({ type: tab, ...params });
    const completedPromise = userId ? fetchCompletedQuestIds(userId, tab) : Promise.resolve(new Set<string>());
    Promise.all([questsPromise, completedPromise]).then(([list, ids]) => {
      setQuests(list);
      setCompletedIds(ids);
      setLoading(false);
    });
  }, [tab, activeDistrictId, activeRiderTypeId, activeSafetyGradeId, userId]);

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
      <div className={styles.listArea}>
        {loading ? (
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
        ) : (() => {
          const active = quests.filter((q) => !completedIds.has(q.id));
          const completed = quests.filter((q) => completedIds.has(q.id));
          return (
            <>
              {active.map((q) => (
                <QuestCard key={q.id} quest={q} onClick={() => navigate(`/quests/${q.id}`)} />
              ))}
              {completed.length > 0 && (
                <>
                  <button
                    type="button"
                    className={styles.completedDivider}
                    onClick={() => setCompletedOpen((v) => !v)}
                    aria-expanded={completedOpen}
                  >
                    <span>
                      {t('quest.completedSection')} ({completed.length})
                    </span>
                    <span className={`${styles.completedToggleIcon} ${completedOpen ? styles.completedToggleIconOpen : ''}`}>
                      ▾
                    </span>
                  </button>
                  {completedOpen && completed.map((q) => (
                    <QuestCard key={q.id} quest={q} onClick={() => navigate(`/quests/${q.id}`)} completed />
                  ))}
                </>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function QuestCard({ quest, onClick, completed = false }: { quest: Quest; onClick: () => void; completed?: boolean }) {
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
        <img
          src={quest.thumbnailUrl}
          alt=""
          onError={(e) => {
            const target = e.currentTarget;
            target.onerror = null;
            target.src = `https://picsum.photos/seed/${quest.id}/300/300`;
          }}
        />
      </div>

      {/* Content */}
      <div className={styles.cardBody}>
        <div className={styles.metaRow}>
          <Chip variant="surface">Lv.{quest.minLevel} · {quest.districtName}</Chip>
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
            <span className={styles.rewardNum} style={{ color: 'var(--xp)' }}>+{quest.rewardExp}</span>
          </span>
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
