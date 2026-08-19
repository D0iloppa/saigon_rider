import { api } from './client';
import { transformAd, type MarketAd } from './market';

export type BusinessProfileStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

/** 검증축 (사업자등록증) — 계정 승인축 status 와 별개 */
export type BizVerificationStatus = 'pending' | 'docs_submitted' | 'verified' | 'rejected';

export interface BusinessProfile {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  intro: string | null;
  photoContentId: string | null;
  photoUrl: string | null;
  status: BusinessProfileStatus;
  rejectReason: string | null;
  verificationStatus: BizVerificationStatus;
  bizLicenseContentId: string | null;
  signboardContentId: string | null;
  repName: string | null;
  verifiedAt: string | null;
  verificationRejectReason: string | null;
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
  intro?: string | null;
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
  intro: string | null;
  photo_content_id: string | null;
  photo_url: string | null;
  status: BusinessProfileStatus;
  reject_reason: string | null;
  verification_status: BizVerificationStatus;
  biz_license_content_id: string | null;
  signboard_content_id: string | null;
  rep_name: string | null;
  verified_at: string | null;
  verification_reject_reason: string | null;
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
    intro: p.intro,
    photoContentId: p.photo_content_id,
    photoUrl: p.photo_url,
    status: p.status,
    rejectReason: p.reject_reason,
    verificationStatus: p.verification_status ?? 'pending',
    bizLicenseContentId: p.biz_license_content_id,
    signboardContentId: p.signboard_content_id,
    repName: p.rep_name,
    verifiedAt: p.verified_at,
    verificationRejectReason: p.verification_reject_reason,
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
    intro: p.intro ?? null,
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

// ── 사업자 검증 문서 제출 (W1 계약) ──────────────────────────────

export interface BizVerificationInput {
  profileId: string;
  /** contents 라우터로 선업로드한 사업자등록증 content UUID (필수) */
  bizLicenseContentId: string;
  signboardContentId?: string | null;
  repName?: string | null;
}

export async function submitBizVerification(input: BizVerificationInput): Promise<BusinessProfile> {
  const res = await api.realFetch<BusinessProfileApi>('/biz/verification', {
    method: 'POST',
    body: JSON.stringify({
      profile_id: input.profileId,
      biz_license_content_id: input.bizLicenseContentId,
      signboard_content_id: input.signboardContentId ?? null,
      rep_name: input.repName ?? null,
    }),
  }, 'bff', { rethrow: true });
  return fromApi(res);
}

// ── 파트너 광고 (SGR-312 BP-4) ─────────────────────────────────

export type BusinessAdStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'STOPPED';

/** 결제/계약 상태 — 웹 계약(IAP 회피) 플로우 노출 판단용. 백엔드 미제공 시 null. */
export type BizAdSubscriptionStatus = 'pending_payment' | 'active' | 'expired';

export interface AdTier {
  id: string;
  name: string;
  monthlyPriceVnd: number;
  exposureWeight: number;
  displayOrder: number;
  /** 티어 혜택 불릿 (features_json) — 플랜 피커 표시용 */
  features: string[];
}

export interface BusinessAd {
  id: string;
  profileId: string | null;
  tierId: string;
  tierName: string;
  monthlyPriceSnapshotVnd: number;
  title: string;
  body: string | null;
  imageUrl: string | null;
  reviewStatus: BusinessAdStatus;
  rejectReason: string | null;
  isOngoing: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  subscriptionStatus: BizAdSubscriptionStatus | null;
}

export interface BusinessAdInput {
  profileId: string;
  tierId: string;
  title: string;
  body?: string | null;
  imageContentId: string;
  /** true(기본)면 상시 게시 — 서버가 ends_at 무시. starts_at 은 서버가 승인 시점에 세팅. */
  isOngoing: boolean;
  endsAt?: string | null;
}

interface BusinessAdApi {
  id: string;
  profile_id: string | null;
  tier_id: string;
  tier_name: string;
  monthly_price_snapshot_vnd: number;
  title: string;
  body: string | null;
  image_url: string | null;
  review_status: BusinessAdStatus;
  reject_reason: string | null;
  is_ongoing: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  subscription_status: BizAdSubscriptionStatus | null;
}

function fromAdApi(a: BusinessAdApi): BusinessAd {
  return {
    id: a.id,
    profileId: a.profile_id,
    tierId: a.tier_id,
    tierName: a.tier_name,
    monthlyPriceSnapshotVnd: a.monthly_price_snapshot_vnd,
    title: a.title,
    body: a.body,
    imageUrl: a.image_url,
    reviewStatus: a.review_status,
    rejectReason: a.reject_reason,
    isOngoing: a.is_ongoing ?? true,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    createdAt: a.created_at,
    subscriptionStatus: a.subscription_status ?? null,
  };
}

interface AdTierApi {
  id: string;
  name: string;
  monthly_price_vnd: number;
  exposure_weight: number;
  display_order: number;
  features_json: string[] | null;
}

export async function fetchAdTiers(): Promise<AdTier[]> {
  const res = await api.realFetch<AdTierApi[]>('/biz/ad-tiers', undefined, 'bff', { rethrow: true });
  return res
    .map((tier) => ({
      id: tier.id,
      name: tier.name,
      monthlyPriceVnd: tier.monthly_price_vnd,
      exposureWeight: tier.exposure_weight,
      displayOrder: tier.display_order,
      features: tier.features_json ?? [],
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function createBusinessAd(input: BusinessAdInput): Promise<BusinessAd> {
  const res = await api.realFetch<BusinessAdApi>('/biz/ads', {
    method: 'POST',
    body: JSON.stringify({
      profile_id: input.profileId,
      tier_id: input.tierId,
      title: input.title,
      body: input.body ?? null,
      image_content_id: input.imageContentId,
      is_ongoing: input.isOngoing,
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

// #27(013/016 §8 L5) — 업체 전용 이슈 채널. ad_id 만 넘기면 서버가 계약 컨텍스트
// (계약ID·지면·기간)를 own_ad() 소유권 검증 결과에서 자동 첨부한다(사용자 직접 입력 없음).
export interface BizIssueTicket {
  id: string;
  title: string;
  status: string;
  severity: string | null;
  source: string;
}

interface BizIssueTicketApi {
  id: string;
  title: string;
  status: string;
  severity: string | null;
  source: string;
}

export async function createBizIssue(input: { adId: string; title: string; body: string }): Promise<BizIssueTicket> {
  const res = await api.realFetch<BizIssueTicketApi>('/biz/issues', {
    method: 'POST',
    body: JSON.stringify({ ad_id: input.adId, title: input.title, body: input.body }),
  }, 'bff', { rethrow: true });
  return { id: res.id, title: res.title, status: res.status, severity: res.severity, source: res.source };
}

/** 웹 계약(결제) 링크 발급 — Apple IAP 리스크 회피, business.saigon-rider.com 에서 처리 (외부 브라우저로 열 것). */
export async function fetchContractLink(id: string): Promise<{ url: string }> {
  return api.realFetch<{ url: string }>(`/biz/ads/${id}/contract-link`, { method: 'POST' }, 'bff', { rethrow: true });
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

/** 업체가 속한 최근접 ward명 로케일 선택 — 매칭 ward 없으면(전부 null) null 반환. */
export function bizWardLabel(biz: BizMapItem, lang: string): string | null {
  const l = lang as 'ko' | 'vi' | 'en';
  return (
    (l === 'ko' ? biz.wardNameKo : l === 'vi' ? biz.wardNameVi : biz.wardNameEn) ||
    biz.wardNameEn ||
    biz.wardNameKo ||
    biz.wardNameVi
  );
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
  /** 좌표 기반 최근접 ward 조회 결과 — 매칭 ward 없으면 전부 null. bizWardLabel()로 로케일 선택. */
  wardNameKo: string | null;
  wardNameVi: string | null;
  wardNameEn: string | null;
  /** 당근형 리치 카드 — 평균 별점 (후기 없으면 null) */
  rating: number | null;
  reviewCount: number;
  /** 단골(팔로우) 수 — 찜(favorite)과 별개 */
  followerCount: number;
  /** 찜(관심) 수 — 단골(follower)과 별개 */
  favoriteCount: number;
  /** 최신 후기 프리뷰 1~2건 (본문은 서버에서 120자 컷) */
  reviewPreviews: { rating: number; body: string }[];
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
  ward_name_ko: string | null;
  ward_name_vi: string | null;
  ward_name_en: string | null;
  rating: number | null;
  review_count: number;
  follower_count: number;
  favorite_count: number;
  review_previews: { rating: number; body: string }[] | null;
}

export async function fetchBizMapItems(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: string;
  q?: string;
  lat?: number;
  lng?: number;
  signal?: AbortSignal;
  maxItems?: number;
}): Promise<BizMapItem[]> {
  const qs = new URLSearchParams({
    min_lat: String(params.minLat),
    max_lat: String(params.maxLat),
    min_lng: String(params.minLng),
    max_lng: String(params.maxLng),
  });
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  // S-5: 조회자 위치가 있으면 백엔드가 거리순 정렬(없으면 id.asc() 폴백).
  if (params.lat != null) qs.set('lat', String(params.lat));
  if (params.lng != null) qs.set('lng', String(params.lng));
  qs.set('size', String(Math.min(100, params.maxItems ?? 100)));
  const all: BizMapItemApi[] = [];
  let page = 1;
  for (;;) {
    qs.set('page', String(page));
    const res = await api.realFetch<{ items: BizMapItemApi[]; has_more: boolean }>(
      `/biz/public/map?${qs}`,
      { signal: params.signal },
    );
    all.push(...(res.items ?? []));
    if (!res.has_more || (params.maxItems != null && all.length >= params.maxItems)) break;
    page++;
  }
  const limited = params.maxItems == null ? all : all.slice(0, params.maxItems);
  return limited.map((b) => ({
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
    wardNameKo: b.ward_name_ko,
    wardNameVi: b.ward_name_vi,
    wardNameEn: b.ward_name_en,
    rating: b.rating ?? null,
    reviewCount: b.review_count ?? 0,
    followerCount: b.follower_count ?? 0,
    favoriteCount: b.favorite_count ?? 0,
    reviewPreviews: b.review_previews ?? [],
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
  intro: string | null;
  photoUrl: string | null;
  ads: MarketAd[];
  /** 단골(팔로우, init/152) — 찜(favorite)과 별개 개념 */
  followerCount: number;
  isFollowing: boolean;
  isOwner: boolean;
}

interface BusinessPublicProfileApi {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  phone: string | null;
  intro: string | null;
  photo_url: string | null;
  ads: any[];
  follower_count: number;
  is_following: boolean;
  is_owner: boolean;
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
    intro: res.intro,
    photoUrl: res.photo_url,
    ads: (res.ads ?? []).map(transformAd),
    followerCount: res.follower_count ?? 0,
    isFollowing: res.is_following ?? false,
    isOwner: res.is_owner ?? false,
  };
}

/** 업체 단골(팔로우) 맺기 — 찜과 별개 (init/152) */
export async function followBusiness(id: string): Promise<boolean> {
  const res = await api.realFetch<{ following: boolean }>(`/biz/follow/${id}`, { method: 'POST' }, 'bff', { rethrow: true });
  return res.following;
}

/** 업체 단골(팔로우) 해제 */
export async function unfollowBusiness(id: string): Promise<boolean> {
  const res = await api.realFetch<{ following: boolean }>(`/biz/follow/${id}`, { method: 'DELETE' }, 'bff', { rethrow: true });
  return res.following;
}

// ── 업체 소식 목록 (공개 프로필 '소식' 섹션) ─────────────────────

export interface BizNewsItem {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  photos: string[];
  /** photos 와 같은 순서(sort_order)의 병렬 배열 — 수정 화면이 기존 사진 집합을 재제출할 때 씀 (T4) */
  photoContentIds: string[];
}

interface BizNewsItemApi {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  photos: string[];
  photo_content_ids?: string[];
}

function fromBizNewsItemApi(n: BizNewsItemApi): BizNewsItem {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    createdAt: n.created_at,
    photos: n.photos ?? [],
    photoContentIds: n.photo_content_ids ?? [],
  };
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
  return (res ?? []).map(fromBizNewsItemApi);
}

/** 업체 소식 작성 (오너) — photoContentIds 는 /contents/upload 로 선업로드한 UUID */
export async function createBizNews(input: {
  profileId: string;
  title: string;
  body?: string | null;
  photoContentIds?: string[];
}): Promise<BizNewsItem> {
  const res = await api.realFetch<BizNewsItemApi>('/biz/news', {
    method: 'POST',
    body: JSON.stringify({
      profile_id: input.profileId,
      title: input.title,
      body: input.body ?? null,
      photo_content_ids: input.photoContentIds ?? [],
    }),
  }, 'bff', { rethrow: true });
  return fromBizNewsItemApi(res);
}

/** 업체 소식 수정 (오너) — photoContentIds 를 생략하면 기존 사진을 유지한다 */
export async function updateBizNews(
  newsId: string,
  input: { title: string; body?: string | null; photoContentIds?: string[] },
): Promise<BizNewsItem> {
  const res = await api.realFetch<BizNewsItemApi>(`/biz/news/${newsId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: input.title,
      body: input.body ?? null,
      photo_content_ids: input.photoContentIds ?? null,
    }),
  }, 'bff', { rethrow: true });
  return fromBizNewsItemApi(res);
}

/** 업체 소식 삭제 (오너) */
export async function deleteBizNews(newsId: string): Promise<void> {
  await api.realFetch(`/biz/news/${newsId}`, { method: 'DELETE' }, 'bff', { rethrow: true });
}

// ── 홈 '업체 소식' 피드 (여러 업체 최신 소식, 업체당 1건) ─────────

export interface BizNewsFeedItem {
  profileId: string;
  profileName: string;
  category: string | null;
  photoUrl: string | null;
  newsId: string;
  title: string;
  createdAt: string;
  photos: string[];
}

interface BizNewsFeedItemApi {
  profile_id: string;
  profile_name: string;
  category: string | null;
  photo_url: string | null;
  news_id: string;
  title: string;
  created_at: string;
  photos: string[];
}

export async function fetchBizNewsFeed(limit?: number): Promise<BizNewsFeedItem[]> {
  const qs = new URLSearchParams();
  if (limit != null) qs.set('limit', String(limit));
  const res = await api.realFetch<BizNewsFeedItemApi[]>(`/biz/public/news/recent?${qs}`);
  return (res ?? []).map((n) => ({
    profileId: n.profile_id,
    profileName: n.profile_name,
    category: n.category,
    photoUrl: n.photo_url,
    newsId: n.news_id,
    title: n.title,
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
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  // 운영자 조치(숨김) 여부 — /reviews/mine 응답에만 실려 온다(공개 목록엔 숨김 후기가 안 나옴).
  hiddenAt: string | null;
  hiddenReason: string | null;
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
  owner_reply: string | null;
  owner_replied_at: string | null;
  hidden_at?: string | null;
  hidden_reason?: string | null;
}

function fromBizReviewApi(r: BizReviewApi): BizReview {
  return {
    id: r.id,
    rating: r.rating,
    body: r.body,
    createdAt: r.created_at,
    reviewerNickname: r.reviewer_nickname,
    ownerReply: r.owner_reply ?? null,
    ownerRepliedAt: r.owner_replied_at ?? null,
    hiddenAt: r.hidden_at ?? null,
    hiddenReason: r.hidden_reason ?? null,
  };
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

/** 내 후기 삭제 (되돌릴 수 없음) — 남의 후기는 서버가 404 로 응답 */
export async function deleteBizReview(profileId: string, reviewId: string): Promise<void> {
  await api.realFetch(`/biz/public/${profileId}/reviews/${reviewId}`, { method: 'DELETE' }, 'bff', { rethrow: true });
}

/** 업체 답글 작성/수정 (오너, upsert) — 후기당 1개 */
export async function upsertBizReviewReply(profileId: string, reviewId: string, body: string): Promise<BizReview> {
  const res = await api.realFetch<BizReviewApi>(`/biz/public/${profileId}/reviews/${reviewId}/reply`, {
    method: 'PUT',
    body: JSON.stringify({ body }),
  }, 'bff', { rethrow: true });
  return fromBizReviewApi(res);
}

/** 업체 답글 삭제 (오너) */
export async function deleteBizReviewReply(profileId: string, reviewId: string): Promise<void> {
  await api.realFetch(`/biz/public/${profileId}/reviews/${reviewId}/reply`, { method: 'DELETE' }, 'bff', { rethrow: true });
}

// ── 오너 전용 후기 목록 (파트너 라운지, W2 T2/T3) ─────────────────
// 소비자 공개 목록(fetchBizReviews)과 별도 엔드포인트 — 숨김 후기 포함 + is_reported_by_me/미답변 필터.

export interface BizOwnerReview {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  reviewerNickname: string | null;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  /** 운영자 조치로 숨겨진 후기 — true 면 body 는 항상 null(원문 블라인드) */
  hidden: boolean;
  /** 오너 본인이 이 후기를 신고했는지 — 타인의 신고 여부는 절대 포함되지 않는다 */
  isReportedByMe: boolean;
}

export interface BizOwnerReviewList {
  reviews: BizOwnerReview[];
  total: number;
  /** 필터와 무관하게 항상 전체 미답변(owner_reply IS NULL) 건수 — W4 파트너 요약 카드 배지용 */
  unansweredCount: number;
  /** 소비자 공개 목록과 동일 기준(숨김 제외) 평균 별점 */
  avgRating: number | null;
  hasMore: boolean;
}

interface BizOwnerReviewApi {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  reviewer_nickname: string | null;
  owner_reply: string | null;
  owner_replied_at: string | null;
  hidden: boolean;
  is_reported_by_me: boolean;
}

/** 파트너 라운지(오너) 후기 목록 — GET /biz/reviews. unansweredOnly=true 면 owner_reply IS NULL 만. */
export async function fetchBizOwnerReviews(
  profileId: string,
  params?: { limit?: number; offset?: number; unansweredOnly?: boolean },
): Promise<BizOwnerReviewList> {
  const qs = new URLSearchParams({
    profile_id: profileId,
    limit: String(params?.limit ?? 20),
    offset: String(params?.offset ?? 0),
    unanswered_only: String(params?.unansweredOnly ?? false),
  });
  const res = await api.realFetch<{
    reviews: BizOwnerReviewApi[];
    total: number;
    unanswered_count: number;
    avg_rating: number | null;
    has_more: boolean;
  }>(`/biz/reviews?${qs}`, undefined, 'bff', { rethrow: true });
  return {
    reviews: (res.reviews ?? []).map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.created_at,
      reviewerNickname: r.reviewer_nickname,
      ownerReply: r.owner_reply ?? null,
      ownerRepliedAt: r.owner_replied_at ?? null,
      hidden: r.hidden,
      isReportedByMe: r.is_reported_by_me,
    })),
    total: res.total,
    unansweredCount: res.unanswered_count,
    avgRating: res.avg_rating,
    hasMore: res.has_more,
  };
}

export type BizReviewReportReason = 'SPAM' | 'ABUSE' | 'INAPPROPRIATE' | 'OTHER';

// rethrow:true — 중복 신고(409 "already reported")는 호출부가 친절한 문구로 처리한다.
// 안 주면 client.ts 가 전역 토스트로 원문을 먼저 띄우고 호출부가 한 번 더 띄워 토스트가 2개 뜬다.
export async function reportBizReview(
  profileId: string,
  reviewId: string,
  reason: BizReviewReportReason,
  note?: string,
): Promise<void> {
  await api.realFetch(`/biz/public/${profileId}/reviews/${reviewId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, note: note ?? null }),
  }, 'bff', { rethrow: true });
}

// 후기 숨김 조치 이의제기 (작성자 본인만, 대표 지적 2026-08-18) — 운영자가 조치하면서 통보한
// hidden_reason 을 반박하는 창구. rethrow:true — 400(숨김 아님/본문 공백)·404(본인 아님/후기 없음)를
// 호출부가 문구로 처리한다.
export async function appealBizReview(profileId: string, reviewId: string, body: string): Promise<void> {
  await api.realFetch(`/biz/public/${profileId}/reviews/${reviewId}/appeal`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  }, 'bff', { rethrow: true });
}

export type BizReportReason =
  | 'FALSE_ADVERTISING'
  | 'PRICE_MISMATCH'
  | 'POOR_SERVICE'
  | 'IMPERSONATION'
  | 'HEALTH_SAFETY'
  | 'OTHER';

// 소비자 → 업체 신고 (대표 지적 2026-08-18) — 업체→후기/소비자 방향은 있었지만 이 방향만 없던 갭.
// rethrow:true — 중복 신고(409 "already reported")는 호출부가 친절한 문구로 처리한다.
// 안 주면 client.ts 가 전역 토스트로 원문을 먼저 띄우고 호출부가 한 번 더 띄워 토스트가 2개 뜬다.
export async function reportBusiness(profileId: string, reason: BizReportReason, note?: string): Promise<void> {
  await api.realFetch(`/biz/public/${profileId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, note: note ?? null }),
  }, 'bff', { rethrow: true });
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

// ── 단골(팔로우, 소식 구독) — 찜(favorite)과 별개 개념 (SGR-330) ──────

export interface BizFollow {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: number;
  lng: number;
  photoUrl: string | null;
  latestNews: { title: string; createdAt: string; photos: string[] } | null;
  followedAt: string;
}

interface BizFollowApi {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: string | number;
  lng: string | number;
  photo_url: string | null;
  latest_news: { title: string; created_at: string; photos: string[] } | null;
  followed_at: string;
}

export async function fetchBizFollows(): Promise<BizFollow[]> {
  const res = await api.realFetch<BizFollowApi[]>('/biz/follow');
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
    followedAt: b.followed_at,
  }));
}

// ── 광고 성과 대시보드 요약 (ai-docs/spec/ad-performance-metrics.md §7/§8 B-9) ─────

export type BizAdStatsState = 'no_ads' | 'pending' | 'warming_up' | 'low_sample' | 'normal';
export type BizAdStatsPeriod = '7d' | '30d' | 'all';

export interface BizAdStatsSummary {
  state: BizAdStatsState;
  period: BizAdStatsPeriod;
  periodDays: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctaCall: number;
  ctaFollow: number;
  ctaFavorite: number;
  ctaReview: number;
  primaryCtaTotal: number;
  ctaSecondary: number;
  minSampleForRatio: number;
  ctr: number | null;
  cvr: number | null;
  adSpendVnd: number | null;
  cpmVnd: number | null;
  cpcVnd: number | null;
  cpaVnd: number | null;
  /** 현재 게시 중인 광고가 없고 과거에 게시된 적만 있음 — §7-3 F "게시 종료" 배지용 */
  isEnded: boolean;
  adStartedAt: string | null;
  adEndsAt: string | null;
}

interface BizAdStatsSummaryApi {
  state: BizAdStatsState;
  period: BizAdStatsPeriod;
  period_days: number;
  impressions: number;
  reach: number;
  clicks: number;
  cta_call: number;
  cta_follow: number;
  cta_favorite: number;
  cta_review: number;
  primary_cta_total: number;
  cta_secondary: number;
  min_sample_for_ratio: number;
  ctr: number | null;
  cvr: number | null;
  ad_spend_vnd: number | null;
  cpm_vnd: number | null;
  cpc_vnd: number | null;
  cpa_vnd: number | null;
  is_ended: boolean;
  ad_started_at: string | null;
  ad_ends_at: string | null;
}

export async function fetchBizAdStatsSummary(
  profileId: string,
  period: BizAdStatsPeriod = '7d',
): Promise<BizAdStatsSummary> {
  const res = await api.realFetch<BizAdStatsSummaryApi>(
    `/biz/profiles/${profileId}/ad-stats-summary?period=${period}`,
    undefined,
    'bff',
    { rethrow: true },
  );
  return {
    state: res.state,
    period: res.period,
    periodDays: res.period_days,
    impressions: res.impressions,
    reach: res.reach,
    clicks: res.clicks,
    ctaCall: res.cta_call,
    ctaFollow: res.cta_follow,
    ctaFavorite: res.cta_favorite,
    ctaReview: res.cta_review,
    primaryCtaTotal: res.primary_cta_total,
    ctaSecondary: res.cta_secondary,
    minSampleForRatio: res.min_sample_for_ratio,
    ctr: res.ctr,
    cvr: res.cvr,
    adSpendVnd: res.ad_spend_vnd,
    cpmVnd: res.cpm_vnd,
    cpcVnd: res.cpc_vnd,
    cpaVnd: res.cpa_vnd,
    isEnded: res.is_ended,
    adStartedAt: res.ad_started_at,
    adEndsAt: res.ad_ends_at,
  };
}

// ── 광고 성과 시계열 (일별 배열 + 직전 동기간 비교 + 광고별 분해) ─────

export type BizAdStatsSeriesPeriod = '7d' | '14d' | '30d';

export interface BizAdStatsSeriesPoint {
  /** YYYY-MM-DD (VN 기준 일자) */
  date: string;
  impressions: number;
  reach: number;
  clicks: number;
  ctaPrimary: number;
  ctaSecondary: number;
}

export interface BizAdStatsSeriesTotals {
  impressions: number;
  reach: number;
  clicks: number;
  ctaCall: number;
  ctaFollow: number;
  ctaFavorite: number;
  ctaReview: number;
  ctaPrimary: number;
  ctaSecondary: number;
}

export interface BizAdStatsSeriesPrevious {
  impressions: number;
  reach: number;
  clicks: number;
  ctaPrimary: number;
  ctaSecondary: number;
}

export interface BizAdStatsByAd {
  adId: string;
  title: string;
  impressions: number;
  reach: number;
  clicks: number;
  ctaPrimary: number;
  spendVnd: number;
  reviewStatus: string;
  isEnded: boolean;
}

export interface BizAdStatsSeries {
  period: BizAdStatsSeriesPeriod;
  periodDays: number;
  series: BizAdStatsSeriesPoint[];
  totals: BizAdStatsSeriesTotals;
  previous: BizAdStatsSeriesPrevious;
  byAd: BizAdStatsByAd[];
  spendVnd: number;
  minSampleForRatio: number;
  ctr: number | null;
  cvr: number | null;
  cpmVnd: number | null;
  cpcVnd: number | null;
  cpaVnd: number | null;
}

interface BizAdStatsSeriesApi {
  period: BizAdStatsSeriesPeriod;
  period_days: number;
  series: {
    date: string;
    impressions: number;
    reach: number;
    clicks: number;
    cta_primary: number;
    cta_secondary: number;
  }[];
  totals: {
    impressions: number;
    reach: number;
    clicks: number;
    cta_call: number;
    cta_follow: number;
    cta_favorite: number;
    cta_review: number;
    cta_primary: number;
    cta_secondary: number;
  };
  previous: {
    impressions: number;
    reach: number;
    clicks: number;
    cta_primary: number;
    cta_secondary: number;
  };
  by_ad: {
    ad_id: string;
    title: string;
    impressions: number;
    reach: number;
    clicks: number;
    cta_primary: number;
    spend_vnd: number;
    review_status: string;
    is_ended: boolean;
  }[];
  spend_vnd: number;
  min_sample_for_ratio: number;
  ctr: number | null;
  cvr: number | null;
  cpm_vnd: number | null;
  cpc_vnd: number | null;
  cpa_vnd: number | null;
}

export async function fetchBizAdStatsSeries(
  profileId: string,
  period: BizAdStatsSeriesPeriod = '7d',
): Promise<BizAdStatsSeries> {
  const res = await api.realFetch<BizAdStatsSeriesApi>(
    `/biz/profiles/${profileId}/ad-stats-series?period=${period}`,
    undefined,
    'bff',
    { rethrow: true },
  );
  return {
    period: res.period,
    periodDays: res.period_days,
    series: res.series.map((p) => ({
      date: p.date,
      impressions: p.impressions,
      reach: p.reach,
      clicks: p.clicks,
      ctaPrimary: p.cta_primary,
      ctaSecondary: p.cta_secondary,
    })),
    totals: {
      impressions: res.totals.impressions,
      reach: res.totals.reach,
      clicks: res.totals.clicks,
      ctaCall: res.totals.cta_call,
      ctaFollow: res.totals.cta_follow,
      ctaFavorite: res.totals.cta_favorite,
      ctaReview: res.totals.cta_review,
      ctaPrimary: res.totals.cta_primary,
      ctaSecondary: res.totals.cta_secondary,
    },
    previous: {
      impressions: res.previous.impressions,
      reach: res.previous.reach,
      clicks: res.previous.clicks,
      ctaPrimary: res.previous.cta_primary,
      ctaSecondary: res.previous.cta_secondary,
    },
    byAd: res.by_ad.map((a) => ({
      adId: a.ad_id,
      title: a.title,
      impressions: a.impressions,
      reach: a.reach,
      clicks: a.clicks,
      ctaPrimary: a.cta_primary,
      spendVnd: a.spend_vnd,
      reviewStatus: a.review_status,
      isEnded: a.is_ended,
    })),
    spendVnd: res.spend_vnd,
    minSampleForRatio: res.min_sample_for_ratio,
    ctr: res.ctr,
    cvr: res.cvr,
    cpmVnd: res.cpm_vnd,
    cpcVnd: res.cpc_vnd,
    cpaVnd: res.cpa_vnd,
  };
}

// ── 업체 가격표 (공개 프로필 '가격' 섹션 + 파트너 라운지 등록) ───────

export interface BizPriceItem {
  id: string;
  name: string;
  priceVnd: number;
  sortOrder: number;
  createdAt: string;
}

interface BizPriceItemApi {
  id: string;
  name: string;
  price_vnd: number;
  sort_order: number;
  created_at: string;
}

export async function fetchBizPublicPrices(profileId: string): Promise<BizPriceItem[]> {
  const res = await api.realFetch<BizPriceItemApi[]>(`/biz/public/${profileId}/prices`);
  return (res ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    priceVnd: p.price_vnd,
    sortOrder: p.sort_order,
    createdAt: p.created_at,
  }));
}

/** 업체 가격표 항목 등록 (오너) */
export async function createBizPrice(input: { profileId: string; name: string; priceVnd: number }): Promise<BizPriceItem> {
  const res = await api.realFetch<BizPriceItemApi>('/biz/prices', {
    method: 'POST',
    body: JSON.stringify({ profile_id: input.profileId, name: input.name, price_vnd: input.priceVnd }),
  }, 'bff', { rethrow: true });
  return { id: res.id, name: res.name, priceVnd: res.price_vnd, sortOrder: res.sort_order, createdAt: res.created_at };
}

/** 업체 가격표 항목 삭제 (오너) */
export async function deleteBizPrice(priceId: string): Promise<void> {
  await api.realFetch(`/biz/prices/${priceId}`, { method: 'DELETE' }, 'bff', { rethrow: true });
}
