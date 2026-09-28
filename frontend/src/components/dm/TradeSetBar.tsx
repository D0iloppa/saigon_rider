import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import type { TradeSet } from '@/api/dm';
import styles from './TradeSetBar.module.css';

interface Props {
  tradeSet: TradeSet;
  isSeller: boolean;
  /** 썸네일/제목/"외 N" 탭 — 목록 시트(F-DM-02 FR-6)를 연다(260928 회귀 복구). */
  onOpenList: () => void;
  /** 판매자만 탭 가능 — 상태 시트(F-DM-02 FR-7)를 연다. */
  onStatusTap: () => void;
}

/** 세트 상태 라벨(파생) — 예약중 항목이 하나라도 있으면 예약중, 세트가 닫혔으면(전부 완료) 거래완료,
 * 그 외 판매중. 260928 설계 §3.3 "매물 간판(파생)" 규칙. */
function deriveStatusLabel(ts: TradeSet, t: ReturnType<typeof useTranslation>['t']): string {
  if (ts.status === 'CLOSED') return t('dm.tradeSetStatusCompleted', { defaultValue: '거래완료' });
  if (ts.items.some((it) => it.status === 'RESERVED')) return t('dm.tradeSetStatusReserved', { defaultValue: '예약중' });
  return t('dm.tradeSetStatusOnSale', { defaultValue: '판매중' });
}

/** F-DM-02 FR-1 — 방 상단 세트 바. 대표 썸네일(+N) · 상태 라벨(판매자만 탭 가능) · "첫 물품 외 N" · 총액. */
export function TradeSetBar({ tradeSet, isSeller, onOpenList, onStatusTap }: Props) {
  const { t } = useTranslation();
  const activeItems = tradeSet.items.filter((it) => it.status !== 'REMOVED' && it.status !== 'CANCELLED');
  const first = activeItems[0];
  const otherCount = activeItems.length - 1;
  if (!first) return null;
  const statusLabel = deriveStatusLabel(tradeSet, t);

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.thumbWrap} onClick={onOpenList}>
        <AppImage src={first.thumbnailUrl ?? undefined} alt="" className={styles.thumb} />
        {otherCount > 0 && <span className={styles.thumbBadge}>+{otherCount}</span>}
      </button>
      <div className={styles.info}>
        {isSeller ? (
          <button type="button" className={styles.statusLabel} onClick={onStatusTap}>
            {statusLabel} <ChevronDown size={13} />
          </button>
        ) : (
          <span className={styles.statusLabelPlain}>{statusLabel}</span>
        )}
        <button type="button" className={styles.titleRow} onClick={onOpenList}>
          <span className={styles.title}>{first.title}</span>
          {otherCount > 0 && (
            <span className={styles.otherCount}>
              {t('dm.tradeSetOtherItemsCount', { count: otherCount, defaultValue: '외 {{count}}' })}
            </span>
          )}
        </button>
      </div>
      <span className={styles.total}>{formatPriceVnd(tradeSet.totalVnd, t)}</span>
    </div>
  );
}

export default TradeSetBar;
