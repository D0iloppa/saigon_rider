import { create } from 'zustand';

// BottomSheet 가 열려 있는 동안 전역 fixed 오버레이(ActiveSessionBar 등)가 시트 내용
// 사이에 끼어 보이는 걸 막기 위한 카운터 — 여러 시트가 동시에 열려도 마지막이 닫힐 때만 0이 된다.
interface SheetPresenceState {
  openCount: number;
  increment: () => void;
  decrement: () => void;
}

export const useSheetPresenceStore = create<SheetPresenceState>((set) => ({
  openCount: 0,
  increment: () => set((s) => ({ openCount: s.openCount + 1 })),
  decrement: () => set((s) => ({ openCount: Math.max(0, s.openCount - 1) })),
}));
