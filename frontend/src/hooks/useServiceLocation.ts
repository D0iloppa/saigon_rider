import { useMemo } from 'react';
import { useLocationStore, NEARBY_RADIUS_KM } from '@/store/useLocationStore';

/** 표시 범위가 '전체'일 때 정보 화면이 기준으로 삼는 도시 기본 중심 (구 infoCoords DEFAULT). */
export const HCMC_DEFAULT_CENTER = { lat: 10.776, lng: 106.7 };

/**
 * '전체 지역' 조회 반경(km) — 서비스 지역(37개 동, 약 14×14km) 전체를 덮는 값.
 * 도시 중심에서 모서리까지 대각 ≈10km 라 여유를 둬 12km.
 *
 * 이 값이 없으면 '전체 지역'도 3km(NEARBY_RADIUS_KM)로 조회돼 **'내 현재 위치'와 결과가
 * 같아진다** — 실제로 그랬다(대표 지적 2026-08-06: "전체지역을 해도 똑같이 노출됨").
 * 도시 중심이 마침 테스트 좌표와 가까워 차이가 드러나지 않았다.
 */
export const ALL_AREA_RADIUS_KM = 12;

/**
 * 정보 화면(주유/정비/침수/날씨) 공통 위치 컨텍스트.
 *
 * 대표 지적 2026-08-06 "주유소. 강수. 등. 지역이 뭔기준이냐 / 그거 gps로 잡아라" —
 * 종전에는 GPS 를 **전혀 쓰지 않고** 사용자가 과거에 고른 지역(useSelectedRegion)이나 도시
 * 중심을 기준으로 삼았다. 그래서 GPS 를 켜고 봐도 화면은 예전에 고른 지역 기준이었다.
 * 이제 표시 범위 단일 SoT(useLocationStore)를 그대로 따른다.
 *
 * `origin`        — 조회 기준 좌표. 'gps' 면 내 좌표, 'all' 이면 도시 기본 중심.
 * `fetchRadiusKm` — 조회 반경. 'gps' = 내 주변(3km), 'all' = 서비스 전역(12km).
 * `label`         — 표시용 동네명. 권역 밖 폴백 중이면 null(동네명을 지어내지 않는다).
 */
export function useServiceLocation() {
  const mode = useLocationStore((s) => s.mode);
  const coords = useLocationStore((s) => s.coords);
  const wardName = useLocationStore((s) => s.wardName);
  const coordsSource = useLocationStore((s) => s.coordsSource);

  const origin = useMemo(
    () => (mode === 'gps' && coords ? coords : HCMC_DEFAULT_CENTER),
    [mode, coords],
  );

  return {
    origin,
    fetchRadiusKm: mode === 'gps' ? NEARBY_RADIUS_KM : ALL_AREA_RADIUS_KM,
    label: mode === 'gps' && coordsSource === 'device' ? wardName : null,
  };
}
