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

/**
 * DEV_DONGTAN_PIN: Google encoded polyline 인코더 (decodePolyline 의 역연산).
 * 한국 실기기 카메라연출 검증용 — devBypass 경로에서 Google Routes 호출 없이 직선 다구간
 * 폴리라인을 합성해 기존 decodePolyline 계약에 맞춰 주입하기 위해 사용한다.
 * 실기기 검증 완료 후 이 함수와 호출부를 제거할 것 (2026-08-07).
 */
export function encodePolyline(points: Array<[number, number]>): string {
  let result = '';
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (value: number): string => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let out = '';
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
    return out;
  };
  for (const [lat, lng] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    result += encodeValue(latE5 - prevLat);
    result += encodeValue(lngE5 - prevLng);
    prevLat = latE5;
    prevLng = lngE5;
  }
  return result;
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
 * 점(lat,lng)을 폴리라인에 스냅 — 최소 수직거리(m)와 그 최근접 세그먼트 인덱스.
 * 좁은 영역 → 쿼리 위도 기준 등거리 평면 투영 후 점-선분 거리. API 호출 없이 로컬 계산.
 * 이탈 판정(거리)과 course-up 카메라 회전(세그먼트 방위)이 같은 루프를 공유한다.
 */
export function snapToPolyline(
  lat: number,
  lng: number,
  pts: Array<[number, number]>,
): { distM: number; index: number } {
  if (pts.length === 0) return { distM: Infinity, index: -1 };
  if (pts.length === 1) return { distM: haversineM(lat, lng, pts[0][0], pts[0][1]), index: 0 };
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const px = lng * mPerLng;
  const py = lat * mPerLat;
  let min = Infinity;
  let idx = 0;
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
    if (d < min) { min = d; idx = i; }
  }
  return { distM: min, index: idx };
}

/** 점에서 폴리라인까지 최소 수직거리(m). 경로 이탈 판정용. */
export function distanceToPolylineM(
  lat: number,
  lng: number,
  pts: Array<[number, number]>,
): number {
  return snapToPolyline(lat, lng, pts).distM;
}
