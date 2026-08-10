import { api } from './client';
import { transformAd, type MarketAd } from './market';

/** 근접알림 후보 좌표 — 상세정보 없음(260806_proximity_ad_design.md §4 "가맹점 목록 노출: 비노출"). */
export interface ProximityCandidate {
  businessProfileId: string;
  lat: number;
  lng: number;
}

export interface ProximityEnterResult {
  notified: boolean;
  visitConfirmed: boolean;
  rpEarned: number;
  reason: string | null;
  /** notified 일 때만 채워진다 — 기존 AdCard 로 그대로 렌더링한다. */
  ad: MarketAd | null;
}

export async function fetchProximityCandidates(lat: number, lng: number): Promise<ProximityCandidate[]> {
  const p = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const raw = await api.realFetch<any[]>(`/proximity/candidates?${p.toString()}`);
  return (raw ?? []).map((r) => ({ businessProfileId: r.business_profile_id, lat: r.lat, lng: r.lng }));
}

export interface PostProximityEnterParams {
  businessProfileId: string;
  lat: number;
  lng: number;
  occurredAt?: string;
  prevLat?: number | null;
  prevLng?: number | null;
  prevAt?: string | null;
}

export async function postProximityEnter(params: PostProximityEnterParams): Promise<ProximityEnterResult> {
  const raw = await api.realFetch<any>('/proximity/enter', {
    method: 'POST',
    body: JSON.stringify({
      business_profile_id: params.businessProfileId,
      lat: params.lat,
      lng: params.lng,
      occurred_at: params.occurredAt,
      prev_lat: params.prevLat ?? undefined,
      prev_lng: params.prevLng ?? undefined,
      prev_at: params.prevAt ?? undefined,
    }),
  });
  return {
    notified: raw.notified,
    visitConfirmed: raw.visit_confirmed,
    rpEarned: raw.rp_earned,
    reason: raw.reason ?? null,
    ad: raw.ad ? transformAd(raw.ad) : null,
  };
}
