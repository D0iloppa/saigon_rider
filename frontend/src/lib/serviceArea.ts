import depth1 from '@/components/maps/v2/saigon-depth1.json';

type Point = readonly [number, number];

function wardRing(points: string): Point[] {
  return points.split(' ').map((point) => {
    const [x, y] = point.split(',').map(Number);
    return [x, y] as const;
  });
}

function onSegment([x, y]: Point, [ax, ay]: Point, [bx, by]: Point): boolean {
  const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  return Math.abs(cross) < 1e-7 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)
    && y >= Math.min(ay, by) && y <= Math.max(ay, by);
}

function ringCovers(ring: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (onSegment(point, ring[j], ring[i])) return true;
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1])
      && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function serviceAreaWardSlug(lat: number, lng: number): string | null {
  const { bbox, VW, VH } = depth1;
  const x = ((lng - bbox.W) / (bbox.E - bbox.W)) * VW;
  const y = ((bbox.N - lat) / (bbox.N - bbox.S)) * VH;
  const ward = depth1.wards.find((candidate) => ringCovers(wardRing(candidate.p), [x, y]));
  return ward?.slug ?? null;
}

// DEV_GYEONGGI_BYPASS: 한국(경기도) 실기기에서 위치공유·Live Activity 를 검증하기 위한 임시 허용지역.
// DEV_DONGTAN_PIN 과 같은 취지 — dev 서버(`/app-config` is_dev)에서만 켜지고(fail-closed), 기본은 꺼짐.
// 실기기 검증 완료 후 이 bbox·플래그·App.tsx 의 setDevAreaBypass 호출을 전부 제거할 것 (2026-08-29).
const DEV_GYEONGGI_BBOX = { S: 36.9, N: 38.3, W: 126.3, E: 127.9 };
let devAreaBypass = false;

export function setDevAreaBypass(enabled: boolean): void {
  devAreaBypass = enabled;
}

export function inServiceArea(lat: number, lng: number): boolean {
  if (serviceAreaWardSlug(lat, lng) !== null) return true;
  return devAreaBypass
    && lat >= DEV_GYEONGGI_BBOX.S && lat <= DEV_GYEONGGI_BBOX.N
    && lng >= DEV_GYEONGGI_BBOX.W && lng <= DEV_GYEONGGI_BBOX.E;
}
