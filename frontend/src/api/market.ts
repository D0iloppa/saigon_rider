import i18n from '@/lib/i18n';
import { api } from './client';
import type { District } from './master';

export type ListingStatus = 'ON_SALE' | 'RESERVED' | 'SOLD';
export type ListingSort = 'recent' | 'price_low' | 'price_high' | 'distance';

export interface MarketCategory {
  id: number;
  code: string;
  name_ko: string;
  name_vi: string;
  name_en: string;
  icon: string | null;
  parent_id: number | null;
  depth: number;
  sort_order: number;
}

export interface CategoryNode extends MarketCategory {
  children: MarketCategory[];
}

/** flat 카테고리 목록 → 대분류(depth 0) + 자식(depth 1) 2-depth 트리 */
export function buildCategoryTree(flat: MarketCategory[]): CategoryNode[] {
  const byParent = new Map<number, MarketCategory[]>();
  for (const c of flat) {
    if (c.parent_id == null) continue;
    const arr = byParent.get(c.parent_id) ?? [];
    arr.push(c);
    byParent.set(c.parent_id, arr);
  }
  const bySort = (a: MarketCategory, b: MarketCategory) => a.sort_order - b.sort_order;
  return flat
    .filter((c) => c.parent_id == null)
    .sort(bySort)
    .map((top) => ({ ...top, children: (byParent.get(top.id) ?? []).sort(bySort) }));
}

export interface DistrictBrief {
  id: number;
  name_ko: string;
  name_vi: string;
  name_en: string;
}

export interface SellerBrief {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  level: number;
  mannerTemp: number;
  reviewCount: number;
  avgRating: number | null;
  responseRate: number | null;
  isPhoneVerified: boolean;
  isFollowing: boolean;
}

export interface CreateReviewParams {
  reviewerId: string;
  targetId: string;
  listingId?: string | null;
  rating: number; // 1~5
  mannerTags: string[];
  comment?: string;
}

export interface ListingCard {
  id: string;
  title: string;
  priceVnd: number;
  originalPriceVnd: number | null;
  isNegotiable: boolean;
  status: ListingStatus;
  categoryCode: string | null;
  thumbnailUrl: string | null;
  district: DistrictBrief | null;
  likeCount: number;
  bumpedAt: string;
  distanceM: number | null;
  lat: number | null;
  lng: number | null;
}

export interface ListingDetail {
  id: string;
  title: string;
  description: string | null;
  priceVnd: number;
  originalPriceVnd: number | null;
  isNegotiable: boolean;
  status: ListingStatus;
  category: MarketCategory | null;
  imageUrls: string[];
  seller: SellerBrief;
  district: DistrictBrief | null;
  likeCount: number;
  viewCount: number;
  createdAt: string;
  bumpedAt: string;
  liked: boolean;
  otherListings: ListingCard[];
}

/** {name_ko/vi/en} 객체의 현재 언어 이름 */
export function localizedName(obj: { name_ko: string; name_vi: string; name_en: string } | null): string {
  if (!obj) return '';
  const lang = i18n.language as 'ko' | 'vi' | 'en';
  return obj[`name_${lang}`] || obj.name_en || obj.name_ko;
}

export function transformCard(r: any): ListingCard {
  return {
    id: r.id,
    title: r.title,
    priceVnd: r.price_vnd,
    originalPriceVnd: r.original_price_vnd ?? null,
    isNegotiable: r.is_negotiable,
    status: r.status,
    categoryCode: r.category_code ?? null,
    thumbnailUrl: r.thumbnail_url ?? null,
    district: r.district ?? null,
    likeCount: r.like_count ?? 0,
    bumpedAt: r.bumped_at,
    distanceM: r.distance_m ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
  };
}

export interface ListingPage {
  items: ListingCard[];
  total: number;
  page: number;
  size: number;
}

