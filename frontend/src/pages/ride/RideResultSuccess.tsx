import { useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { formatDurationShort } from '@/lib/format';
import type { Quest, SafetyGrade } from '@/api/types';
import type { RewardResult } from '@/lib/rewards';
import styles from './RideResult.module.css';

interface State {
  quest: Quest;
  distance: number;
  duration: number;
  safety: SafetyGrade;
  rewards: RewardResult;
}

export default function RideResultSuccess() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { t } = useTranslation();
  const data = state as State | undefined;

  useEffect(() => {
    if (!data) navigate('/home', { replace: true });
  }, [data, navigate]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        top: Math.random() * 45,
        rot: Math.random() * 360,
        color: [
          'var(--neon-cyan)',
          'var(--neon-lime)',
          'var(--neon-amber)',
          'var(--neon-pink)',
          'white',
        ][i % 5],
        shape: i % 3,
        size: 6 + Math.random() * 6,
        delay: Math.random() * 0.6,
      })),
    []
  );

  if (!data) return null;
  const avgSpeed = data.duration > 0 ? ((data.distance / data.duration) * 3.6).toFixed(0) : '0';

  return (
    <div className={styles.successRoot}>
      <div className={styles.bg} />
      <div className={styles.noise} />

      {/* Confetti */}
      <div className={styles.confettiLayer}>
        {confetti.map((c, i) => (
          <span
            key={i}
            className={`${styles.confetti} ${
              c.shape === 0 ? styles.confettiBar : c.shape === 1 ? styles.confettiDot : styles.confettiStar
            }`}
            style={{
              left: `${c.left}%`,
              top: `${c.top}%`,
              transform: `rotate(${c.rot}deg)`,
              background: c.color,
              width: c.shape === 1 ? c.size : c.size * 0.4,
              height: c.shape === 1 ? c.size : c.size * 1.6,
              animationDelay: `${c.delay}s`,
            }}
          />
        ))}
      </div>

      <div className={styles.successHero}>
        <div className={styles.trophyGlow} />
        <div className={styles.trophy}>🏆</div>
        <span className={styles.satellite} style={{ top: '8%', left: '20%' }}>⭐</span>
        <span className={styles.satellite} style={{ top: '12%', right: '18%' }}>✨</span>
        <span className={styles.satellite} style={{ bottom: '18%', left: '15%', fontSize: '32px' }}>🎉</span>
        <span className={styles.satellite} style={{ bottom: '14%', right: '14%' }}>⭐</span>
        <div className={styles.cleared}>{t('ride.questCleared')}</div>
      </div>

      <div className={styles.successSheet}>
        <h1 className={styles.questTitle}>{data.quest.title}</h1>
        <p className={styles.epigraph}>{t('ride.successEpigraph')}</p>

        {/* Bento stats */}
        <div className={styles.statsBento}>
          <div className={`${styles.statCell} ${styles.statCellWide}`}>
            <div className={styles.statLabel}>{t('ride.distance').toUpperCase()}</div>
            <div className={styles.statValue}>
              {(data.distance / 1000).toFixed(1)}
              <span> km</span>
            </div>
          </div>
          <div className={styles.statCell}>
            <div className={styles.statLabel}>{t('ride.time').toUpperCase()}</div>
            <div className={styles.statValue}>{formatDurationShort(data.duration)}</div>
          </div>
          <div className={styles.statCell}>
            <div className={styles.statLabel}>{t('ride.safety').toUpperCase()}</div>
            <div className={`${styles.safetyBadge} ${
              data.safety === 'A' ? styles.safetyA :
              data.safety === 'B' ? styles.safetyB :
              styles.safetyC
            }`}>
              {data.safety}
            </div>
          </div>
          <div className={styles.statCell}>
            <div className={styles.statLabel}>{t('ride.avgSpeed').toUpperCase()}</div>
            <div className={styles.statValue}>{avgSpeed}<span> km/h</span></div>
          </div>
        </div>

        {/* Rewards */}
        <div className={styles.rewards}>
          <div className={styles.rewardRow} style={{ borderColor: 'var(--exp)' }}>
            <span className={styles.rewardIcon}>⭐</span>
            <div className={styles.rewardLabel}>EXP</div>
            <div className={styles.rewardNum} style={{ color: 'var(--exp)' }}>
              +{data.rewards.expEarned}
            </div>
          </div>
          <div className={styles.rewardRow} style={{ borderColor: 'var(--xp)' }}>
            <span className={styles.rewardIcon}>✨</span>
            <div className={styles.rewardLabel}>{t('ride.xpPointsLabel')}</div>
            <div className={styles.rewardNum} style={{ color: 'var(--xp)' }}>
              +{data.rewards.xpEarned}
            </div>
          </div>
          <div className={styles.rewardRow} style={{ borderColor: 'var(--gold)' }}>
            <span className={styles.rewardIcon}>🪙</span>
            <div className={styles.rewardLabel}>GOLD</div>
            <div className={styles.rewardNum} style={{ color: 'var(--gold)' }}>
              +{data.rewards.goldEarned}
            </div>
          </div>
          {data.rewards.itemsEarned.map((item) => (
            <div key={item.key} className={`${styles.rewardRow} ${styles.itemRow}`}>
              <span className={styles.rewardIcon}>🎁</span>
              <div className={styles.rewardLabel}>
                {t('ride.itemEarned', { name: item.name })}
              </div>
            </div>
          ))}
        </div>

        {(data.rewards.multipliers.firstClearBonus > 0 ||
          data.rewards.multipliers.safetyBonus > 0) && (
          <div className={styles.bonusBanner}>
            🔥{' '}
            {data.rewards.multipliers.firstClearBonus > 0 && t('ride.firstClearBonus')}
            {data.rewards.multipliers.firstClearBonus > 0 &&
              data.rewards.multipliers.safetyBonus > 0 &&
              ' · '}
            {data.rewards.multipliers.safetyBonus > 0 && t('ride.safetyBonusA')}
          </div>
        )}

        <div className={styles.actions}>
          <Button onClick={() => navigate('/feed')}>{t('ride.shareToFeedBtn')}</Button>
          <Button variant="ghost" onClick={() => navigate('/quests')}>
            {t('ride.nextQuestBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
