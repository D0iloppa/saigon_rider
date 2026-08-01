import depth1 from './saigon-depth1.json';
import { regionContains, type SelectedRegion } from './region';

/**
 * 동(ward) SelectedRegion 목록 — 지도 컴포넌트(SaigonMapV5) 없이도 지역 피커가 쓸 수 있게
 * depth1 데이터만으로 SelectedRegion 을 빌드하는 경량 모듈. LocationContextBar(정보 화면
 * 공통 지역 피커)가 이 모듈만 import 하므로 날씨처럼 지도를 안 그리는 화면이 무거운
 * SaigonMapV5 번들을 끌어오지 않는다. (SaigonMapV5 는 자체 buildWardRegion/findWardAt 를 계속 보유)
 */

type Bbox = { S: number; W: number; N: number; E: number };
const D1_BBOX = depth1.bbox as Bbox;

const parsePts = (s: string): [number, number][] =>
  s.trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]);

function buildWardRegion(idx: number): SelectedRegion | null {
  const w = depth1.wards[idx] as { n?: string; gps?: { lat: number; lng: number }; p: string };
  const gps = w.gps;
  if (!gps) return null;
  const poly = parsePts(w.p).map(([x, y]) => ({
    lat: D1_BBOX.N - (y / depth1.VH) * (D1_BBOX.N - D1_BBOX.S),
    lng: D1_BBOX.W + (x / depth1.VW) * (D1_BBOX.E - D1_BBOX.W),
  }));
  return { name: w.n ?? '', lat: gps.lat, lng: gps.lng, poly };
}

let cache: SelectedRegion[] | null = null;
function ensure(): SelectedRegion[] {
  if (!cache) {
    cache = [];
    for (let i = 0; i < depth1.wards.length; i++) {
      const slug = (depth1.wards[i] as { slug?: string }).slug;
      if (!slug) continue; // slug/gps 없는 동 스킵 (SaigonMapV5.buildWardRegion 가드와 동일)
      const region = buildWardRegion(i);
      if (region && region.name) cache.push(region);
    }
    cache.sort((a, b) => a.name.localeCompare(b.name));
  }
  return cache;
}

/** 지역 피커용 전체 동 목록 (이름 오름차순). */
export function listWardRegions(): SelectedRegion[] {
  return ensure();
}

/** 좌표가 속한 동 SelectedRegion — 없으면 null. */
export function wardRegionAt(lat: number, lng: number): SelectedRegion | null {
  for (const r of ensure()) {
    if (regionContains(r, lat, lng)) return r;
  }
  return null;
}
