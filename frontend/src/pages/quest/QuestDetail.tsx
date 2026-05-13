import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { fetchQuest } from '@/api/quests';
import { useUserStore } from '@/store/useUserStore';
import { useRideStore } from '@/store/useRideStore';
import { expToNextLevel } from '@/lib/rewards';
import { formatDistance } from '@/lib/format';
import type { Quest } from '@/api/types';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import styles from './QuestDetail.module.css';

export default function QuestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
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
        <div className={styles.loading}>{t('common.loading')}</div>
      </>
    );
  }

  if (!quest) {
    return (
      <>
        <TopBar title={t('quest.title')} />
        <div className={styles.loading}>{t('quest.notFound')}</div>
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
          <div className={styles.heroTag}>{t('quest.tonightsTag')}</div>
          <h1 className={styles.heroTitle}>{quest.title}</h1>
        </div>
      </div>

      <div className={styles.sheet}>
        <div className={styles.metaRow}>
          <Chip variant="surface">Lv.{quest.minLevel}+</Chip>
          <Chip variant="surface">{quest.district}</Chip>
          <Chip variant="surface">
            {'★'.repeat(quest.difficulty)}
            {'☆'.repeat(5 - quest.difficulty)}
          </Chip>
        </div>

        <p className={styles.desc}>{quest.description}</p>

        <div className={styles.conditionBox}>
          <h3 className={styles.boxTitle}>{t('quest.conditions')}</h3>
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
            <span>{t('quest.totalDistance', { distance: formatDistance(quest.minDistanceM) })}</span>
          </div>
          {quest.safetyGradeMin && (
            <div className={styles.conditionRow}>
              <span>🛡</span>
              <span>{t('quest.safetyGradeMin', { grade: quest.safetyGradeMin })}</span>
            </div>
          )}
        </div>

        <div className={styles.rewardBox}>
          <h3 className={styles.boxTitle}>{t('quest.rewards')}</h3>
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
          {isLocked
            ? t('quest.lockedLevel', { level: quest.minLevel })
            : t('quest.startBtn')}
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
  const { t } = useTranslation();

  return (
    <div className={styles.lockBackdrop}>
      <div className={styles.lockCard}>
        <div className={styles.lockIcon}>🔒</div>
        <h2>{t('quest.lockTitle', { level: quest.minLevel })}</h2>
        <p>{t('quest.lockSub', { level: quest.minLevel, currentLevel: user.level })}</p>
        <div style={{ margin: '16px 0 24px' }}>
          <ProgressBar progress={progress * 100} />
        </div>
        <Button
          onClick={() => {
            onClose();
            setTimeout(() => navigate('/quests'), 50);
          }}
        >
          {t('quest.lockEasierBtn')}
        </Button>
        <button className={styles.lockClose} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
