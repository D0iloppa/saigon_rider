import { create } from 'zustand';
import type { TextProp } from '@/components/ui/dialogTypes';
import type { AppointmentCancelReason } from '@/api/types';

/** F-X-01 FR-1(260924 승인안): 취소 사유 칩 3개(선택 필수 1) — DM 약속 카드·거래 화면 공통.
 * 사유를 고르면 호출부가 기존 useConfirmStore 확인 다이얼로그를 이어서 연다(2단계 흐름). */
interface CancelReasonState {
  isOpen: boolean;
  title: TextProp;
  onSelect: (reason: AppointmentCancelReason) => void;
  open: (title: TextProp, onSelect: (reason: AppointmentCancelReason) => void) => void;
  close: () => void;
}

const DEFAULT_TITLE: TextProp = { mode: 'code', value: 'dm.cancelReasonTitle' };

export const useCancelReasonStore = create<CancelReasonState>((set) => ({
  isOpen: false,
  title: DEFAULT_TITLE,
  onSelect: () => {},
  open: (title, onSelect) => set({ isOpen: true, title, onSelect }),
  close: () => set({ isOpen: false, title: DEFAULT_TITLE, onSelect: () => {} }),
}));
