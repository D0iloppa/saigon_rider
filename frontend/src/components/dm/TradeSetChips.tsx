import { CalendarCheck, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TradeSet } from '@/api/dm';
import type { Appointment } from '@/api/types';
import { getStageAction, type ChipPayment, type StageAction } from './tradeSetChipModel';
import styles from './TradeSetChips.module.css';

interface Props {
  tradeSet: TradeSet;
  isSeller: boolean;
  myId: string | undefined;
  /** 이 방의 활성(PROPOSED/ACCEPTED) 약속 — 없으면 [약속 잡기]. 약속은 세트 상태와 무관한 한 자리(약속 슬롯). */
  appointment: Appointment | null;
  payment: ChipPayment | null;
  onAddOrEditItems: () => void;
  onMakeAppointment: () => void;
  onOpenAppointment: () => void;
  onShareLocation: () => void;
  onOpenTrade: () => void;
  onInspectItem: () => void;
}

/** 약속 일시를 "9.28 17:00" 형태로 — 채팅 칩 한 줄용 최소 포맷(날짜 구분선과 다른 용도라 별도 함수). */
function formatApptChip(iso: string): string {
  const d = new Date(iso);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const STAGE_LABEL: Record<StageAction, { key: string; defaultValue: string }> = {
  openTrade: { key: 'dm.tradeChipOpenTrade', defaultValue: '거래 열기' },
  inspect: { key: 'dm.tradeChipInspect', defaultValue: '물건 확인했어요' },
  pay: { key: 'dm.tradeChipPay', defaultValue: '송금하기' },
  sendQr: { key: 'dm.tradeChipSendQr', defaultValue: '결제 방법 보내기' },
  confirmReceipt: { key: 'dm.tradeChipConfirmReceipt', defaultValue: '송금 확인하기' },
  awaitConfirm: { key: 'dm.tradeChipAwaitConfirm', defaultValue: '입금 확인 대기' },
};

/** F-DM-02 FR-1 r7 세트 바 아래 칩 행 — 축은 세트 상태(약속 슬롯 + 단계 행동 + 물품 편집), 최대 3칩.
 * 순수 뷰: 판단은 props 와 getStageAction 만으로 한다. */
export function TradeSetChips({
  tradeSet,
  isSeller,
  myId,
  appointment,
  payment,
  onAddOrEditItems,
  onMakeAppointment,
  onOpenAppointment,
  onShareLocation,
  onOpenTrade,
  onInspectItem,
}: Props) {
  const { t } = useTranslation();
  // 거래완료(COMPLETED) 항목은 편집 대상이 아니다 — 문의중·예약중만 활성으로 센다.
  const activeItems = tradeSet.items.filter((it) => it.status === 'INQUIRY' || it.status === 'RESERVED');
  const stage = getStageAction(activeItems, isSeller, payment);

  return (
    <div className={styles.row}>
      {!appointment && (
        <button type="button" className={styles.chip} onClick={onMakeAppointment}>
          {t('dm.makeAppointment', { defaultValue: '약속잡기' })}
        </button>
      )}
      {appointment?.status === 'PROPOSED' && (
        appointment.proposerId === myId ? (
          // 제안자도 칩을 눌러 약속 시트([제안 취소])로 진입 — 시각 무게만 수신자 칩보다 가볍게(chipMuted).
          <button type="button" className={styles.chipMuted} onClick={onOpenAppointment}>
            {t('dm.tradeChipProposedMine', { defaultValue: '약속 제안됨' })}
          </button>
        ) : (
          <button type="button" className={styles.chipPrimary} onClick={onOpenAppointment}>
            {t('dm.tradeChipProposedIncoming', { defaultValue: '약속 제안 도착' })}
          </button>
        )
      )}
      {appointment?.status === 'ACCEPTED' && (
        <>
          <button type="button" className={styles.chip} onClick={onOpenAppointment}>
            <CalendarCheck size={13} /> {formatApptChip(appointment.whenAt)}
          </button>
          <button type="button" className={styles.chip} onClick={onShareLocation}>
            <MapPin size={13} /> {t('dm.locationShare', { defaultValue: '위치공유' })}
          </button>
        </>
      )}
      {stage && (
        <button
          type="button"
          className={stage === 'awaitConfirm' ? styles.chipMuted : styles.chipPrimary}
          onClick={stage === 'inspect' ? onInspectItem : onOpenTrade}
        >
          {t(STAGE_LABEL[stage].key, { defaultValue: STAGE_LABEL[stage].defaultValue })}
        </button>
      )}
      {/* 문의중(예약중 항목 없음) — 항목이 있으면 [물품편집], 비었으면 [물품추가]. 같은 피커 재진입(d5). */}
      {!stage && (
        <button type="button" className={styles.chip} onClick={onAddOrEditItems}>
          {activeItems.length > 0
            ? t('dm.tradeSetEditItems', { defaultValue: '물품편집' })
            : t('dm.tradeSetAddItems', { defaultValue: '+ 물품추가' })}
        </button>
      )}
    </div>
  );
}

export default TradeSetChips;
