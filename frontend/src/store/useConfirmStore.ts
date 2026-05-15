import { create } from 'zustand';
import type { TextProp } from '@/components/ui/dialogTypes';

interface ConfirmState {
  isOpen: boolean;
  message: TextProp;
  confirmLabel: TextProp;
  cancelLabel: TextProp;
  onConfirm: () => void;
  open: (
    message: TextProp,
    onConfirm: () => void,
    labels?: { confirmLabel?: TextProp; cancelLabel?: TextProp }
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
  onConfirm: () => {},
  open: (message, onConfirm, labels = {}) => set({
    isOpen: true,
    message,
    onConfirm,
    confirmLabel: labels.confirmLabel ?? DEFAULT_CONFIRM,
    cancelLabel:  labels.cancelLabel  ?? DEFAULT_CANCEL,
  }),
  close: () => set({
    isOpen: false,
    message: '',
    confirmLabel: DEFAULT_CONFIRM,
    cancelLabel:  DEFAULT_CANCEL,
    onConfirm: () => {},
  }),
}));
