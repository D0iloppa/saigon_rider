import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRideStore } from '@/store/useRideStore';
import { useUserStore } from '@/store/useUserStore';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { calculateRewards } from '@/lib/rewards';
import { fetchQuest } from '@/api/quests';
import { formatDistance, formatDuration } from '@/lib/format';
import styles from './RideActive.module.css';

export default function RideActive() {
  const navigate = useNavigate();
  const ride = useRideStore();
  const user = useUserStore((s) => s.user);
  const addExp = useUserStore((s) => s.addExp);
  const addGold = useUserStore((s) => s.addGold);

  const [showPause, setShowPause] = useState(false);
  const [showGpsError, setShowGpsError] = useState(false);

  // 라이딩이 활성화 안 됐으면 홈으로
  useEffect(() => {
    if (!ride.isActive) {
      navigate('/home', { replace: true });
    }
  }, [ride.isActive, navigate]);

  if (!ride.isActive || !user) return null;

  const progress = Math.min(ride.distanceM / ride.targetDistanceM, 1);
  const progressPercent = Math.round(progress * 100);

  // SVG arc 계산
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
      <div className={styles.hud}>
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
          {/* track */}
          <circle
            cx="140"
            cy="140"
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,.08)"
            strokeWidth="12"
          />
          {/* progress */}
          <circle
            cx="140"
            cy="140"
            r={RADIUS}
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
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
          <div className={styles.ringPercent}>{progressPercent}% COMPLETE</div>
        </div>
      </div>

      {/* Metrics */}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>TIME</div>
          <div className={styles.metricValue}>
            {formatDuration(ride.durationSec)}
          </div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>SAFETY</div>
          <div
            className={`${styles.safetyBadge} ${
              ride.safetyGrade === 'A'
                ? styles.safetyA
                : ride.safetyGrade === 'B'
                ? styles.safetyB
                : styles.safetyC
            }`}
          >
            {ride.safetyGrade}
          </div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>AVG SPEED</div>
          <div className={styles.metricValue}>
            {ride.avgSpeedKmh.toFixed(1)}
            <span className={styles.unit}> km/h</span>
          </div>
        </div>
      </div>

      <button className={styles.pauseBtn} onClick={handlePauseClick}>
        ❚❚ PAUSE
      </button>

      {/* Test helpers — 프로토타입용 */}
      <div className={styles.testBar}>
        <button onClick={handleComplete} className={styles.testBtn}>
          ✓ 완료 처리 (테스트)
        </button>
      </div>

      <button
        className={styles.gpsTest}
        onClick={() => setShowGpsError(true)}
      >
        GPS 오류 시뮬레이션
      </button>

      <BottomSheet open={showPause} onClose={handleResume} height="half">
        <div className={styles.pauseContent}>
          <h2 className={styles.pauseTitle}>PAUSED</h2>
          <div className={styles.pauseStats}>
            <div>
              <div className={styles.pauseStatLabel}>거리</div>
              <div className={styles.pauseStatNum}>{formatDistance(ride.distanceM)}</div>
            </div>
            <div>
              <div className={styles.pauseStatLabel}>시간</div>
              <div className={styles.pauseStatNum}>
                {formatDuration(ride.durationSec)}
              </div>
            </div>
            <div>
              <div className={styles.pauseStatLabel}>안전</div>
              <div className={styles.pauseStatNum}>{ride.safetyGrade}</div>
            </div>
          </div>
          <p className={styles.pauseWarn}>지금 멈추면 시도 무효 처리됩니다.</p>
          <Button onClick={handleResume}>계속 진행</Button>
          <button className={styles.abandonBtn} onClick={handleAbandon}>
            퀘스트 종료
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={showGpsError} onClose={() => setShowGpsError(false)} height="half">
        <div className={styles.gpsContent}>
          <div className={styles.gpsIcon}>📡</div>
          <h2>GPS 신호가 약해요</h2>
          <p>야외로 이동하거나 위치 권한을 확인해주세요</p>
          <Button onClick={() => setShowGpsError(false)}>다시 시도</Button>
          <button className={styles.abandonBtn} onClick={handleAbandon}>
            라이딩 포기
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
