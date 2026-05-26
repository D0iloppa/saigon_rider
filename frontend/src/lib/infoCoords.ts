const DEFAULT_COORDS = { lat: 10.776, lng: 106.700 };

export type Coords = { lat: number; lng: number };

export function parseCoordsFromQuery(search: string): Coords | null {
  const params = new URLSearchParams(search);
  const lat = parseFloat(params.get('lat') ?? '');
  const lng = parseFloat(params.get('lng') ?? '');
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

// URL 쿼리(lat,lng)가 있으면 사용, 없으면 GPS 시도, 실패 시 DEFAULT_COORDS.
export function resolveInfoCoords(search: string): Promise<Coords> {
  const fromUrl = parseCoordsFromQuery(search);
  if (fromUrl) return Promise.resolve(fromUrl);
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(DEFAULT_COORDS);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(DEFAULT_COORDS),
    );
  });
}
