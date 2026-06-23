import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 사용자가 home(동네 지도)에서 선택한 위치를 앱 전역에 공유한다.
 * market 등 다른 화면의 기본 동네를 home 선택과 일치시키는 용도.
 */
interface LocationState {
  coords: { lat: number; lng: number } | null;
  setCoords: (coords: { lat: number; lng: number } | null) => void;
  wardName: string | null;
  setWardName: (name: string | null) => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      coords: null,
      setCoords: (coords) => set({ coords }),
      wardName: null,
      setWardName: (wardName) => set({ wardName }),
    }),
    { name: 'saigon-rider-location' },
  ),
);
