import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchQuests } from '@/api/quests';
import { formatDistance, formatTimeLeft } from '@/lib/format';
import type { Quest, QuestType } from '@/api/types';
import { Chip } from '@/components/ui/Chip';
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
      src={`https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif`}
      width={size} height={size} alt=""
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

export default function QuestList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTab] = useState<QuestType>('daily');
  const [activeFilter, setActiveFilter] = useState<string | null>('district');
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  const TABS: { key: QuestType; label: string }[] = [
    { key: 'daily',  label: t('quest.tabDaily') },
    { key: 'weekly', label: t('quest.tabWeekly') },
    { key: 'event',  label: t('quest.tabEvent') },
  ];

  const FILTERS: { key: string; label: string }[] = [
    { key: 'district', label: '🌆 Quận 1' },
    { key: 'commute',  label: t('quest.filterCommute') },
    { key: 'night',    label: t('quest.filterNight') },
    { key: 'safetyA',  label: t('quest.filterSafetyA') },
  ];

  useEffect(() => {
    setLoading(true);
    fetchQuests({ type: tab }).then((list) => {
      setQuests(list);
      setLoading(false);
    });
  }, [tab]);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
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

        {/* Filter chips */}
        <div className={styles.filterRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              variant={activeFilter === f.key ? 'dark' : 'surface'}
              onClick={() => setActiveFilter(activeFilter === f.key ? null : f.key)}
              style={{ cursor: 'pointer' }}
            >
              {f.label}
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
        ) : (
          quests.map((q) => (
            <QuestCard key={q.id} quest={q} onClick={() => navigate(`/quests/${q.id}`)} />
          ))
        )}
      </div>
    </div>
  );
}

function QuestCard({ quest, onClick }: { quest: Quest; onClick: () => void }) {
  const timeLeft = formatTimeLeft(quest.expiresAt);
  const timerStyle = getTimerStyle(quest.expiresAt);
  const tag = quest.tags[0];

  return (
    <button className={styles.card} onClick={onClick}>
      {/* Top shine */}
      <div className={styles.cardShine} />

      {/* Tag chip */}
      {tag && (
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
          <Chip variant="surface">Lv.{quest.minLevel} · {quest.district}</Chip>
        </div>
        <h3 className={styles.cardTitle}>{quest.title}</h3>
        <div className={styles.cardMeta}>
          {formatDistance(quest.minDistanceM)} · {'★'.repeat(quest.difficulty)}{'☆'.repeat(5 - quest.difficulty)}
        </div>
        <div className={styles.cardFooter}>
          <span className={styles.rewardItem}>
            <img
              src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f48e/512.gif"
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
