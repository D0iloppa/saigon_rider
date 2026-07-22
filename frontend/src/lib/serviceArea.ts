import depth1 from '@/components/maps/v2/saigon-depth1.json';

export const SERVICE_AREA_GEOMETRY_VERSION = 'service-area.v1';

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

export function inServiceArea(lat: number, lng: number): boolean {
  return serviceAreaWardSlug(lat, lng) !== null;
}
