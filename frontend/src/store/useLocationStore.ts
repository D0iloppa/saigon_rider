import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LocationSource = 'manual' | 'gps';

export interface LocationSnapshot {
  coords: { lat: number; lng: number };
  wardId: number | null;
  wardName: string | null;
  source: LocationSource;
  measuredAt: number;
  accountId: string;
}

interface LocationState {
  location: LocationSnapshot | null;
  setLocation: (location: LocationSnapshot) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      location: null,
      setLocation: (location) => set({ location }),
      clearLocation: () => set({ location: null }),
    }),
    {
      name: 'saigon-rider-location',
      version: 2,
      migrate: () => ({ location: null }),
      partialize: (state) => ({ location: state.location }),
    },
  ),
);
