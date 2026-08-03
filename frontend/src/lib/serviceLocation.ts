import { native, type GeoPosition } from '@/lib/native';
import { BEN_THANH_FALLBACK } from '@/lib/mapDefaults';
import { inServiceArea } from '@/lib/serviceArea';

export interface ResolvedLocation {
  coords: { lat: number; lng: number };
  source: 'device' | 'fallback';
  reason?: 'outside_service_area';
}

/**
 * GPS 권한을 요청하고 위치를 읽는다. **화면 mount 시 자동 호출 금지** — 사용자가
 * "내 주변순"·"현재 위치로 이동" 등 위치 기능을 명시적으로 눌렀을 때만 호출한다
 * (P1-3, service-rules.md:11-12). 호출부에서 목적을 먼저 알리고, 거부/timeout/서비스
 * 꺼짐을 구분해 처리해야 한다.
 */
export function requestDeviceLocation(): Promise<GeoPosition> {
  return native.ensureLocationPermission().then(() => native.getLocation());
}

export function resolveServiceLocation(position: GeoPosition): Promise<ResolvedLocation> {
  if (inServiceArea(position.lat, position.lng)) {
    return Promise.resolve({
      coords: { lat: position.lat, lng: position.lng },
      source: 'device',
    });
  }
  return Promise.resolve({
    coords: BEN_THANH_FALLBACK,
    source: 'fallback',
    reason: 'outside_service_area',
  });
}

export function resolveUsableLocation(): Promise<ResolvedLocation> {
  return requestDeviceLocation().then(resolveServiceLocation);
}
