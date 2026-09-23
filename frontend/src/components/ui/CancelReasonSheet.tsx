import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCancelReasonStore } from '@/store/useCancelReasonStore';
import type { AppointmentCancelReason } from '@/api/types';
import { resolveText } from './dialogTypes';
import styles from './CancelReasonSheet.module.css';

const REASONS: AppointmentCancelReason[] = ['SCHEDULE_CHANGED', 'TRADED_ELSEWHERE', 'UNREACHABLE'];
const REASON_KEY: Record<AppointmentCancelReason, string> = {
  SCHEDULE_CHANGED: 'dm.cancelReasonScheduleChanged',
  TRADED_ELSEWHERE: 'dm.cancelReasonTradedElsewhere',
  UNREACHABLE: 'dm.cancelReasonUnreachable',
};

/** F-X-01 FR-1(260924 승인안): 취소 사유 칩 3개(선택 필수 1) — DM 약속 카드·거래 화면 공통. */
export function CancelReasonSheet() {
  const { t } = useTranslation();
  const { isOpen, title, onSelect, close } = useCancelReasonStore();

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const pick = (reason: AppointmentCancelReason) => {
    const handler = onSelect;
    close();
    handler(reason);
  };

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <p className={styles.title}>{resolveText(title, t)}</p>
        <div className={styles.chips}>
          {REASONS.map((reason) => (
            <button key={reason} type="button" className={styles.chip} onClick={() => pick(reason)}>
              {t(REASON_KEY[reason])}
            </button>
          ))}
        </div>
        <button type="button" className={styles.cancel} onClick={close}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
