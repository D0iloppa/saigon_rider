import { native, type GeoPosition } from '@/lib/native';
import { BEN_THANH_FALLBACK } from '@/lib/mapDefaults';
import { inServiceArea } from '@/lib/serviceArea';

export interface ResolvedLocation {
  coords: { lat: number; lng: number };
  source: 'device' | 'fallback';
  reason?: 'outside_service_area';
}

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
