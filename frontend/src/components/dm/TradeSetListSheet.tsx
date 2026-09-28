import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import type { TradeSet, TradeSetItem } from '@/api/dm';
import { tradeSetErrorMessage } from './tradeSetErrors';
import styles from './TradeSetListSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  tradeSet: TradeSet;
  /** 세트 판매자 닉네임 — 시트 제목 "{{nickname}}님과 한 번에 거래하는 물품이에요" */
  sellerNickname: string;
  /** 구매자만 [물품편집](피커 재진입)을 볼 수 있다 — 260928 설계 §3.4 편집 권한은 양측이지만
   * MVP 는 피커 재진입 하나뿐이라 이 시트에서는 구매자 쪽 재진입 동선만 노출한다. */
  isBuyer: boolean;
  onRowTap: (listingId: string) => void;
  onSendItemCard: (listingId: string) => Promise<void>;
  onSendBundleCard: () => Promise<void>;
  onEditItems: () => void;
}

function statusLabelKey(status: TradeSetItem['status']): string {
  if (status === 'RESERVED') return 'dm.tradeSetStatusReserved';
  if (status === 'COMPLETED') return 'dm.tradeSetStatusCompleted';
  return 'dm.tradeSetStatusOnSale';
}

/** F-DM-02 FR-6 — 세트 목록 시트. 세트 바 탭으로 열리며, 행별 [물품 정보 보내기]와
 * 하단 [묶음 정보 보내기]/[물품편집]을 제공한다(260928 회귀 복구, owner device feedback 260928). */
export function TradeSetListSheet({ open, onClose, tradeSet, sellerNickname, isBuyer, onRowTap, onSendItemCard, onSendBundleCard, onEditItems }: Props) {
  const { t } = useTranslation();
  const [sendingItemId, setSendingItemId] = useState<string | null>(null);
  const [sendingBundle, setSendingBundle] = useState(false);

  // 활성(INQUIRY/RESERVED) 항목 + 세트가 CLOSED(전부 완료)일 때만 COMPLETED 항목도 보여준다.
  const rows = tradeSet.items.filter(
    (it) => it.status === 'INQUIRY' || it.status === 'RESERVED' || (it.status === 'COMPLETED' && tradeSet.status === 'CLOSED'),
  );
  const activeRows = rows.filter((it) => it.status !== 'COMPLETED');

  const handleSendItem = async (listingId: string) => {
    if (sendingItemId || sendingBundle) return;
    setSendingItemId(listingId);
    try {
      await onSendItemCard(listingId);
    } catch (err) {
      toast.error(tradeSetErrorMessage(err, t));
    } finally {
      setSendingItemId(null);
    }
  };

  const handleSendBundle = async () => {
    if (sendingItemId || sendingBundle || activeRows.length < 2) return;
    setSendingBundle(true);
    try {
      await onSendBundleCard();
    } catch (err) {
      toast.error(tradeSetErrorMessage(err, t));
    } finally {
      setSendingBundle(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      height="half"
      header={
        <h2 className={styles.title}>
          {t('dm.tradeSetListSheetTitle', { nickname: sellerNickname, defaultValue: '{{nickname}}님과 한 번에 거래하는 물품이에요' })}
        </h2>
      }
      footer={
        <div className={styles.footer}>
          <span className={styles.footerSummary}>
            {t('dm.tradeSetPickerSummary', { count: rows.length, total: formatPriceVnd(tradeSet.totalVnd, t) })}
          </span>
          <div className={styles.footerActions}>
            {isBuyer && (
              <button type="button" className={styles.editBtn} onClick={onEditItems}>
                {t('dm.tradeSetEditItems', { defaultValue: '물품편집' })}
              </button>
            )}
            <button
              type="button"
              className={styles.bundleBtn}
              disabled={activeRows.length < 2 || sendingBundle || !!sendingItemId}
              onClick={handleSendBundle}
            >
              {t('dm.tradeSetListSheetSendBundle', { defaultValue: '묶음 정보 보내기' })}
            </button>
          </div>
        </div>
      }
    >
      <div className={styles.list}>
        {rows.map((it) => (
          <div key={it.listingId} className={styles.row}>
            <button type="button" className={styles.rowMain} onClick={() => onRowTap(it.listingId)}>
              <AppImage src={it.thumbnailUrl ?? undefined} alt="" className={styles.thumb} />
              <div className={styles.rowInfo}>
                <span className={styles.rowTitle}>{it.title}</span>
                <span className={styles.rowPrice}>{formatPriceVnd(it.agreedPriceVnd ?? it.priceVnd, t)}</span>
                <span className={styles.rowBadge}>{t(statusLabelKey(it.status))}</span>
              </div>
            </button>
            <button
              type="button"
              className={styles.rowSendBtn}
              disabled={sendingItemId === it.listingId || sendingBundle}
              onClick={() => handleSendItem(it.listingId)}
            >
              {t('dm.tradeSetListSheetSendItem', { defaultValue: '물품 정보 보내기' })}
            </button>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

export default TradeSetListSheet;
