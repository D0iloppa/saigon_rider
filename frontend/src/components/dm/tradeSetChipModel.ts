import type { TradeSetItem } from '@/api/dm';
import type { MarketplacePaymentStatus } from '@/api/types';

/** 칩 행이 다음 행동을 고르는 데 쓰는 결제 상태 — 거래(결제) 기록에서 뽑은 최소 필드. */
export interface ChipPayment {
  status: MarketplacePaymentStatus;
  hasQr: boolean;
  inspected: boolean;
}

export type StageAction = 'openTrade' | 'inspect' | 'pay' | 'sendQr' | 'confirmReceipt' | 'awaitConfirm';

/** F-DM-02 FR-1 r7 — 세트 항목 상태 + 결제 상태만으로 "다음 행동" 칩 하나를 정한다(약속 시각과 무관, F-N-02 FR-7 ⑤).
 * 예약중 항목이 없으면(문의중) 단계 행동은 없다. 결제 기록을 아직 못 읽었으면 [거래 열기]로 안전하게 둔다. */
export function getStageAction(
  items: TradeSetItem[],
  isSeller: boolean,
  payment: ChipPayment | null,
): StageAction | null {
  if (!items.some((it) => it.status === 'RESERVED')) return null;
  if (!payment) return 'openTrade';
  if (payment.status === 'PAYMENT_REPORTED') return isSeller ? 'confirmReceipt' : 'awaitConfirm';
  if (payment.status === 'PAYMENT_CONFIRMED') return 'openTrade';
  if (isSeller) return payment.hasQr ? 'openTrade' : 'sendQr';
  if (!payment.inspected) return 'inspect';
  return payment.hasQr ? 'pay' : 'openTrade';
}
