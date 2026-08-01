import { useTranslation } from 'react-i18next';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { ActiveCardState } from '@/api/quests';
import styles from './QuestChecker.module.css';

/**
 * 범용 퀘스트 검증 표출 컴포넌트.
 * 엔진 validator(card_type 별 검증전략)의 진행상태를 디자인 톤에 맞춰 보여준다.
 * 지도가 필요한 타입(DISTANCE/CHECKPOINT)은 RideNav 가 담당하고,
 * 이 컴포넌트는 비-지도 검증타입(COUNT_EVENT 등)의 진행도를 범용으로 렌더한다.
 */

// action_code → i18n 라벨 키. 미정의 코드는 코드 그대로 노출(폴백).
const ACTION_LABEL_KEY: Record<string, string> = {
  SHARE_SNS: 'questCheck.actionShareSns',
  COMMENT_POST: 'questCheck.actionComment',
  POST_CREATE: 'questCheck.actionPost',
  RIDE_KM: 'questCheck.actionRide',
  LIKE_RECEIVED: 'questCheck.actionLike',
  REFERRAL: 'questCheck.actionReferral',
  QUEST_COMPLETE: 'questCheck.actionQuestComplete',
  FUEL_RECEIPT: 'questCheck.actionFuel',
  MAINTENANCE_RECEIPT: 'questCheck.actionMaint',
  DAILY_INSPECTION: 'questCheck.actionInspection',
  CAR_WASH_RECEIPT: 'questCheck.actionCarWash',
  PART_REPLACE: 'questCheck.actionPartReplace',
  PHOTO_UPLOAD: 'questCheck.actionPhoto',
  REVIEW_PHOTO: 'questCheck.actionReview',
  DELIVERY_RECEIPT: 'questCheck.actionDelivery',
  MARKET_LISTING: 'questCheck.actionListing',
  MARKET_SUCCESS: 'questCheck.actionTrade',
  MARKET_BROWSE: 'questCheck.actionBrowse',
  MARKET_FAVORITE: 'questCheck.actionFavorite',
  MARKET_INQUIRY: 'questCheck.actionInquiry',
  PROFILE_UPDATE: 'questCheck.actionProfile',
};

interface ValidatorView {
  label: string;
  current: number;
  target: number | null;
  unit: string;
}

interface Props {
  card: ActiveCardState;
  questTitle?: string;
}

export function QuestChecker({ card, questTitle }: Props) {
  const { t } = useTranslation();
  const criteria = card.criteria || {};
  const progress = card.progress || {};

  let view: ValidatorView;
  switch (card.card_type) {
    case 'COUNT_EVENT': {
      const code = String(criteria.action_code ?? '');
      const key = ACTION_LABEL_KEY[code];
      view = {
        label: key ? t(key) : code,
        current: Number(progress.count ?? 0),
        target: criteria.target_count != null ? Number(criteria.target_count) : null,
        unit: t('questCheck.unitCount', '회'),
      };
      break;
    }
    case 'COUNT_DISTINCT': {
      const code = String(criteria.action_code ?? '');
      const key = ACTION_LABEL_KEY[code];
      const seen = Array.isArray(progress.seen) ? progress.seen.length : 0;
      view = {
        label: key ? t(key) : code,
        current: seen,
        target: criteria.target_count != null ? Number(criteria.target_count) : null,
        unit: t('questCheck.unitDistinct', '곳'),
      };
      break;
    }
    case 'DISTANCE':
      view = {
        label: t('questCheck.distance', '주행 거리'),
        current: Math.round((card.current_distance_m ?? 0) / 100) / 10,
        target: criteria.target_distance_m != null ? Number(criteria.target_distance_m) / 1000 : null,
        unit: 'km',
      };
      break;
    default:
      view = { label: card.card_type, current: card.status === 'COMPLETED' ? 1 : 0, target: 1, unit: '' };
  }

  const completed = card.status === 'COMPLETED';
  const pct =
    view.target && view.target > 0
      ? Math.min(100, (view.current / view.target) * 100)
      : completed
        ? 100
        : 0;

  return (
    <div className={styles.checker}>
      <div className={`${styles.statusDot} ${completed ? styles.dotDone : ''}`} />
      <div className={styles.cardTitle}>{questTitle || t('questCheck.title', '퀘스트 검증 중')}</div>

      <div className={styles.metric}>
        <span className={styles.metricLabel}>{view.label}</span>
        <span className={styles.metricValue}>
          {view.current}
          {view.target != null && <span className={styles.metricTarget}> / {view.target}</span>}
          {view.unit && <span className={styles.metricUnit}> {view.unit}</span>}
        </span>
      </div>

      <ProgressBar progress={pct} />

      <p className={styles.hint}>
        {completed
          ? t('questCheck.doneHint', '검증 완료! 보상이 지급되었습니다.')
          : t('questCheck.progressHint', '조건을 충족하면 자동으로 검증됩니다.')}
      </p>
    </div>
  );
}
