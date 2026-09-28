import { CalendarCheck, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TradeSet } from '@/api/dm';
import type { Appointment } from '@/api/types';
import styles from './TradeSetChips.module.css';

interface Props {
  tradeSet: TradeSet;
  isSeller: boolean;
  /** ACCEPTED 상태인 이 세트의 대표 약속 — 없으면 문의중 단계 칩만 보여준다(d5 MVP 3단계 cut). */
  acceptedAppointment: Appointment | null;
  onAddOrEditItems: () => void;
  onOpenAppointment: () => void;
  onShareLocation: () => void;
  /** 판매자 전용 — 세트 문의중 항목을 바로 예약중으로 변경 (TradeSetStatusSheet 거치지 않는 지름길). */
  onReserveShortcut: () => void;
}

/** 약속 일시를 "9.28 17:00" 형태로 — 채팅 칩 한 줄용 최소 포맷(날짜 구분선과 다른 용도라 별도 함수). */
function formatApptChip(iso: string): string {
  const d = new Date(iso);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** F-DM-02 FR-1 세트 바 아래 칩 행 — 단계 × 역할 매트릭스(260928 설계 §3.3, TASK d5 MVP 3단계 cut). */
export function TradeSetChips({
  tradeSet,
  isSeller,
  acceptedAppointment,
  onAddOrEditItems,
  onOpenAppointment,
  onShareLocation,
  onReserveShortcut,
}: Props) {
  const { t } = useTranslation();
  const activeItems = tradeSet.items.filter((it) => it.status !== 'REMOVED' && it.status !== 'CANCELLED');
  if (activeItems.length === 0) return null;

  if (acceptedAppointment) {
    return (
      <div className={styles.row}>
        <button type="button" className={styles.chip} onClick={onOpenAppointment}>
          <CalendarCheck size={13} /> {formatApptChip(acceptedAppointment.whenAt)}
        </button>
        <button type="button" className={styles.chip} onClick={onShareLocation}>
          <MapPin size={13} /> {t('dm.locationShare', { defaultValue: '위치공유' })}
        </button>
        {isSeller && activeItems.some((it) => it.status === 'INQUIRY') && (
          <button type="button" className={styles.chipPrimary} onClick={onReserveShortcut}>
            {t('dm.tradeSetReserveShortcut', { defaultValue: '예약' })}
          </button>
        )}
      </div>
    );
  }

  // 문의중(약속 없음) 단계 — 구매자 [+ 물품추가] / 항목 2개+면 [물품편집]으로 라벨만 바뀐다(같은 피커 재진입, d5).
  if (isSeller) return null;
  return (
    <div className={styles.row}>
      <button type="button" className={styles.chip} onClick={onAddOrEditItems}>
        {activeItems.length > 1
          ? t('dm.tradeSetEditItems', { defaultValue: '물품편집' })
          : t('dm.tradeSetAddItems', { defaultValue: '+ 물품추가' })}
      </button>
    </div>
  );
}

export default TradeSetChips;