export interface ListingQuery {
  category?: string;
  categoryId?: number | null;
  q?: string;
  sort?: ListingSort;
  hideSold?: boolean;
  priceMin?: number | null;
  priceMax?: number | null;
  lat?: number | null;
  lng?: number | null;
  wardId?: number | null;
  districtId?: number | null;
  viewerId?: string | null;
  sellerId?: string | null;
  page?: number;
  size?: number;
}

export type ReportReason = 'SPAM' | 'FRAUD' | 'PROHIBITED' | 'DUPLICATE' | 'OTHER';
export const REPORT_REASONS: ReportReason[] = ['FRAUD', 'PROHIBITED', 'SPAM', 'DUPLICATE', 'OTHER'];

export interface CreateListingParams {
  sellerId: string;
  categoryId?: number | null;
  title: string;
  description?: string;
  priceVnd: number;
  isNegotiable: boolean;
  districtId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  imageContentIds: string[];
}

export async function fetchCategories(): Promise<MarketCategory[]> {
  return api.realFetch<MarketCategory[]>('/market/categories');
}

export interface MarketAd {
  id: string;
  partnerName: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  phone: string | null;
  address: string | null;
  ownerId: string | null;
  districtId: number | null;
  category: string | null;
  rating: number | null;
  serviceCount: number | null;
  establishedYear: number | null;
  businessHours: string | null;
  isOpen: boolean | null;
}

function transformAd(a: any): MarketAd {
  return {
    id: a.id,
    partnerName: a.partner_name,
    title: a.title,
    body: a.body ?? null,
    imageUrl: a.image_url ?? null,
    linkUrl: a.link_url ?? null,
    phone: a.phone ?? null,
    address: a.address ?? null,
    ownerId: a.owner_id ?? null,
    districtId: a.district_id ?? null,
    category: a.category ?? null,
    rating: a.rating ?? null,
    serviceCount: a.service_count ?? null,
    establishedYear: a.established_year ?? null,
    businessHours: a.business_hours ?? null,
    isOpen: a.is_open ?? null,
  };
}

export async function fetchAds(districtId?: number | null): Promise<MarketAd[]> {
  const p = new URLSearchParams();
  if (districtId != null) p.set('district_id', String(districtId));
  p.set('lang', i18n.language);
  const raw = await api.realFetch<any[]>(`/market/ads?${p.toString()}`);
  return (raw ?? []).map(transformAd);
}

export async function fetchAd(id: string): Promise<MarketAd> {
  return transformAd(await api.realFetch<any>(`/market/ads/${id}?lang=${i18n.language}`));
}

export async function fetchListings(q: ListingQuery = {}): Promise<ListingPage> {
  const params = new URLSearchParams();
  if (q.category && q.category !== 'all') params.set('category', q.category);
  if (q.categoryId != null) params.set('category_id', String(q.categoryId));
  if (q.q && q.q.trim()) params.set('q', q.q.trim());
  if (q.sort) params.set('sort', q.sort);
  if (q.hideSold) params.set('hide_sold', 'true');
  if (q.lat != null && q.lng != null) {
    params.set('lat', String(q.lat));
    params.set('lng', String(q.lng));
  }
  if (q.priceMin != null) params.set('price_min', String(q.priceMin));
  if (q.priceMax != null) params.set('price_max', String(q.priceMax));
  if (q.wardId != null) params.set('ward_id', String(q.wardId));
  if (q.districtId != null) params.set('district_id', String(q.districtId));
  if (q.viewerId) params.set('viewer_id', q.viewerId);
  if (q.sellerId) params.set('seller_id', q.sellerId);
  params.set('lang', i18n.language);
  params.set('page', String(q.page ?? 1));
  params.set('size', String(q.size ?? 20));
  const raw = await api.realFetch<any>(`/market/listings?${params.toString()}`);
  return {
    items: (raw.items ?? []).map(transformCard),
    total: raw.total ?? 0,
    page: raw.page ?? 1,
    size: raw.size ?? 20,
  };
}

