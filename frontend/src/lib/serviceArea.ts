/** 서비스 지역(호치민) 판정 — 동네지도·약속 장소 등 공용. */
export const HCMC_BOUNDS = { minLat: 10.35, maxLat: 11.2, minLng: 106.3, maxLng: 107.05 };

export function inServiceArea(lat: number, lng: number): boolean {
  return (
    lat >= HCMC_BOUNDS.minLat &&
    lat <= HCMC_BOUNDS.maxLat &&
    lng >= HCMC_BOUNDS.minLng &&
    lng <= HCMC_BOUNDS.maxLng
  );
}
