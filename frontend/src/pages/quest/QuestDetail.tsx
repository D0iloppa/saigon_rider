import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import QuestCard from '@/components/quest/QuestCard';
import { fetchQuest, fetchCompletedQuestIds, acceptQuest, fetchMyAccepted, startRide as apiStartRide, dropAccepted } from '@/api/quests';
import { useUserStore } from '@/store/useUserStore';
import { useRideStore } from '@/store/useRideStore';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { useLocationStore } from '@/store/useLocationStore';
import ServiceGateNotice from '@/components/location/ServiceGateNotice';
import { expToNextLevel } from '@/lib/rewards';
import { formatDistance, formatNumber } from '@/lib/format';
import { localizedName } from '@/api/master';
import type { Quest, QuestType } from '@/api/types';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { toast } from '@/components/ui/Toast';
import { RewardIcon } from '@/components/ui/RewardIcon';
import { Clock, Lock, MapPin } from 'lucide-react';
import { emojiUrl } from '@/lib/emoji';
import styles from './QuestDetail.module.css';

export default function QuestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const startRide = useRideStore((s) => s.startRide);
  // 수행 시작 버튼 제어 — GPS 검증형 퀘스트는 권역 안 실측 좌표가 없으면 서버가 진행도를
  // 인정하지 않는다. 시작시킨 뒤 영원히 0% 로 두지 말고 **버튼 단계에서 막는다**(정책안 D-6,
  // 대표 지시 2026-08-13 11:44 '버튼을 제어해야지'). 여기서 새로 측위하지 않는다.
  const gpsAvailable = useServiceAvailability().available;
  // 위치 게이트가 판정할 재료를 만든다 — 이 화면은 LocationContextBar 를 쓰지 않아
  // 스토어 측위가 발화하지 않는다. 스토어가 세션당 1회로 묶으므로 다른 화면을 거쳐 왔으면
  // 재측위하지 않는다(코드리뷰 지적 2026-08-13: 딥링크·푸시로 콜드스타트 진입하면
  // coordsSource/gateReason 이 둘 다 null 이라 버튼이 영구 잠김이었다).
  const ensureLocation = useLocationStore((s) => s.ensureLocation);
  useEffect(() => { void ensureLocation(); }, [ensureLocation]);


  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [acceptedUserQuestId, setAcceptedUserQuestId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
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

  /** 이 퀘스트가 GPS 실측을 요구하는가 — 그 외 검증타입은 위치와 무관하므로 막지 않는다. */
  const needsGps = quest.cardType === 'DISTANCE' || quest.cardType === 'CHECKPOINT';
  const startBlocked = needsGps && !gpsAvailable;

  const handleStartRide = async () => {
    if (!acceptedUserQuestId || !user || actionLoading) return;
    // 서버에 고아 세션을 만들지 않는다 — apiStartRide 전에 막는다.
    if (startBlocked) return;
    setActionLoading(true);
    try {
      await apiStartRide(acceptedUserQuestId);
      // 지도/GPS 가 필요한 타입(DISTANCE/CHECKPOINT)만 ride-nav, 그 외 검증타입은 범용 QuestChecker 로.
      if (quest.cardType === 'DISTANCE' || quest.cardType === 'CHECKPOINT') {
        startRide(quest, acceptedUserQuestId);
        navigate('/ride-nav?type=quest');
      } else {
        navigate(`/quest-check/${acceptedUserQuestId}`, { state: { questTitle: quest.title } });
      }
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

  return (
    <div className={styles.root}>
      <TopBar transparent showBack />

      <div className={styles.hero}>
        <QuestCard
          missionCode={quest.missionCode}
          rarity={quest.rarity}
          csv={quest.csv}
          customImageUrl={quest.mainImageUrl}
          title={quest.title}
          level={quest.minLevel}
          completed={isCompleted}
          variant="detail"
        />
      </div>

      <div className={styles.sheet}>
        {/* 헤더(고정): 칩 정보 */}
        <div className={styles.sheetHeader}>
          <div className={styles.metaRow}>
            <Chip variant="surface">Lv.{quest.minLevel}+</Chip>
            <Chip variant="surface">{quest.districtName || t('quest.everywhere')}</Chip>
            {quest.riderType && (
              <Chip variant="surface">
                {quest.riderType.icon ? `${quest.riderType.icon} ` : ''}{localizedName(quest.riderType)}
              </Chip>
            )}
          </div>
        </div>

        {/* 본문(이 영역만 스크롤) */}
        <div className={styles.sheetBody}>
        <p className={styles.desc}>{quest.description}</p>

        <div className={styles.conditionBox}>
          <h3 className={styles.boxTitle}>{t('quest.conditions')}</h3>
          {quest.timeRestriction && (
            <div className={styles.conditionRow}>
              <Clock size={15} strokeWidth={2} className={styles.conditionIcon} aria-hidden />
              <span>
                {quest.timeRestriction.from} – {quest.timeRestriction.to}
              </span>
            </div>
          )}
          <div className={styles.conditionRow}>
            <MapPin size={15} strokeWidth={2} className={styles.conditionIcon} aria-hidden />
            <span>{t('quest.totalDistance', { distance: formatDistance(quest.minDistanceM) })}</span>
          </div>
        </div>

        <div className={styles.rewardBox}>
          <h3 className={styles.boxTitle}>{t('quest.rewards')}</h3>
          <div className={styles.rewardGrid}>
            <div className={styles.rewardCell}>
              <RewardIcon type="EXP" size={22} className={styles.rewardIcon} />
              <div className={styles.rewardLabel}>{t('currency.exp')}</div>
              <div className={styles.rewardNum}>+{formatNumber(quest.rewardExp)}</div>
            </div>
            <div className={styles.rewardCell}>
              <RewardIcon type="XP" size={22} className={styles.rewardIcon} />
              <div className={styles.rewardLabel}>{t('currency.xp')}</div>
              <div className={styles.rewardNum}>+{formatNumber(quest.rewardXpPoints)}</div>
            </div>
            <div className={styles.rewardCell}>
              <RewardIcon type="GOLD" size={22} className={styles.rewardIcon} />
              <div className={styles.rewardLabel}>{t('currency.gold')}</div>
              <div className={styles.rewardNum}>+{formatNumber(quest.rewardGold)}</div>
            </div>
            <div className={styles.rewardCell}>
              <RewardIcon type="ITEM" size={22} className={styles.rewardIcon} />
              <div className={styles.rewardLabel}>{t('currency.item')}</div>
              <div className={styles.rewardNum}>
                ×{quest.rewardItems.length}
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* 푸터(고정): 액션 버튼 */}
        <div className={styles.sheetFooter}>
        {needsGps && <ServiceGateNotice />}
        {isCompleted ? (
          <Button disabled>{t('quest.completedBtn')}</Button>
        ) : isLocked ? (
          <Button disabled>{t('quest.lockedLevel', { level: quest.minLevel })}</Button>
        ) : acceptedUserQuestId ? (
          <>
            <Button onClick={handleStartRide} disabled={actionLoading || startBlocked}>
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
      </div>

      {/* SGR-206: 수령 후 바로 시작 확인 */}
      {startConfirm && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogIcon}>
              <img src={emojiUrl('1f3cd')} width={44} height={44} alt="" />
            </div>
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
                disabled={actionLoading || startBlocked}
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
        <div className={styles.lockIcon}>
          <Lock size={28} strokeWidth={2} aria-hidden />
        </div>
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
