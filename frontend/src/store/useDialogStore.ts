import { create } from 'zustand';
import type { TextProp } from '@/components/ui/dialogTypes';

export interface DialogOptions {
  title?: TextProp;
  message?: TextProp;
  pre?: string;
  /** 제공 시 → Confirm 모드 (취소+확인). 미제공 시 → Alert 모드 (확인만) */
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: TextProp;
  cancelLabel?: TextProp;
}

interface DialogState {
  isOpen: boolean;
  options: DialogOptions;
  open: (options: DialogOptions) => void;
  close: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  isOpen: false,
  options: {},
  open: (options) => set({ isOpen: true, options }),
  close: () => set({ isOpen: false, options: {} }),
}));