export async function updateListingStatus(
  id: string,
  sellerId: string,
  status: ListingStatus,
): Promise<{ id: string }> {
  return api.realFetch<{ id: string }>(`/market/listings/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ seller_id: sellerId, status }),
  });
}

/** 끌올 쿨다운 (BFF _BUMP_COOLDOWN 과 동일하게 유지) */
export const BUMP_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export async function bumpListing(id: string): Promise<{ id: string; bumped_at: string }> {
  return api.realFetch<{ id: string; bumped_at: string }>(`/market/listings/${id}/bump`, { method: 'POST' });
}

export async function updateListingPrice(id: string, sellerId: string, priceVnd: number): Promise<{ id: string }> {
  return api.realFetch<{ id: string }>(`/market/listings/${id}/price`, {
    method: 'PATCH',
    body: JSON.stringify({ seller_id: sellerId, price_vnd: priceVnd }),
  });
}

export async function reportListing(id: string, reason: ReportReason, note?: string): Promise<void> {
  await api.realFetch(`/market/listings/${id}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, note: note ?? null }),
  });
}

export async function blockUser(userId: string): Promise<void> {
  await api.realFetch(`/market/users/${userId}/block`, { method: 'POST' });
}

export async function unblockUser(userId: string): Promise<void> {
  await api.realFetch(`/market/users/${userId}/block`, { method: 'DELETE' });
}

export interface BlockedUser {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const raw = await api.realFetch<any[]>('/market/blocks');
  return raw.map((r) => ({ userId: r.user_id, nickname: r.nickname ?? null, avatarUrl: r.avatar_url ?? null }));
}

export async function createReview(p: CreateReviewParams): Promise<{ id: string; target_manner_temp: number }> {
  return api.realFetch('/market/reviews', {
    method: 'POST',
    body: JSON.stringify({
      reviewer_id: p.reviewerId,
      target_id: p.targetId,
      listing_id: p.listingId ?? null,
      rating: p.rating,
      manner_tags: p.mannerTags,
      comment: p.comment ?? null,
    }),
  });
}

export interface ReviewBrief {
  rating: number; // 1~5
  mannerTags: string[];
  comment: string | null;
  createdAt: string;
}

export interface TradeHistory {
  appointmentId: string;
  conversationId: string;
  listingId: string;
  listingTitle: string;
  thumbnailUrl: string | null;
  priceVnd: number;
  role: 'sold' | 'bought';
  counterpartId: string;
  counterpartNickname: string | null;
  counterpartAvatarUrl: string | null;
  completedAt: string;
  reviewLeft: boolean;
  myReview: ReviewBrief | null;
}

function transformReviewBrief(r: any): ReviewBrief {
  return {
    rating: Number(r.rating),
    mannerTags: r.manner_tags ?? [],
    comment: r.comment ?? null,
    createdAt: r.created_at,
  };
}

export async function fetchTrades(userId: string): Promise<TradeHistory[]> {
  const raw = await api.realFetch<any[]>(`/market/trades?user_id=${encodeURIComponent(userId)}`);
  return raw.map((r) => ({
    appointmentId: r.appointment_id,
    conversationId: r.conversation_id,
    listingId: r.listing_id,
    listingTitle: r.listing_title,
    thumbnailUrl: r.thumbnail_url ?? null,
    priceVnd: r.price_vnd,
    role: r.role,
    counterpartId: r.counterpart_id,
    counterpartNickname: r.counterpart_nickname ?? null,
    counterpartAvatarUrl: r.counterpart_avatar_url ?? null,
    completedAt: r.completed_at,
    reviewLeft: !!r.review_left,
    myReview: r.my_review ? transformReviewBrief(r.my_review) : null,
  }));
}

export async function fetchMyReview(listingId: string): Promise<ReviewBrief | null> {
  const raw = await api.realFetch<any>(`/market/reviews/mine?listing_id=${encodeURIComponent(listingId)}`);
  return raw ? transformReviewBrief(raw) : null;
}

