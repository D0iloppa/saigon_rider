import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { fetchQuest, fetchCompletedQuestIds, completeQuest } from '@/api/quests';
import { useUserStore } from '@/store/useUserStore';
import { useRideStore } from '@/store/useRideStore';
import { expToNextLevel } from '@/lib/rewards';
import { formatDistance, formatNumber } from '@/lib/format';
import { localizedName } from '@/api/master';
import type { Quest, QuestType } from '@/api/types';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { toast } from '@/components/ui/Toast';
import { emojiUrl } from '@/lib/emoji';
import styles from './QuestDetail.module.css';

export default function QuestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const passcode = useUserStore((s) => s.passcode);
  const addExp = useUserStore((s) => s.addExp);
  const addGold = useUserStore((s) => s.addGold);
  const startRide = useRideStore((s) => s.startRide);

  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [dbgDialog, setDbgDialog] = useState(false);
  const [dbgLoading, setDbgLoading] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    fetchQuest(id).then(async (q) => {
      setQuest(q);
      if (q) {
        const ids = await fetchCompletedQuestIds(user.id, q.questType as QuestType);
        setIsCompleted(ids.has(q.id));
      }
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
    if (isLocked || isCompleted) return;
    startRide(quest);
    navigate('/ride/active');
  };

  const handleDbgComplete = async () => {
    if (!user || !quest || !passcode) {
      toast.error('[DBG] 세션 정보가 없습니다. 재로그인 후 시도해주세요.');
      return;
    }
    setDbgLoading(true);
    try {
      const result = await completeQuest(quest.id, user.id, passcode);
      if (result.rewardExp > 0) addExp(result.rewardExp, 0);
      if (result.rewardGold > 0) addGold(result.rewardGold);
      setIsCompleted(true);
      toast.success(`[DBG] 완료 처리됨 — EXP +${result.rewardExp}, Gold +${result.rewardGold}`);
    } catch (err: any) {
      toast.error(`[DBG] 완료 실패: ${err.message ?? '알 수 없는 오류'}`);
    } finally {
      setDbgLoading(false);
      setDbgDialog(false);
    }
  };

  return (
    <div className={styles.root}>
      <TopBar transparent showBack />

      <div className={styles.hero}>
        <AppImage src={quest.thumbnailUrls} alt="" className={styles.heroImg} />
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <div className={styles.heroTag}>{t('quest.tonightsTag')}</div>
          <h1 className={styles.heroTitle}>{quest.title}</h1>
          {isCompleted && (
            <div className={styles.completedBadge}>✓ {t('quest.completedBadge')}</div>
          )}
        </div>
      </div>

      <div className={styles.sheet}>
        <div className={styles.metaRow}>
          <Chip variant="surface">Lv.{quest.minLevel}+</Chip>
          <Chip variant="surface">{quest.districtName || t('quest.everywhere')}</Chip>
          {quest.riderType && (
            <Chip variant="surface">
              {quest.riderType.icon ? `${quest.riderType.icon} ` : ''}{localizedName(quest.riderType)}
            </Chip>
          )}
          {quest.safetyGrade && (
            <Chip variant="surface">🛡 {quest.safetyGrade.code}+</Chip>
          )}
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
          {quest.safetyGrade && (
            <div className={styles.conditionRow}>
              <span>🛡</span>
              <span>{t('quest.safetyGradeMin', { grade: quest.safetyGrade.code })}</span>
            </div>
          )}
        </div>

        <div className={styles.rewardBox}>
          <h3 className={styles.boxTitle}>{t('quest.rewards')}</h3>
          <div className={styles.rewardGrid}>
            <div className={styles.rewardCell}>
              <img className={styles.rewardIcon} src={emojiUrl('2b50')} width={22} height={22} alt="EXP" />
              <div className={styles.rewardLabel}>EXP</div>
              <div className={styles.rewardNum}>+{formatNumber(quest.rewardExp)}</div>
            </div>
            <div className={styles.rewardCell}>
              <img className={styles.rewardIcon} src={emojiUrl('1f48e')} width={22} height={22} alt="XP" />
              <div className={styles.rewardLabel}>XP</div>
              <div className={styles.rewardNum}>+{formatNumber(quest.rewardXpPoints)}</div>
            </div>
            <div className={styles.rewardCell}>
              <img className={styles.rewardIcon} src={emojiUrl('1fa99')} width={22} height={22} alt="GOLD" />
              <div className={styles.rewardLabel}>GOLD</div>
              <div className={styles.rewardNum}>+{formatNumber(quest.rewardGold)}</div>
            </div>
            <div className={styles.rewardCell}>
              <img className={styles.rewardIcon} src={emojiUrl('1f381')} width={22} height={22} alt="ITEM" />
              <div className={styles.rewardLabel}>ITEM</div>
              <div className={styles.rewardNum}>
                ×{quest.rewardItems.length}
              </div>
            </div>
          </div>
        </div>

        <Button onClick={handleStart} disabled={isLocked || isCompleted}>
          {isLocked
            ? t('quest.lockedLevel', { level: quest.minLevel })
            : isCompleted
            ? t('quest.completedBtn')
            : t('quest.startBtn')}
        </Button>
      </div>

      {/* [DBG] 완료 버튼 */}
      {!isCompleted && (
        <button className={styles.dbgBtn} onClick={() => setDbgDialog(true)}>
          [DBG]
        </button>
      )}

      {/* [DBG] AlertDialog */}
      {dbgDialog && (
        <div className={styles.dialogBackdrop} onClick={() => setDbgDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogIcon}>🛠</div>
            <h3 className={styles.dialogTitle}>디버그 기능</h3>
            <p className={styles.dialogBody}>
              이 기능은 디버그용으로, 퀘스트 완료 처리를 합니다.
            </p>
            <div className={styles.dialogActions}>
              <Button variant="ghost" onClick={() => setDbgDialog(false)} disabled={dbgLoading}>
                취소
              </Button>
              <Button onClick={handleDbgComplete} disabled={dbgLoading}>
                {dbgLoading ? '처리 중...' : '완료 처리'}
              </Button>
            </div>
          </div>
        </div>
      )}

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
