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

// ── 업체 카테고리 (W3-FE, business_category DB화) ───────────────

export interface BizCategory {
  code: string;
  groupCode: string;
  groupLabelKo: string;
  groupLabelVi: string;
  groupLabelEn: string;
  icon: string;
  labelKo: string;
  labelVi: string;
  labelEn: string;
  sortOrder: number;
}

interface BizCategoryApi {
  code: string;
  group_code: string;
  group_label_ko: string;
  group_label_vi: string;
  group_label_en: string;
  icon: string;
  label_ko: string;
  label_vi: string;
  label_en: string;
  sort_order: number;
}

export async function fetchBizCategories(): Promise<BizCategory[]> {
  const res = await api.realFetch<BizCategoryApi[]>('/biz/public/categories');
  return (res ?? []).map((c) => ({
    code: c.code,
    groupCode: c.group_code,
    groupLabelKo: c.group_label_ko,
    groupLabelVi: c.group_label_vi,
    groupLabelEn: c.group_label_en,
    icon: c.icon,
    labelKo: c.label_ko,
    labelVi: c.label_vi,
    labelEn: c.label_en,
    sortOrder: c.sort_order,
  }));
}

/** BizCategory 의 현재 언어 라벨 (localizedName 패턴 미러) */
export function bizCategoryLabel(cat: BizCategory, lang: string): string {
  const l = lang as 'ko' | 'vi' | 'en';
  return (l === 'ko' ? cat.labelKo : l === 'vi' ? cat.labelVi : cat.labelEn) || cat.labelEn || cat.labelKo;
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
  /** 최신 업체 소식 (business_news) — 없으면 null. 지도 말풍선에 노출. */
  latestNews: { title: string; createdAt: string; photos: string[] } | null;
}

interface BizMapItemApi {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: string | number;
  lng: string | number;
  photo_url: string | null;
  latest_news: { title: string; created_at: string; photos: string[] } | null;
}

export async function fetchBizMapItems(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: string;
  q?: string;
  signal?: AbortSignal;
}): Promise<BizMapItem[]> {
  const qs = new URLSearchParams({
    min_lat: String(params.minLat),
    max_lat: String(params.maxLat),
    min_lng: String(params.minLng),
    max_lng: String(params.maxLng),
  });
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  qs.set('size', '100');
  const all: BizMapItemApi[] = [];
  let page = 1;
  for (;;) {
    qs.set('page', String(page));
    const res = await api.realFetch<{ items: BizMapItemApi[]; has_more: boolean }>(
      `/biz/public/map?${qs}`,
      { signal: params.signal },
    );
    all.push(...(res.items ?? []));
    if (!res.has_more) break;
    page++;
  }
  return all.map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    address: b.address,
    lat: Number(b.lat),
    lng: Number(b.lng),
    photoUrl: b.photo_url,
    latestNews: b.latest_news
      ? { title: b.latest_news.title, createdAt: b.latest_news.created_at, photos: b.latest_news.photos ?? [] }
      : null,
  }));
}

// ── 실시간 열람 핑 (W2 포스트 패널) — Redis 30s 윈도우, 응답 = 현재 열람 인원 ──

export async function pingBizView(profileId: string): Promise<number> {
  const res = await api.realFetch<{ viewer_count: number }>(
    `/biz/public/${profileId}/view-ping`,
    { method: 'POST' },
    'bff',
    { rethrow: true },
  );
  return res.viewer_count;
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

// ── 업체 소식 목록 (공개 프로필 '소식' 섹션) ─────────────────────

export interface BizNewsItem {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  photos: string[];
}

interface BizNewsItemApi {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  photos: string[];
}

export async function fetchBizPublicNews(
  profileId: string,
  params?: { limit?: number; offset?: number },
): Promise<BizNewsItem[]> {
  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 10),
    offset: String(params?.offset ?? 0),
  });
  const res = await api.realFetch<BizNewsItemApi[]>(`/biz/public/${profileId}/news?${qs}`);
  return (res ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    createdAt: n.created_at,
    photos: n.photos ?? [],
  }));
}

