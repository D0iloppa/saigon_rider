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

export async function fetchPoiMapItems(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: string;
  q?: string;
}): Promise<PoiMapItem[]> {
  const qs = new URLSearchParams({
    min_lat: String(params.minLat),
    max_lat: String(params.maxLat),
    min_lng: String(params.minLng),
    max_lng: String(params.maxLng),
  });
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  const res = await api.realFetch<PoiMapItemApi[]>(`/poi/public/map?${qs}`);
  return (res ?? []).map((p) => ({
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
}
