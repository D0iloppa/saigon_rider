import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SelectedRegion } from '@/components/maps/v2/region';

/**
 * 지도/정보 화면 공통 위치 컨텍스트 — 단일 SoT.
 * 2모드: 'all'(전체 지역) ↔ 'region'(사용자가 고른 동). 지도 탐색에서 GPS 개념은 제거됐고
 * (GPS 는 경로안내·제보에서만), 지역 선택은 동네지도 지도 탭 또는 정보 화면 피커로만 바뀐다.
 *
 * `location` 스냅샷은 홈(WorldMapV2)·프로필(NeighborhoodProfile)이 지도 센터링에 쓰는
 * 읽기 전용 파생값 — 선택 지역이 바뀔 때 함께 갱신된다(별도 SoT 아님, region 의 투영).
 */
export type LocationSource = 'manual' | 'gps' | 'fallback';
export type LocationMode = 'all' | 'region';

export interface LocationSnapshot {
  coords: { lat: number; lng: number };
  wardId: number | null;
  wardName: string | null;
  source: LocationSource;
  measuredAt: number;
  accountId: string;
}

interface LocationState {
  mode: LocationMode;
  region: SelectedRegion | null;
  accountId: string | null;
  /** 홈/프로필 지도 센터링용 파생 스냅샷 (region 선택 시 갱신). */
  location: LocationSnapshot | null;

  selectRegion: (region: SelectedRegion, accountId: string) => void;
  selectAll: (accountId: string) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      mode: 'all',
      region: null,
      accountId: null,
      location: null,
      selectRegion: (region, accountId) =>
        set({
          mode: 'region',
          region,
          accountId,
          location: {
            coords: { lat: region.lat, lng: region.lng },
            wardId: null,
            wardName: region.name,
            source: 'manual',
            measuredAt: Date.now(),
            accountId,
          },
        }),
      selectAll: (accountId) => set({ mode: 'all', region: null, accountId, location: null }),
      clearLocation: () => set({ mode: 'all', region: null, accountId: null, location: null }),
    }),
    {
      name: 'saigon-rider-location',
      version: 3,
      migrate: (): Pick<LocationState, 'mode' | 'region' | 'accountId' | 'location'> => ({
        mode: 'all',
        region: null,
        accountId: null,
        location: null,
      }),
      partialize: (state) => ({
        mode: state.mode,
        region: state.region,
        accountId: state.accountId,
        location: state.location,
      }),
    },
  ),
);

/** 현재 계정의 선택 지역 — 'all' 이거나 다른 계정 선택이면 null. */
export function useSelectedRegion(accountId: string | null | undefined): SelectedRegion | null {
  return useLocationStore((s) => (s.mode === 'region' && s.accountId === accountId ? s.region : null));
}
