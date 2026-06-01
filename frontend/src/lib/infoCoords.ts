import { native } from './native';

const DEFAULT_COORDS: Coords = { lat: 10.776, lng: 106.700 };
const DEFAULT_LABEL = 'District 1';
const STORAGE_KEY = 'last-known-coords';

export type Coords = { lat: number; lng: number };
export type CoordsSource = 'gps' | 'cached' | 'default';
export type ResolvedCoords = Coords & { source: CoordsSource };

export function parseCoordsFromQuery(search: string): Coords | null {
  const params = new URLSearchParams(search);
  const lat = parseFloat(params.get('lat') ?? '');
  const lng = parseFloat(params.get('lng') ?? '');
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function loadLastKnown(): Coords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { lat, lng } = JSON.parse(raw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  } catch { /* corrupt */ }
  return null;
}

function saveLastKnown(c: Coords): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

export function getDefaultLabel(): string {
  return DEFAULT_LABEL;
}

export function resolveInfoCoordsSync(
  search: string,
  onUpdate?: (c: ResolvedCoords) => void,
): ResolvedCoords {
  const fromUrl = parseCoordsFromQuery(search);
  if (fromUrl) return { ...fromUrl, source: 'gps' };

  const lastKnown = loadLastKnown();
  const instant: ResolvedCoords = lastKnown
    ? { ...lastKnown, source: 'cached' }
    : { ...DEFAULT_COORDS, source: 'default' };

  native.getLocation()
    .then((pos) => {
      const fresh: ResolvedCoords = { lat: pos.lat, lng: pos.lng, source: 'gps' };
      saveLastKnown(fresh);
      const moved =
        Math.abs(fresh.lat - instant.lat) > 0.001 ||
        Math.abs(fresh.lng - instant.lng) > 0.001;
      if (moved || instant.source !== 'gps') onUpdate?.(fresh);
    })
    .catch(() => { /* GPS 실패 — instant 좌표 유지 */ });

  return instant;
}

// 기존 호환용
export function resolveInfoCoords(search: string): Promise<Coords> {
  return new Promise((resolve) => {
    const instant = resolveInfoCoordsSync(search, (fresh) => resolve(fresh));
    resolve(instant);
  });
}
