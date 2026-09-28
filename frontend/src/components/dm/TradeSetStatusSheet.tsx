import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { toast } from '@/components/ui/Toast';
import { useConfirmStore } from '@/store/useConfirmStore';
import { updateTradeSetStatus, type TradeSet } from '@/api/dm';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import { tradeSetErrorMessage } from './tradeSetErrors';
import styles from './TradeSetStatusSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  tradeSet: TradeSet;
  counterpartNickname: string;
  onChanged: (ts: TradeSet) => void;
  /** 거래완료 확정 직후 — 후기 시트를 여는 등 후속 처리는 호출부(DmDetail) 책임. */
  onCompleted: () => void;
}

/** F-DM-02 FR-7 — 판매자 전용 세트 상태 시트. [판매중][예약중][거래완료][닫기]. */
export function TradeSetStatusSheet({ open, onClose, conversationId, tradeSet, counterpartNickname, onChanged, onCompleted }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const activeCount = tradeSet.items.filter((it) => it.status === 'INQUIRY' || it.status === 'RESERVED').length;

  const apply = async (status: 'ON_SALE' | 'RESERVED' | 'COMPLETED') => {
    if (busy) return;
    setBusy(true);
    try {
      const ts = await updateTradeSetStatus(conversationId, status);
      onChanged(ts);
      onClose();
      if (status === 'COMPLETED') onCompleted();
    } catch (err) {
      toast.error(tradeSetErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = () => {
    useConfirmStore.getState().open(
      t('dm.tradeSetCompleteConfirm', {
        nickname: counterpartNickname,
        count: activeCount,
        total: formatPriceVnd(tradeSet.totalVnd, t),
        defaultValue:
          '{{nickname}}님과 {{count}}건 · 총 {{total}} 거래를 완료할까요? 되돌릴 수 없어요',
      }),
      async () => {
        useConfirmStore.getState().close();
        await apply('COMPLETED');
      },
      { confirmLabel: t('dm.tradeSetStatusCompleted', { defaultValue: '거래완료' }) },
    );
  };

  return (
    <BottomSheet open={open} onClose={onClose} height="fit" sheetStyle={{ height: 'auto' }}>
      <div className={styles.list}>
        <button type="button" className={styles.item} disabled={busy} onClick={() => apply('ON_SALE')}>
          {t('dm.tradeSetStatusOnSale', { defaultValue: '판매중' })}
        </button>
        <button type="button" className={styles.item} disabled={busy} onClick={() => apply('RESERVED')}>
          {t('dm.tradeSetStatusReserved', { defaultValue: '예약중' })}
        </button>
        <button type="button" className={styles.item} disabled={busy} onClick={handleComplete}>
          {t('dm.tradeSetStatusCompleted', { defaultValue: '거래완료' })}
        </button>
        <button type="button" className={styles.itemClose} onClick={onClose}>
          {t('common.cancel', { defaultValue: '닫기' })}
        </button>
      </div>
    </BottomSheet>
  );
}

export default TradeSetStatusSheet;