export async function createListing(p: CreateListingParams): Promise<{ id: string }> {
  return api.realFetch<{ id: string }>('/market/listings', {
    method: 'POST',
    body: JSON.stringify({
      seller_id: p.sellerId,
      category_id: p.categoryId ?? null,
      title: p.title,
      description: p.description ?? null,
      price_vnd: p.priceVnd,
      is_negotiable: p.isNegotiable,
      district_id: p.districtId ?? null,
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      image_content_ids: p.imageContentIds,
    }),
  });
}

// HCMC 대략 bounding box — 벗어나면 위치 폴백
const HCMC_BBOX = { latMin: 10.35, latMax: 11.2, lngMin: 106.3, lngMax: 107.05 };

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** GPS → 가장 가까운 HCMC 구. HCMC bbox 밖이면 null (호출부에서 폴백) */
export function resolveDistrict(lat: number, lng: number, districts: District[]): District | null {
  if (lat < HCMC_BBOX.latMin || lat > HCMC_BBOX.latMax || lng < HCMC_BBOX.lngMin || lng > HCMC_BBOX.lngMax) {
    return null;
  }
  let best: District | null = null;
  let bestKm = Infinity;
  for (const d of districts) {
    if (d.center_lat == null || d.center_lng == null) continue;
    const km = haversineKm(lat, lng, d.center_lat, d.center_lng);
    if (km < bestKm) {
      bestKm = km;
      best = d;
    }
  }
  return best;
}

export async function fetchListing(id: string, userId?: string): Promise<ListingDetail> {
  const p = new URLSearchParams();
  if (userId) p.set('user_id', userId);
  p.set('lang', i18n.language);
  const r = await api.realFetch<any>(`/market/listings/${id}?${p.toString()}`);
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    priceVnd: r.price_vnd,
    originalPriceVnd: r.original_price_vnd ?? null,
    isNegotiable: r.is_negotiable,
    status: r.status,
    category: r.category ?? null,
    imageUrls: r.image_urls ?? [],
    seller: {
      id: r.seller.id,
      nickname: r.seller.nickname ?? null,
      avatarUrl: r.seller.avatar_url ?? null,
      level: r.seller.level ?? 1,
      mannerTemp: r.seller.manner_temp ?? 36.5,
      reviewCount: r.seller.review_count ?? 0,
      avgRating: r.seller.avg_rating ?? null,
      responseRate: r.seller.response_rate ?? null,
      isPhoneVerified: r.seller.is_phone_verified ?? false,
      isFollowing: r.seller.is_following ?? false,
    },
    district: r.district ?? null,
    likeCount: r.like_count ?? 0,
    viewCount: r.view_count ?? 0,
    createdAt: r.created_at,
    bumpedAt: r.bumped_at,
    liked: r.liked ?? false,
    otherListings: (r.other_listings ?? []).map(transformCard),
  };
}

export async function toggleLike(id: string, userId: string): Promise<{ liked: boolean; like_count: number }> {
  return api.realFetch(`/market/listings/${id}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function fetchWishlist(userId: string): Promise<ListingCard[]> {
  const raw = await api.realFetch<any[]>(`/market/wishlist?user_id=${encodeURIComponent(userId)}`);
  return raw.map(transformCard);
}

export interface KeywordAlert {
  id: string;
  keyword: string;
}

export async function fetchKeywordAlerts(userId: string): Promise<KeywordAlert[]> {
  return api.realFetch<KeywordAlert[]>(`/market/keyword-alerts?user_id=${encodeURIComponent(userId)}`);
}

export async function addKeywordAlert(userId: string, keyword: string): Promise<KeywordAlert> {
  return api.realFetch<KeywordAlert>('/market/keyword-alerts', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, keyword }),
  });
}

export async function removeKeywordAlert(id: string, userId: string): Promise<void> {
  await api.realFetch(`/market/keyword-alerts/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ user_id: userId }),
  });
}
