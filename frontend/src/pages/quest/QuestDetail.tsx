import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import QuestCard from '@/components/quest/QuestCard';
import { fetchQuest, fetchCompletedQuestIds, completeQuest, acceptQuest, fetchMyAccepted, startRide as apiStartRide, dropAccepted } from '@/api/quests';
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
  const [acceptedUserQuestId, setAcceptedUserQuestId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dbgDialog, setDbgDialog] = useState(false);
  const [dbgLoading, setDbgLoading] = useState(false);
  const [startConfirm, setStartConfirm] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    fetchQuest(id).then(async (q) => {
      setQuest(q);
      if (q) {
        const [completedIds, accepted] = await Promise.all([
          fetchCompletedQuestIds(user.id, q.questType as QuestType),
          fetchMyAccepted(user.id),
        ]);
        setIsCompleted(completedIds.has(q.id));
        const mine = accepted.find((a) => a.quest.id === q.id);
        setAcceptedUserQuestId(mine?.userQuestId ?? null);
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

  const handleAccept = async () => {
    if (isLocked || isCompleted || !user || actionLoading) return;
    setActionLoading(true);
    try {
      const { userQuestId } = await acceptQuest(quest.id, user.id);
      setAcceptedUserQuestId(userQuestId);
      // SGR-206: 수령 직후 바로 시작 여부 확인
      setStartConfirm(true);
    } catch (err: any) {
      // "HTTP 409 | …" 접두사를 떼고 서버 메시지만 노출 (예: 일일 퀘스트 슬롯이 가득 찼습니다.)
      const detail = (err?.message ?? '').replace(/^HTTP \d+ \| /, '');
      toast.error(detail || t('quest.acceptFailed', { defaultValue: '퀘스트 수령 실패' }));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartRide = async () => {
    if (!acceptedUserQuestId || !user || actionLoading) return;
    setActionLoading(true);
    try {
      await apiStartRide(acceptedUserQuestId);
      startRide(quest, acceptedUserQuestId);
      navigate('/ride/active');
    } catch (err: any) {
      toast.error(err?.message ?? t('quest.startRideFailed', { defaultValue: '수행 시작 실패' }));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDrop = async () => {
    if (!acceptedUserQuestId || actionLoading) return;
    setActionLoading(true);
    try {
      await dropAccepted(acceptedUserQuestId);
      setAcceptedUserQuestId(null);
      toast.success(t('quest.dropToast', { defaultValue: '수령 취소됨' }));
    } catch (err: any) {
      toast.error(err?.message ?? t('quest.dropFailed', { defaultValue: '수령 포기 실패' }));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDbgComplete = async () => {
    if (!user || !quest || !passcode) {
      toast.error(t('quest.dbg_no_session'));
      return;
    }
    setDbgLoading(true);
    try {
      const result = await completeQuest(quest.id, user.id, passcode);
      if (result.rewardExp > 0) addExp(result.rewardExp, 0);
      if (result.rewardGold > 0) addGold(result.rewardGold);
      setIsCompleted(true);
      toast.success(`[DBG] Done — EXP +${result.rewardExp}, Gold +${result.rewardGold}`);
    } catch (err: any) {
      toast.error(`[DBG] Failed: ${err.message ?? 'Unknown error'}`);
    } finally {
      setDbgLoading(false);
      setDbgDialog(false);
    }
  };

  return (
    <div className={styles.root}>
      <TopBar transparent showBack />

      <div className={styles.hero}>
        <QuestCard
          missionCode={quest.missionCode}
          rarity={quest.rarity}
          title={quest.title}
          level={quest.minLevel}
          badges={isCompleted ? [`✓ ${t('quest.completedBadge')}`] : []}
          variant="detail"
        />
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
              <img className={styles.rewardIcon} src={emojiUrl('1f48e')} width={22} height={22} alt="RP" />
              <div className={styles.rewardLabel}>{t('currency.xp')}</div>
              <div className={styles.rewardNum}>+{formatNumber(quest.rewardXpPoints)}</div>
            </div>
            <div className={styles.rewardCell}>
              <img className={styles.rewardIcon} src={emojiUrl('1fa99')} width={22} height={22} alt={t('currency.gold')} />
              <div className={styles.rewardLabel}>{t('currency.gold')}</div>
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

        {isCompleted ? (
          <Button disabled>{t('quest.completedBtn')}</Button>
        ) : isLocked ? (
          <Button disabled>{t('quest.lockedLevel', { level: quest.minLevel })}</Button>
        ) : acceptedUserQuestId ? (
          <>
            <Button onClick={handleStartRide} disabled={actionLoading}>
              {t('quest.startRideBtn', { defaultValue: '수행 시작' })}
            </Button>
            <button
              onClick={handleDrop}
              disabled={actionLoading}
              style={{
                width: '100%', marginTop: 8, padding: '12px',
                background: 'transparent', color: 'var(--text-3)',
                fontSize: 13, border: 'none',
              }}
            >
              {t('quest.dropBtn', { defaultValue: '수령 포기' })}
            </button>
          </>
        ) : (
          <Button onClick={handleAccept} disabled={actionLoading}>
            {t('quest.acceptBtn', { defaultValue: '수령하기' })}
          </Button>
        )}
      </div>

      {/* [DBG] 완료 버튼 */}
      {/* {!isCompleted && (
        <button className={styles.dbgBtn} onClick={() => setDbgDialog(true)}>
          [DBG]
        </button>
      )} */}

      {/* [DBG] AlertDialog */}
      {dbgDialog && (
        <div className={styles.dialogBackdrop} onClick={() => setDbgDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogIcon}>🛠</div>
            <h3 className={styles.dialogTitle}>{t('quest.dbg_title')}</h3>
            <p className={styles.dialogBody}>
              {t('quest.dbg_body')}
            </p>
            <div className={styles.dialogActions}>
              <Button variant="ghost" onClick={() => setDbgDialog(false)} disabled={dbgLoading}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleDbgComplete} disabled={dbgLoading}>
                {dbgLoading ? t('quest.dbg_processing') : t('quest.dbg_confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SGR-206: 수령 후 바로 시작 확인 */}
      {startConfirm && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogIcon}>🏍</div>
            <h3 className={styles.dialogTitle}>
              {t('quest.startConfirmTitle', { defaultValue: '해당 퀘스트를 바로 시작하겠습니까?' })}
            </h3>
            <div className={styles.dialogActions}>
              <Button
                variant="ghost"
                disabled={actionLoading}
                onClick={() => {
                  setStartConfirm(false);
                  toast.success(t('quest.acceptedToast', { defaultValue: '수령했어요. 내 퀘스트 탭에서 확인할 수 있습니다.' }));
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                disabled={actionLoading}
                onClick={() => {
                  setStartConfirm(false);
                  handleStartRide();
                }}
              >
                {t('quest.startRideBtn', { defaultValue: '수행 시작' })}
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
