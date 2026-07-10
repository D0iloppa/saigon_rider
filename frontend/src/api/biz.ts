import { api } from './client';
import { transformAd, type MarketAd } from './market';

export type BusinessProfileStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface BusinessProfile {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  photoContentId: string | null;
  photoUrl: string | null;
  status: BusinessProfileStatus;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessProfileInput {
  name: string;
  category: string | null;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  photoContentId?: string | null;
}

interface BusinessProfileApi {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  phone: string | null;
  photo_content_id: string | null;
  photo_url: string | null;
  status: BusinessProfileStatus;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
}

function fromApi(p: BusinessProfileApi): BusinessProfile {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    address: p.address,
    latitude: p.latitude != null ? Number(p.latitude) : null,
    longitude: p.longitude != null ? Number(p.longitude) : null,
    phone: p.phone,
    photoContentId: p.photo_content_id,
    photoUrl: p.photo_url,
    status: p.status,
    rejectReason: p.reject_reason,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function toBody(p: BusinessProfileInput) {
  return {
    name: p.name,
    category: p.category ?? null,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    phone: p.phone,
    photo_content_id: p.photoContentId ?? null,
  };
}

export async function applyBusinessProfile(p: BusinessProfileInput): Promise<BusinessProfile> {
  const res = await api.realFetch<BusinessProfileApi>('/biz/apply', {
    method: 'POST',
    body: JSON.stringify(toBody(p)),
  }, 'bff', { rethrow: true });
  return fromApi(res);
}

export async function fetchBusinessProfiles(): Promise<BusinessProfile[]> {
  const res = await api.realFetch<BusinessProfileApi[]>('/biz/profiles');
  return res.map(fromApi);
}

export async function fetchBusinessProfile(id: string): Promise<BusinessProfile> {
  const res = await api.realFetch<BusinessProfileApi>(`/biz/profiles/${id}`);
  return fromApi(res);
}

export async function updateBusinessProfile(id: string, p: BusinessProfileInput): Promise<BusinessProfile> {
  const res = await api.realFetch<BusinessProfileApi>(`/biz/profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toBody(p)),
  }, 'bff', { rethrow: true });
  return fromApi(res);
}

// ── 파트너 광고 (SGR-312 BP-4) ─────────────────────────────────

export type BusinessAdStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'STOPPED';

export interface BusinessAd {
  id: string;
  profileId: string | null;
  title: string;
  body: string | null;
  imageUrl: string | null;
  reviewStatus: BusinessAdStatus;
  rejectReason: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface BusinessAdInput {
  profileId: string;
  title: string;
  body?: string | null;
  imageContentId: string;
  startsAt?: string | null;
  endsAt?: string | null;
}

interface BusinessAdApi {
  id: string;
  profile_id: string | null;
  title: string;
  body: string | null;
  image_url: string | null;
  review_status: BusinessAdStatus;
  reject_reason: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

function fromAdApi(a: BusinessAdApi): BusinessAd {
  return {
    id: a.id,
    profileId: a.profile_id,
    title: a.title,
    body: a.body,
    imageUrl: a.image_url,
    reviewStatus: a.review_status,
    rejectReason: a.reject_reason,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    createdAt: a.created_at,
  };
}

export async function createBusinessAd(input: BusinessAdInput): Promise<BusinessAd> {
  const res = await api.realFetch<BusinessAdApi>('/biz/ads', {
    method: 'POST',
    body: JSON.stringify({
      profile_id: input.profileId,
      title: input.title,
      body: input.body ?? null,
      image_content_id: input.imageContentId,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
    }),
  }, 'bff', { rethrow: true });
  return fromAdApi(res);
}

export async function fetchBusinessAds(profileId: string): Promise<BusinessAd[]> {
  const res = await api.realFetch<BusinessAdApi[]>(`/biz/ads?profile_id=${profileId}`);
  return res.map(fromAdApi);
}

export async function fetchBusinessAd(id: string): Promise<BusinessAd> {
  const res = await api.realFetch<BusinessAdApi>(`/biz/ads/${id}`, undefined, 'bff', { rethrow: true });
  return fromAdApi(res);
}

export async function stopBusinessAd(id: string): Promise<BusinessAd> {
  const res = await api.realFetch<BusinessAdApi>(`/biz/ads/${id}/stop`, { method: 'POST' }, 'bff', { rethrow: true });
  return fromAdApi(res);
}

export async function resumeBusinessAd(id: string): Promise<BusinessAd> {
  const res = await api.realFetch<BusinessAdApi>(`/biz/ads/${id}/resume`, { method: 'POST' }, 'bff', { rethrow: true });
  return fromAdApi(res);
}

// ── 업체 지도 조회 (SGR-323 P1-3) ───────────────────────────────

export interface BizMapItem {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: number;
  lng: number;
  photoUrl: string | null;
}

interface BizMapItemApi {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: string | number;
  lng: string | number;
  photo_url: string | null;
}

export async function fetchBizMapItems(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: string;
  q?: string;
}): Promise<BizMapItem[]> {
  const qs = new URLSearchParams({
    min_lat: String(params.minLat),
    max_lat: String(params.maxLat),
    min_lng: String(params.minLng),
    max_lng: String(params.maxLng),
  });
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  const res = await api.realFetch<BizMapItemApi[]>(`/biz/public/map?${qs}`);
  return (res ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    address: b.address,
    lat: Number(b.lat),
    lng: Number(b.lng),
    photoUrl: b.photo_url,
  }));
}

// ── 공개 비즈니스 프로필 (SGR-312 BP-6) ─────────────────────────

export interface BusinessPublicProfile {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  photoUrl: string | null;
  ads: MarketAd[];
}

interface BusinessPublicProfileApi {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  phone: string | null;
  photo_url: string | null;
  ads: any[];
}

export async function fetchBusinessPublicProfile(id: string): Promise<BusinessPublicProfile> {
  const res = await api.realFetch<BusinessPublicProfileApi>(`/biz/public/${id}`, undefined, 'bff', { rethrow: true });
  return {
    id: res.id,
    name: res.name,
    category: res.category,
    address: res.address,
    latitude: res.latitude != null ? Number(res.latitude) : null,
    longitude: res.longitude != null ? Number(res.longitude) : null,
    phone: res.phone,
    photoUrl: res.photo_url,
    ads: (res.ads ?? []).map(transformAd),
  };
}
