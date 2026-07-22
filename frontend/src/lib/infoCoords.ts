const DEFAULT_COORDS: Coords = { lat: 10.776, lng: 106.700 };

export type Coords = { lat: number; lng: number };
export type CoordsSource = 'gps' | 'default';
export type ResolvedCoords = Coords & { source: CoordsSource };

export function parseCoordsFromQuery(search: string): Coords | null {
  const params = new URLSearchParams(search);
  const lat = parseFloat(params.get('lat') ?? '');
  const lng = parseFloat(params.get('lng') ?? '');
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

export function resolveInfoCoordsSync(
  search: string,
  onUpdate?: (c: ResolvedCoords) => void,
): ResolvedCoords {
  const fromUrl = parseCoordsFromQuery(search);
  if (fromUrl) return { ...fromUrl, source: 'gps' };

  void onUpdate;
  return { ...DEFAULT_COORDS, source: 'default' };
}

// 기존 호환용
export function resolveInfoCoords(search: string): Promise<Coords> {
  return new Promise((resolve) => {
    const instant = resolveInfoCoordsSync(search, (fresh) => resolve(fresh));
    resolve(instant);
  });
}
