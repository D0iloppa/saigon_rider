/**
 * 뷰포트 기반 그리드 클러스터링.
 *
 * 종전 주유소·정비소 지도는 줌아웃 시 개별 dot 대신 **구(district) 단위 집계 배지**를 띄웠다.
 * 그 방식의 문제 3가지(대표 지적 2026-08-06):
 *  1. 배지가 구 중심점(`district.gps`)에 찍혀 실제 지점들이 몰린 위치와 어긋난다.
 *  2. 합계가 목록 건수와 안 맞는다(구 판정 실패분 누락 + 뷰포트 컬링).
 *  3. 기준 단위가 낡았다 — 배지는 구(22개, 레거시)인데 지도 폴리곤·필터는 동(37개, 2025 신 단위).
 *
 * 여기서는 **현재 보이는 범위를 격자로 나눠** 같은 칸의 지점들을 묶고, 클러스터 좌표를
 * **구성원의 무게중심**에 둔다. 행정구역과 무관하므로 위 3가지가 함께 해소된다.
 *
 * 화면 밖 지점도 함께 클러스터링한다 — 렌더러가 뷰포트 컬링을 하므로 보이는 것만 남고,
 * 격자 크기는 화면 밖에서도 동일해 팬(pan) 중 클러스터가 튀지 않는다.
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface PointCluster extends LatLngPoint {
  count: number;
}

export interface ClusterBbox {
  N: number;
  S: number;
  E: number;
  W: number;
}

/**
 * @param points 클러스터링 대상 (목록과 동일한 집합이어야 합계가 맞는다)
 * @param bbox   현재 뷰포트. 격자 크기의 기준이다.
 * @param cells  뷰포트를 가로/세로 몇 칸으로 나눌지. 클수록 잘게 쪼개진다.
 */
export function clusterByViewport(
  points: LatLngPoint[],
  bbox: ClusterBbox | null,
  cells = 5,
): PointCluster[] {
  if (points.length === 0) return [];
  // 뷰포트를 모르면 묶지 않는다 — 임의 격자로 묶으면 위치가 엉뚱해진다.
  if (!bbox) return points.map((p) => ({ lat: p.lat, lng: p.lng, count: 1 }));

  const latSpan = Math.abs(bbox.N - bbox.S);
  const lngSpan = Math.abs(bbox.E - bbox.W);
  if (!(latSpan > 0) || !(lngSpan > 0)) return points.map((p) => ({ lat: p.lat, lng: p.lng, count: 1 }));

  const cellLat = latSpan / cells;
  const cellLng = lngSpan / cells;

  // 격자 원점을 뷰포트가 아니라 절대 좌표(0,0)에 고정한다 — 뷰포트에 맞추면 팬 할 때마다
  // 칸 경계가 움직여 클러스터가 깜빡이며 재편성된다.
  const buckets = new Map<string, { lat: number; lng: number; count: number }>();
  for (const p of points) {
    const gy = Math.floor(p.lat / cellLat);
    const gx = Math.floor(p.lng / cellLng);
    const key = `${gy}:${gx}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.lat += p.lat;
      cur.lng += p.lng;
      cur.count += 1;
    } else {
      buckets.set(key, { lat: p.lat, lng: p.lng, count: 1 });
    }
  }

  // 합산해 둔 좌표를 무게중심으로 환산한다.
  return [...buckets.values()].map((b) => ({
    lat: b.lat / b.count,
    lng: b.lng / b.count,
    count: b.count,
  }));
}
