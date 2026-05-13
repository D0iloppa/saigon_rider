import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { fetchQuest } from '@/api/quests';
import { useUserStore } from '@/store/useUserStore';
import { useRideStore } from '@/store/useRideStore';
import { expToNextLevel } from '@/lib/rewards';
import { formatDistance } from '@/lib/format';
import type { Quest } from '@/api/types';
import styles from './QuestDetail.module.css';

export default function QuestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const startRide = useRideStore((s) => s.startRide);

  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchQuest(id).then((q) => {
      setQuest(q);
      setLoading(false);
    });
  }, [id]);

  if (loading || !user) {
    return (
      <>
        <TopBar transparent />
        <div className={styles.loading}>로딩 중...</div>
      </>
    );
  }

  if (!quest) {
    return (
      <>
        <TopBar title="퀘스트" />
        <div className={styles.loading}>퀘스트를 찾을 수 없어요</div>
      </>
    );
  }

  const isLocked = user.level < quest.minLevel;

  const handleStart = () => {
    if (isLocked) return;
    startRide(quest);
    navigate('/ride/active');
  };

  return (
    <div className={styles.root}>
      <TopBar transparent showBack />

      <div
        className={styles.hero}
        style={{ backgroundImage: `url(${quest.thumbnailUrl})` }}
      >
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <div className={styles.heroTag}>TONIGHT'S QUEST</div>
          <h1 className={styles.heroTitle}>{quest.title}</h1>
        </div>
      </div>

      <div className={styles.sheet}>
        <div className={styles.metaRow}>
          <span className={styles.metaChip}>Lv.{quest.minLevel}+</span>
          <span className={styles.metaChip}>{quest.district}</span>
          <span className={styles.metaChip}>
            {'★'.repeat(quest.difficulty)}
            {'☆'.repeat(5 - quest.difficulty)}
          </span>
        </div>

        <p className={styles.desc}>{quest.description}</p>

        <div className={styles.conditionBox}>
          <h3 className={styles.boxTitle}>조건</h3>
          {quest.timeRestriction && (
            <div className={styles.conditionRow}>
              <span>⏰</span>
              <span>
                {quest.timeRestriction.from} – {quest.timeRestriction.to}
              </span>
            </div>
          )}
          <div className={styles.conditionRow}>
            <span>📍</span>
            <span>총 {formatDistance(quest.minDistanceM)}</span>
          </div>
          {quest.safetyGradeMin && (
            <div className={styles.conditionRow}>
              <span>🛡</span>
              <span>안전 등급 {quest.safetyGradeMin} 이상</span>
            </div>
          )}
        </div>

        <div className={styles.rewardBox}>
          <h3 className={styles.boxTitle}>보상</h3>
          <div className={styles.rewardGrid}>
            <div className={styles.rewardCell}>
              <span className={styles.rewardIcon}>💎</span>
              <div className={styles.rewardLabel}>EXP</div>
              <div className={styles.rewardNum}>+{quest.rewardExp}</div>
            </div>
            <div className={styles.rewardCell}>
              <span className={styles.rewardIcon}>✨</span>
              <div className={styles.rewardLabel}>XP</div>
              <div className={styles.rewardNum}>+{quest.rewardXpPoints}</div>
            </div>
            <div className={styles.rewardCell}>
              <span className={styles.rewardIcon}>🪙</span>
              <div className={styles.rewardLabel}>Gold</div>
              <div className={styles.rewardNum}>+{quest.rewardGold}</div>
            </div>
            <div className={styles.rewardCell}>
              <span className={styles.rewardIcon}>🎁</span>
              <div className={styles.rewardLabel}>Item</div>
              <div className={styles.rewardNum}>
                ×{quest.rewardItems.length}
              </div>
            </div>
          </div>
        </div>

        <Button onClick={handleStart} disabled={isLocked}>
          {isLocked ? `Lv.${quest.minLevel}부터 가능` : '퀘스트 시작 →'}
        </Button>
      </div>

      {/* Lock overlay */}
      {isLocked && <LockModal user={user} quest={quest} onClose={() => navigate(-1)} />}
    </div>
  );
}

function LockModal({
  user,
  quest,
  onClose,
}: {
  user: any;
  quest: Quest;
  onClose: () => void;
}) {
  const { progress } = expToNextLevel(user.levelExp, user.level);
  const navigate = useNavigate();

  return (
    <div className={styles.lockBackdrop}>
      <div className={styles.lockCard}>
        <div className={styles.lockIcon}>🔒</div>
        <h2>Lv.{quest.minLevel}부터 도전할 수 있어요</h2>
        <p>현재 Lv.{user.level} · 다음 레벨까지</p>
        <div className={styles.lockBar}>
          <div
            className={styles.lockBarFill}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <Button
          onClick={() => {
            onClose();
            setTimeout(() => navigate('/quests'), 50);
          }}
        >
          더 쉬운 퀘스트 보기
        </Button>
        <button className={styles.lockClose} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
