import { MapPin, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { Appointment } from '@/api/types';
import ApptPlaceThumb from './ApptPlaceThumb';
import styles from './AppointmentSheet.module.css';

/** 길안내 버튼 표시 상태 — DmDetail 이 카드와 시트에 같은 값을 넘긴다. */
export interface AppointmentNavView {
  show: boolean;
  canRetry: boolean;
  /** 길안내를 못 쓰는 사유 안내문(없으면 null). */
  reason: string | null;
  /** 서비스 지역 밖 등 — 탭은 받되 동작하지 않는 잠금. */
  locked: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 방의 최신 활성(PROPOSED/ACCEPTED) 약속 — 없으면 아무것도 그리지 않는다. */
  appointment: Appointment | null;
  myId?: string;
  counterpartName: string;
  busy: boolean;
  cancelLabel: string;
  nav: AppointmentNavView;
  onAccept: () => void;
  onCancel: () => void;
  onNavigate: () => void;
  onRetryNav: () => void;
  onShareLocation: () => void;
  onWalkie: () => void;
  /** 카드 메시지가 로드돼 있을 때만 넘긴다 — 없으면 [대화에서 보기]를 숨긴다. */
  onViewInChat?: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** F-DM-02 FR-8 약속 시트 — 순수 뷰. 행동 핸들러는 약속 카드와 같은 것을 DmDetail 이 내려준다. */
export function AppointmentSheet({
  open, onClose, appointment, myId, counterpartName, busy, cancelLabel, nav,
  onAccept, onCancel, onNavigate, onRetryNav, onShareLocation, onWalkie, onViewInChat,
}: Props) {
  const { t } = useTranslation();
  if (!appointment) return null;
  const { status } = appointment;
  const canAccept = status === 'PROPOSED' && appointment.proposerId !== myId;
  const when = new Date(appointment.whenAt);
  const dateText = `${when.getFullYear()}.${pad2(when.getMonth() + 1)}.${pad2(when.getDate())}`;
  const timeText = `${pad2(when.getHours())}:${pad2(when.getMinutes())}`;
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t('dm.appointment', { defaultValue: '약속' })}</h2>
          <span className={styles.pill} data-status={status}>
            {status === 'ACCEPTED'
              ? t('dm.apptAccepted', { defaultValue: '확정' })
              : t('dm.apptProposed', { defaultValue: '제안됨' })}
          </span>
        </div>
        <div className={styles.info}>
          <span className={styles.label}>{t('dm.apptDate', { defaultValue: '날짜' })}</span>
          <span className={styles.val}>{dateText}</span>
          <span className={styles.label}>{t('dm.apptTime', { defaultValue: '시간' })}</span>
          <span className={styles.val}>{timeText}</span>
          {appointment.placeName && (
            <>
              <span className={styles.label}>{t('dm.apptPlace', { defaultValue: '장소' })}</span>
              <span className={styles.val}>{appointment.placeName}</span>
            </>
          )}
          <span className={styles.label}>{t('dm.apptSheetWith')}</span>
          <span className={styles.val}>{counterpartName}</span>
        </div>
        {appointment.placeLat != null && appointment.placeLng != null && (
          <ApptPlaceThumb lat={appointment.placeLat} lng={appointment.placeLng} />
        )}
        {status === 'ACCEPTED' && (
          <div className={styles.row}>
            <button className={styles.ghost} type="button" onClick={onShareLocation}>
              <MapPin size={14} /> {t('dm.locationShare', { defaultValue: '위치공유' })}
            </button>
            <button className={styles.ghost} type="button" onClick={onWalkie}>
              <Radio size={14} /> {t('dm.moreMenuWalkieTalkie', { defaultValue: '워키토키' })}
            </button>
          </div>
        )}
        {canAccept && (
          <button className={styles.primary} type="button" disabled={busy} onClick={onAccept}>
            {t('dm.apptAccept', { defaultValue: '약속 수락' })}
          </button>
        )}
        {nav.reason && <p className={styles.note} role="status">{nav.reason}</p>}
        {nav.canRetry && (
          <button className={styles.retry} type="button" onClick={onRetryNav}>
            {t('dm.apptNavigationRetry', { defaultValue: '정확한 장소 다시 확인' })}
          </button>
        )}
        <div className={styles.row}>
          {nav.show && (
            <button className={styles.ghost} type="button" aria-disabled={nav.locked} onClick={onNavigate}>
              {t('dm.navigate', { defaultValue: '길안내' })}
            </button>
          )}
          <button className={`${styles.ghost} ${styles.danger}`} type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
        {onViewInChat && (
          <button className={styles.link} type="button" onClick={onViewInChat}>
            {t('dm.apptViewInChat')}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
