import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { fetchQuests } from '@/api/quests';
import { formatDistance, formatTimeLeft } from '@/lib/format';
import type { Quest, QuestType } from '@/api/types';
import styles from './QuestList.module.css';

const TABS: { key: QuestType; label: string }[] = [
  { key: 'daily', label: '오늘' },
  { key: 'weekly', label: '주간' },
  { key: 'event', label: '이벤트' },
];

const FILTERS = ['🌆 Quận 1', '💼 출퇴근', '🌙 야간', '🛡 안전 A'];

export default function QuestList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<QuestType>('daily');
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchQuests({ type: tab }).then((list) => {
      setQuests(list);
      setLoading(false);
    });
  }, [tab]);

  return (
    <>
      <TopBar
        title="퀘스트"
        showBack={false}
        rightContent={<button className={styles.searchBtn}>🔍</button>}
      />

      <div className={styles.body}>
        <div className={styles.tabRow}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.filterRow}>
          {FILTERS.map((f) => (
            <button key={f} className={styles.filterChip}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className={styles.loading}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        ) : quests.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🧭</div>
            <h2>조건에 맞는 퀘스트가 없어요</h2>
            <p>필터를 바꾸거나 잠시 후 다시 확인해주세요</p>
          </div>
        ) : (
          <div className={styles.list}>
            {quests.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                onClick={() => navigate(`/quests/${q.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function QuestCard({ quest, onClick }: { quest: Quest; onClick: () => void }) {
  return (
    <button className={styles.card} onClick={onClick}>
      <img src={quest.thumbnailUrl} alt="" className={styles.thumb} />
      <div className={styles.cardBody}>
        <div className={styles.metaRow}>
          <span className={styles.metaChip}>Lv.{quest.minLevel}</span>
          <span className={styles.metaChip}>{quest.district}</span>
        </div>
        <h3 className={styles.cardTitle}>{quest.title}</h3>
        <div className={styles.cardMeta}>
          {formatDistance(quest.minDistanceM)} · {'★'.repeat(quest.difficulty)}
          {'☆'.repeat(5 - quest.difficulty)}
        </div>
        <div className={styles.cardFooter}>
          <span className={styles.reward}>💎 +{quest.rewardExp}</span>
          {formatTimeLeft(quest.expiresAt) && (
            <span className={styles.timer}>⏱ {formatTimeLeft(quest.expiresAt)}</span>
          )}
        </div>
      </div>
      {quest.tags.length > 0 && (
        <span
          className={`${styles.tag} ${
            quest.tags[0] === 'HOT'
              ? styles.tagHot
              : quest.tags[0] === 'NEW'
              ? styles.tagNew
              : styles.tagLimited
          }`}
        >
          {quest.tags[0]}
        </span>
      )}
    </button>
  );
}
