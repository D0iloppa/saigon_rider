/**
 * Google encoded polyline 디코더.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 * Directions API 의 overview_polyline.points → [lat, lng][] 변환.
 */
export function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** 두 좌표 간 진행 방위(도, 0=북, 시계방향). 경로 시작 방향 카메라 회전용. */
export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** 두 좌표 간 거리(m). Haversine. 목적지 근접/나침반 모드 판정용. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dφ = toRad(lat2 - lat1);
  const dλ = toRad(lng2 - lng1);
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 점(lat,lng)에서 폴리라인(pts=[lat,lng][])까지 최소 수직거리(m). 경로 이탈 판정용.
 * 좁은 영역 → 쿼리 위도 기준 등거리 평면 투영 후 점-선분 거리. API 호출 없이 로컬 계산.
 */
export function distanceToPolylineM(
  lat: number,
  lng: number,
  pts: Array<[number, number]>,
): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return haversineM(lat, lng, pts[0][0], pts[0][1]);
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const px = lng * mPerLng;
  const py = lat * mPerLat;
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][1] * mPerLng;
    const ay = pts[i][0] * mPerLat;
    const bx = pts[i + 1][1] * mPerLng;
    const by = pts[i + 1][0] * mPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < min) min = d;
  }
  return min;
}
