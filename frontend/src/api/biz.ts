import { api } from './client';

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
