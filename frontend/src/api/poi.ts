import { api } from './client';

// ── POI 지도 조회 (상시 참조 레이어, Phase A-2) ─────────────────

export interface PoiMapItem {
  id: string;
  category: 'landmark' | 'civic' | string;
  nameKo: string;
  nameVi: string | null;
  nameEn: string | null;
  address: string | null;
  lat: number;
  lng: number;
  photoUrl: string | null;
}

interface PoiMapItemApi {
  id: string;
  category: string;
  name_ko: string;
  name_vi: string | null;
  name_en: string | null;
  address: string | null;
  lat: string | number;
  lng: string | number;
  photo_url: string | null;
}

// ── 모듈 스코프 인메모리 bbox 캐시 (TTL 1시간) ─────────────────
// 동네지도 모듈 내부에 캡슐화된 캐시 — 앱 전역 캐싱 인프라(React Query 등)에
// 얹지 않는다. 키는 라운딩한 bbox + category/q 필터. 세션 내에서만 유효
// (콜드 재시작 시 소멸 — 영속화는 범위 밖, 후속 결정 필요).
const POI_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

const poiCache = new Map<string, { items: PoiMapItem[]; fetchedAt: number }>();

// 격자 셀 단위로 반올림 — 연속값 bbox를 그대로 키로 쓰면 캐시 히트율이 0에 수렴한다.
const BBOX_GRID = 0.01; // 위경도 약 1km 격자

function roundToGrid(v: number): number {
  return Math.round(v / BBOX_GRID) * BBOX_GRID;
}

function poiCacheKey(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: string;
  q?: string;
}): string {
  return [
    roundToGrid(params.minLat),
    roundToGrid(params.maxLat),
    roundToGrid(params.minLng),
    roundToGrid(params.maxLng),
    params.category ?? '',
    params.q ?? '',
  ].join('|');
}

export async function fetchPoiMapItems(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: string;
  q?: string;
}): Promise<PoiMapItem[]> {
  const key = poiCacheKey(params);
  const cached = poiCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < POI_CACHE_TTL_MS) {
    return cached.items;
  }

  const qs = new URLSearchParams({
    min_lat: String(params.minLat),
    max_lat: String(params.maxLat),
    min_lng: String(params.minLng),
    max_lng: String(params.maxLng),
  });
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  const res = await api.realFetch<PoiMapItemApi[]>(`/poi/public/map?${qs}`);
  const items = (res ?? []).map((p) => ({
    id: p.id,
    category: p.category,
    nameKo: p.name_ko,
    nameVi: p.name_vi,
    nameEn: p.name_en,
    address: p.address,
    lat: Number(p.lat),
    lng: Number(p.lng),
    photoUrl: p.photo_url,
  }));
  poiCache.set(key, { items, fetchedAt: Date.now() });
  return items;
}
