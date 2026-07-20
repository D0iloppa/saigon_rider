import { api } from './client';

// ── 장소 제안 (P-FE 동네지도 프로필 실배선) ───────────────────────
// biz.ts에서 이관 — 장소제보는 비즈니스 파트너 신청과 무관한 지도 도메인이라 URL도
// /api/map/place-suggestions*로 정식화(구 /api/biz/place-suggestions*).

export type PlaceSuggestionStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface PlaceSuggestionInput {
  name: string;
  category?: string | null;
  address?: string | null;
  lat: number;
  lng: number;
  note?: string | null;
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: number;
  lng: number;
  note: string | null;
  status: PlaceSuggestionStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface PlaceSuggestionApi {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: string | number;
  lng: string | number;
  note: string | null;
  status: PlaceSuggestionStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

function fromPlaceSuggestionApi(p: PlaceSuggestionApi): PlaceSuggestion {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    address: p.address,
    lat: Number(p.lat),
    lng: Number(p.lng),
    note: p.note,
    status: p.status,
    reviewNote: p.review_note,
    createdAt: p.created_at,
    reviewedAt: p.reviewed_at,
  };
}

export async function createPlaceSuggestion(input: PlaceSuggestionInput): Promise<PlaceSuggestion> {
  const res = await api.realFetch<PlaceSuggestionApi>('/map/place-suggestions', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      category: input.category ?? null,
      address: input.address ?? null,
      lat: input.lat,
      lng: input.lng,
      note: input.note ?? null,
    }),
  }, 'bff', { rethrow: true });
  return fromPlaceSuggestionApi(res);
}

export async function fetchMyPlaceSuggestions(): Promise<PlaceSuggestion[]> {
  const res = await api.realFetch<PlaceSuggestionApi[]>('/map/place-suggestions/mine');
  return (res ?? []).map(fromPlaceSuggestionApi);
}
