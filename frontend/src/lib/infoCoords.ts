export type Coords = { lat: number; lng: number };

/** URL 쿼리(?lat&lng)에서 좌표 파싱 — 침수 제보(InfoFloodReport) 초기 포커싱용. */
export function parseCoordsFromQuery(search: string): Coords | null {
  const params = new URLSearchParams(search);
  const lat = parseFloat(params.get('lat') ?? '');
  const lng = parseFloat(params.get('lng') ?? '');
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}
