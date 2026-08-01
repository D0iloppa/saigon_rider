import { useMemo } from 'react';
import { useUserStore } from '@/store/useUserStore';
import { useSelectedRegion } from '@/store/useLocationStore';

/** 선택 지역이 없을 때(전체) 정보 화면이 기준으로 삼는 도시 기본 중심 (구 infoCoords DEFAULT). */
export const HCMC_DEFAULT_CENTER = { lat: 10.776, lng: 106.7 };

/**
 * 정보 화면(주유/정비/침수/날씨) 공통 위치 컨텍스트.
 * `region` — 선택 지역(useLocationStore, 동네지도와 동일 소스). 없으면 null = 전체.
 * `origin` — 데이터 조회 기준 좌표. 지역 centroid, 없으면 도시 기본 중심.
 */
export function useServiceLocation() {
  const user = useUserStore((s) => s.user);
  const region = useSelectedRegion(user?.id);
  const origin = useMemo(
    () => (region ? { lat: region.lat, lng: region.lng } : HCMC_DEFAULT_CENTER),
    [region],
  );
  return { region, origin };
}