// ── 업체 후기 (동네지도 + 메뉴 '후기쓰기' 실배선) ─────────────────

export interface BizReview {
  id: string;
  rating: number;
  body: string;
  createdAt: string;
  reviewerNickname: string | null;
}

export interface BizReviewList {
  reviews: BizReview[];
  total: number;
  avgRating: number | null;
  hasMore: boolean;
}

interface BizReviewApi {
  id: string;
  rating: number;
  body: string;
  created_at: string;
  reviewer_nickname: string | null;
}

function fromBizReviewApi(r: BizReviewApi): BizReview {
  return { id: r.id, rating: r.rating, body: r.body, createdAt: r.created_at, reviewerNickname: r.reviewer_nickname };
}

export async function fetchBizReviews(
  profileId: string,
  params?: { limit?: number; offset?: number },
): Promise<BizReviewList> {
  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 20),
    offset: String(params?.offset ?? 0),
  });
  const res = await api.realFetch<{
    reviews: BizReviewApi[];
    total: number;
    avg_rating: number | null;
    has_more: boolean;
  }>(`/biz/public/${profileId}/reviews?${qs}`);
  return {
    reviews: (res.reviews ?? []).map(fromBizReviewApi),
    total: res.total,
    avgRating: res.avg_rating,
    hasMore: res.has_more,
  };
}

/** 이 업체에 내가 남긴 후기 — 없으면 null (작성 시트 프리필용) */
export async function fetchMyBizReview(profileId: string): Promise<BizReview | null> {
  const res = await api.realFetch<BizReviewApi | null>(
    `/biz/public/${profileId}/reviews/mine`, undefined, 'bff', { rethrow: true },
  );
  return res ? fromBizReviewApi(res) : null;
}

/** 후기 작성/재작성 (서버 upsert — 기존 후기가 있으면 갱신) */
export async function upsertBizReview(
  profileId: string,
  input: { rating: number; body: string },
): Promise<BizReview> {
  const res = await api.realFetch<BizReviewApi>(`/biz/public/${profileId}/reviews`, {
    method: 'POST',
    body: JSON.stringify(input),
  }, 'bff', { rethrow: true });
  return fromBizReviewApi(res);
}

// ── 관심 업체 (P-FE 동네지도 프로필 실배선) ───────────────────────

export interface BizFavorite {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: number;
  lng: number;
  photoUrl: string | null;
  latestNews: { title: string; createdAt: string; photos: string[] } | null;
  favoritedAt: string;
}

interface BizFavoriteApi {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: string | number;
  lng: string | number;
  photo_url: string | null;
  latest_news: { title: string; created_at: string; photos: string[] } | null;
  favorited_at: string;
}

export async function fetchBizFavorites(): Promise<BizFavorite[]> {
  const res = await api.realFetch<BizFavoriteApi[]>('/biz/favorites');
  return (res ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    address: b.address,
    lat: Number(b.lat),
    lng: Number(b.lng),
    photoUrl: b.photo_url,
    latestNews: b.latest_news
      ? { title: b.latest_news.title, createdAt: b.latest_news.created_at, photos: b.latest_news.photos ?? [] }
      : null,
    favoritedAt: b.favorited_at,
  }));
}

export async function addBizFavorite(id: string): Promise<boolean> {
  const res = await api.realFetch<{ favorited: boolean }>(`/biz/favorites/${id}`, { method: 'POST' }, 'bff', { rethrow: true });
  return res.favorited;
}

export async function removeBizFavorite(id: string): Promise<boolean> {
  const res = await api.realFetch<{ favorited: boolean }>(`/biz/favorites/${id}`, { method: 'DELETE' }, 'bff', { rethrow: true });
  return res.favorited;
}
