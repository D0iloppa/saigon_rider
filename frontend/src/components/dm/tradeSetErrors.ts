import type { TFunction } from 'i18next';
import { extractErrorCode } from '@/api/client';

/** F-DM-02(260928) — 세트 바/피커/상태시트가 공유하는 백엔드 에러코드 → 토스트 문구 매핑.
 * 코드 출처: backend/app/routers/dm.py, market.py (trade_sets.py 공용 헬퍼 호출부). */
export function tradeSetErrorMessage(err: unknown, t: TFunction): string {
  const code = extractErrorCode(err);
  switch (code) {
    case 'LISTING_RESERVED':
      return t('dm.tradeSetErrorListingReserved', { defaultValue: '이미 다른 분에게 예약된 물품이에요' });
    case 'payment_reported':
      return t('dm.tradeSetErrorPaymentLocked', { defaultValue: '입금 신고 후에는 세트를 바꿀 수 없어요' });
    case 'listing_reservation_conflict':
      return t('dm.tradeSetErrorReservationConflict', { defaultValue: '이미 다른 분과 약속이 있는 매물이에요' });
    case 'counterpart_required':
      return t('dm.tradeSetCounterpartRequired', { defaultValue: '예약자를 선택해 주세요' });
    default:
      return t('common.errorUnexpected');
  }
}
