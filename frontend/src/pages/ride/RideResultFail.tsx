import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import type { Quest } from '@/api/types';
import styles from './RideResult.module.css';

interface State {
  quest: Quest;
  distance: number;
  target: number;
}

export default function RideResultFail() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const data = state as State | undefined;

  useEffect(() => {
    if (!data) navigate('/home', { replace: true });
  }, [data, navigate]);

  if (!data) return null;
  const progress = Math.min(data.distance / data.target, 1);

  return (
    <div className={styles.failRoot}>
      <div className={styles.failBg} />

      <div className={styles.failHero}>
        <div className={styles.bikeTilted}>🏍</div>
        <div className={styles.cleared} style={{ color: 'var(--text-3)' }}>QUEST FAILED</div>
      </div>

      <div className={styles.successSheet}>
        <h1 className={styles.questTitle}>{data.quest.title}</h1>
        <p className={styles.epigraph}>"조금만 더 달려보면 어땠을까요?"</p>

        <div className={styles.reasonBox}>
          <div className={styles.statLabel}>REASON</div>
          <div className={styles.reasonText}>
            거리 미달 — {(data.distance / 1000).toFixed(1)} / {(data.target / 1000).toFixed(1)} km
          </div>
          <div className={styles.failBar}>
            <div className={styles.failBarFill} style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <div className={styles.consolation}>
          <span style={{ fontSize: '28px' }}>💎</span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>기본 +20 EXP 지급</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              포기하지 않고 다시 도전해보세요
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <Button onClick={() => navigate(`/quests/${data.quest.id}`)}>
            다시 도전
          </Button>
          <Button variant="ghost" onClick={() => navigate('/quests')}>
            다른 퀘스트
          </Button>
        </div>
      </div>
    </div>
  );
}
