import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { QuestChecker } from '@/components/quest/QuestChecker';
import { fetchActiveCard, type ActiveCardState } from '@/api/quests';
import { registerPollTask } from '@/lib/pollScheduler';
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
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!userQuestId) return;
    let cancelled = false;

    const tick = async () => {
      const c = await fetchActiveCard(userQuestId);
      if (cancelled || !c) return;
      setCard(c);
      if (c.status !== 'ACTIVE') {
        stopRef.current?.(); // 카드가 끝나면 더 조회할 것이 없다
        stopRef.current = null;
      }
    };

    tick();
    // 화면이 꺼진 동안은 스케줄러가 스킵한다 — 종전엔 가드가 없어 백그라운드에서도 3초마다 돌았다.
    stopRef.current = registerPollTask({
      id: `quest-active-card:${userQuestId}`,
      intervalMs: POLL_MS,
      run: tick,
      runImmediately: false,
    });
    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
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
