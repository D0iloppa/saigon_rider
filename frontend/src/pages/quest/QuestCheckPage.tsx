import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { QuestChecker } from '@/components/quest/QuestChecker';
import { fetchActiveCard, type ActiveCardState } from '@/api/quests';
import styles from './QuestCheckPage.module.css';

const POLL_MS = 3000;

/** COUNT_EVENT 등 비-지도 검증타입의 진행도를 폴링하며 QuestChecker 로 표출. */
export default function QuestCheckPage() {
  const { userQuestId } = useParams<{ userQuestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const questTitle = (location.state as { questTitle?: string } | null)?.questTitle;

  const [card, setCard] = useState<ActiveCardState | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userQuestId) return;
    let cancelled = false;

    const tick = async () => {
      const c = await fetchActiveCard(userQuestId);
      if (cancelled || !c) return;
      setCard(c);
      if (c.status !== 'ACTIVE' && timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    tick();
    timerRef.current = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current != null) window.clearInterval(timerRef.current);
    };
  }, [userQuestId]);

  const completed = card?.status === 'COMPLETED';

  return (
    <div className={styles.page}>
      <TopBar title={t('questCheck.title', '퀘스트 검증 중')} />
      <div className={styles.body}>
        {card ? (
          <QuestChecker card={card} questTitle={questTitle} />
        ) : (
          <div className={styles.loading}>{t('common.loading')}</div>
        )}
      </div>
      <div className={styles.footer}>
        <Button variant={completed ? 'primary' : 'secondary'} onClick={() => navigate('/quests')}>
          {completed
            ? t('questCheck.backDone', '완료 — 목록으로')
            : t('questCheck.backLater', '나중에 확인')}
        </Button>
      </div>
    </div>
  );
}
