import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRideStore } from '@/store/useRideStore';
import { useUserStore } from '@/store/useUserStore';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { calculateRewards } from '@/lib/rewards';
import { fetchQuest } from '@/api/quests';
import { formatDistance, formatDuration } from '@/lib/format';
import { StatusBar } from '@/components/layout/StatusBar';
import styles from './RideActive.module.css';

export default function RideActive() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const ride = useRideStore();
  const user = useUserStore((s) => s.user);
  const addExp = useUserStore((s) => s.addExp);
  const addGold = useUserStore((s) => s.addGold);

  const [showPause, setShowPause] = useState(false);
  const [showGpsError, setShowGpsError] = useState(false);

  useEffect(() => {
    if (!ride.isActive) {
      navigate('/home', { replace: true });
    }
  }, [ride.isActive, navigate]);

  if (!ride.isActive || !user) return null;

  const progress = Math.min(ride.distanceM / ride.targetDistanceM, 1);
  const progressPercent = Math.round(progress * 100);

  const RADIUS = 120;
  const CIRC = 2 * Math.PI * RADIUS;
  const offset = CIRC * (1 - progress);

  const handlePauseClick = () => {
    ride.pauseRide();
    setShowPause(true);
  };

  const handleResume = () => {
    ride.resumeRide();
    setShowPause(false);
  };

  const handleAbandon = () => {
    ride.abandonRide();
    navigate('/home');
  };

  const handleComplete = async () => {
    const result = ride.completeRide();
    const quest = await fetchQuest(ride.questId!);

    if (result === 'success' && quest && user) {
      const rewards = calculateRewards({
        quest,
        user,
        finalSafety: ride.safetyGrade,
        isFirstClearToday: true,
      });
      addExp(rewards.expEarned, rewards.xpEarned);
      addGold(rewards.goldEarned);
      navigate('/ride/result/success', {
        state: {
          quest,
          distance: ride.distanceM,
          duration: ride.durationSec,
          safety: ride.safetyGrade,
          rewards,
        },
      });
    } else {
      navigate('/ride/result/fail', {
        state: {
          quest,
          distance: ride.distanceM,
          target: ride.targetDistanceM,
        },
      });
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.grid} />
      <div className={styles.glow} />

      {/* HUD top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 }}>
        <StatusBar variant="light" />
      </div>
      <div className={styles.hud} style={{ paddingTop: 40 }}>
        <button className={styles.glassBtn} onClick={handlePauseClick}>
          ❚❚
        </button>
        <div className={styles.questChip}>{ride.questTitle}</div>
        <div className={styles.gpsBars}>
          <span /><span /><span />
        </div>
      </div>

      {/* Main progress ring */}
      <div className={styles.ringWrap}>
        <svg className={styles.ring} viewBox="0 0 280 280">
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00F0FF" />
              <stop offset="100%" stopColor="#B6FF1C" />
            </linearGradient>
            <filter id="cyanGlow">
              <feGaussianBlur stdDeviation="4" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle
            cx="140" cy="140" r={RADIUS}
            fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12"
          />
          <circle
            cx="140" cy="140" r={RADIUS}
            fill="none" stroke="url(#ringGrad)" strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={offset}
            transform="rotate(-90 140 140)"
            filter="url(#cyanGlow)"
            style={{ transition: 'stroke-dashoffset .6s ease' }}
          />
        </svg>

        <div className={styles.ringContent}>
          <div className={styles.ringDist}>
            {(ride.distanceM / 1000).toFixed(1)}
          </div>
          <div className={styles.ringTarget}>
            / {(ride.targetDistanceM / 1000).toFixed(1)} km
          </div>
          <div className={styles.ringPercent}>{t('ride.percentComplete', { percent: progressPercent })}</div>
        </div>
      </div>

      {/* Metrics */}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>{t('ride.time').toUpperCase()}</div>
          <div className={styles.metricValue}>{formatDuration(ride.durationSec)}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>{t('ride.safety').toUpperCase()}</div>
          <div
            className={`${styles.safetyBadge} ${
              ride.safetyGrade === 'A' ? styles.safetyA :
              ride.safetyGrade === 'B' ? styles.safetyB :
              styles.safetyC
            }`}
          >
            {ride.safetyGrade}
          </div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>{t('ride.avgSpeed').toUpperCase()}</div>
          <div className={styles.metricValue}>
            {ride.avgSpeedKmh.toFixed(1)}
            <span className={styles.unit}> km/h</span>
          </div>
        </div>
      </div>

      <button className={styles.pauseBtn} onClick={handlePauseClick}>
        ❚❚ {t('ride.paused')}
      </button>

      {/* Test helpers — prototype only */}
      <div className={styles.testBar}>
        <button onClick={handleComplete} className={styles.testBtn}>
          ✓ Complete (test)
        </button>
      </div>

      <button
        className={styles.gpsTest}
        onClick={() => setShowGpsError(true)}
      >
        GPS error sim
      </button>

      <BottomSheet open={showPause} onClose={handleResume} height="half">
        <div className={styles.pauseContent}>
          <h2 className={styles.pauseTitle}>{t('ride.paused')}</h2>
          <div className={styles.pauseStats}>
            <div>
              <div className={styles.pauseStatLabel}>{t('ride.distance')}</div>
              <div className={styles.pauseStatNum}>{formatDistance(ride.distanceM)}</div>
            </div>
            <div>
              <div className={styles.pauseStatLabel}>{t('ride.time')}</div>
              <div className={styles.pauseStatNum}>{formatDuration(ride.durationSec)}</div>
            </div>
            <div>
              <div className={styles.pauseStatLabel}>{t('ride.safety')}</div>
              <div className={styles.pauseStatNum}>{ride.safetyGrade}</div>
            </div>
          </div>
          <p className={styles.pauseWarn}>{t('ride.pauseWarn')}</p>
          <Button onClick={handleResume}>{t('ride.resumeBtn')}</Button>
          <button className={styles.abandonBtn} onClick={handleAbandon}>
            {t('ride.quitBtn')}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={showGpsError} onClose={() => setShowGpsError(false)} height="half">
        <div className={styles.gpsContent}>
          <div className={styles.gpsIcon}>📡</div>
          <h2>{t('ride.gpsErrorTitle')}</h2>
          <p>{t('ride.gpsErrorSub')}</p>
          <Button onClick={() => setShowGpsError(false)}>{t('ride.retryBtn')}</Button>
          <button className={styles.abandonBtn} onClick={handleAbandon}>
            {t('ride.abandonBtn')}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
