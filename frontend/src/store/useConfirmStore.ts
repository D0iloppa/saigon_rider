import { create } from 'zustand';
import type { TextProp } from '@/components/ui/dialogTypes';

interface ConfirmState {
  isOpen: boolean;
  message: TextProp;
  confirmLabel: TextProp;
  cancelLabel: TextProp;
  /** false 면 취소 버튼·백드롭·ESC 로 닫을 수 없다(확인 버튼만). */
  dismissible: boolean;
  onConfirm: () => void;
  open: (
    message: TextProp,
    onConfirm: () => void,
    labels?: { confirmLabel?: TextProp; cancelLabel?: TextProp; dismissible?: boolean }
  ) => void;
  close: () => void;
}

const DEFAULT_CONFIRM: TextProp = { mode: 'code', value: 'common.confirm' };
const DEFAULT_CANCEL:  TextProp = { mode: 'code', value: 'common.cancel'  };

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  message: '',
  confirmLabel: DEFAULT_CONFIRM,
  cancelLabel:  DEFAULT_CANCEL,
  dismissible: true,
  onConfirm: () => {},
  open: (message, onConfirm, labels = {}) => set({
    isOpen: true,
    message,
    onConfirm,
    confirmLabel: labels.confirmLabel ?? DEFAULT_CONFIRM,
    cancelLabel:  labels.cancelLabel  ?? DEFAULT_CANCEL,
    dismissible:  labels.dismissible  ?? true,
  }),
  close: () => set({
    isOpen: false,
    message: '',
    confirmLabel: DEFAULT_CONFIRM,
    cancelLabel:  DEFAULT_CANCEL,
    dismissible: true,
    onConfirm: () => {},
  }),
}));
