import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
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
  const { t } = useTranslation();
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
        <div className={styles.cleared} style={{ color: 'var(--text-3)' }}>{t('ride.questFailed')}</div>
      </div>

      <div className={styles.successSheet}>
        <h1 className={styles.questTitle}>{data.quest.title}</h1>
        <p className={styles.epigraph}>{t('ride.failEpigraph')}</p>

        <div className={styles.reasonBox}>
          <div className={styles.statLabel}>{t('ride.failReasonLabel')}</div>
          <div className={styles.reasonText}>
            {t('ride.failReason', {
              distance: (data.distance / 1000).toFixed(1),
              target: (data.target / 1000).toFixed(1),
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            <ProgressBar progress={progress * 100} />
          </div>
        </div>

        <div className={styles.consolation}>
          <span style={{ fontSize: '28px' }}>⭐</span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{t('ride.consolationTitle')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {t('ride.consolationSub')}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <Button onClick={() => navigate(`/quests/${data.quest.id}`)}>
            {t('ride.retryQuestBtn')}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/quests')}>
            {t('ride.otherQuestBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
