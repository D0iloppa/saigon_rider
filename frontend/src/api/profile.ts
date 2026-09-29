import { api, USE_MOCK } from './client';
import { DEFAULT_AVATAR_URL } from '@/lib/defaults';
import type { UserDto } from './auth';
import type { LoginResult } from './auth';
import type {
  BadgeWithEarned, PageResponse, ProfileReview, QuestHistoryItem, ReviewTagCount, RiderStyle, UserProfile, UserStats,
} from './types';

export async function fetchMe(phone: string): Promise<UserDto | null> {
  if (USE_MOCK) return null;
  try {
    const res = await api.realFetch<LoginResult>(`/auth/me?phone=${encodeURIComponent(phone)}`);
    return res.user;
  } catch {
    return null;
  }
}

export interface AvatarUpdateResult {
  user: UserDto;
  content_id: string;
}

export async function apiUploadAvatar(userId: string, file: File): Promise<AvatarUpdateResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('user_id', userId);
  return api.realFetchForm<AvatarUpdateResult>('/profile/avatar', form);
}

export async function apiSaveProfileSetup(
  userId: string,
  nickname: string,
  riderType: RiderStyle | null,
): Promise<UserDto> {
  return api.realFetch<UserDto>('/profile', {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId, nickname, rider_type: riderType ? riderType.toUpperCase() : null }),
  });
}

// F-9: 가입 시 약관/개인정보처리방침 동의 캡처 — ProfileSetup(신규가입 온보딩)에서만 호출.
// 응답의 consent_agreed_at 을 store 에 반영해야 재진입 게이트(PrivateRoute)가 바로 통과된다.
// age_confirmed(만 14세 이상, 약관 §1)는 별개 체크박스 — 서버가 없거나 false 면 동의 기록을 거부한다.
export async function apiSaveConsent(
  userId: string,
  termsVersion: string,
  privacyVersion: string,
  ageConfirmed: boolean,
): Promise<UserDto> {
  return api.realFetch<UserDto>('/profile/consent', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      age_confirmed: ageConfirmed,
    }),
  });
}

export async function fetchRandomNickname(): Promise<string> {
  const res = await api.realFetch<{ nickname: string }>('/profile/random-nickname');
  return res.nickname;
}

export interface NicknameCheckResult {
  available: boolean;
  nickname: string;
}

export async function checkNicknameAvailable(nickname: string): Promise<NicknameCheckResult> {
  return api.realFetch<NicknameCheckResult>(
    `/profile/check-nickname?nickname=${encodeURIComponent(nickname)}`,
    {},
    'bff',
    { silent: true },
  );
}

export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  const url = `/users/${userId}/profile`;

  if (USE_MOCK) {
    return {
      id: userId,
      nickname: 'MockUser',
      avatarUrl: DEFAULT_AVATAR_URL,
      level: 5,
      riderStyle: 'commuter',
      followerCount: 12,
      followingCount: 8,
      isFollowing: false,
      isFriend: false,
      isPhoneVerified: false,
      phoneMasked: null,
      memberSince: null,
      marketplaceSoldCount: 0,
      marketplaceReviewCount: 0,
      marketplaceAvgRating: null,
      trustTier: 'new',
      reviewSummary: { count: 0, avgRating: null, topTags: [], recent: [] },
    };
  }

  const res = await api.realFetch<{
    id: string;
    nickname: string | null;
    avatar_url: string | null;
    level: number;
    rider_style: string | null;
    follower_count: number;
    following_count: number;
    is_following: boolean;
    is_friend: boolean;
    is_phone_verified: boolean;
    phone_masked: string | null;
    member_since: string;
    marketplace_sold_count: number;
    marketplace_review_count: number;
    marketplace_avg_rating: number | null;
    trust_tier: UserProfile['trustTier'];
    review_summary: {
      count: number;
      avg_rating: number | null;
      top_tags: ReviewTagCount[];
      recent: RawProfileReview[];
    };
  }>(url);

  return {
    id: res.id,
    nickname: res.nickname,
    avatarUrl: res.avatar_url,
    level: res.level,
    riderStyle: res.rider_style,
    followerCount: res.follower_count,
    followingCount: res.following_count,
    isFollowing: res.is_following,
    isFriend: res.is_friend ?? false,
    isPhoneVerified: res.is_phone_verified ?? false,
    phoneMasked: res.phone_masked ?? null,
    memberSince: res.member_since ?? null,
    marketplaceSoldCount: res.marketplace_sold_count ?? 0,
    marketplaceReviewCount: res.marketplace_review_count ?? 0,
    marketplaceAvgRating: res.marketplace_avg_rating ?? null,
    trustTier: res.trust_tier,
    reviewSummary: {
      count: res.review_summary.count,
      avgRating: res.review_summary.avg_rating,
      topTags: res.review_summary.top_tags,
      recent: res.review_summary.recent.map(toProfileReview),
    },
  };
}

interface RawProfileReview {
  id: string;
  rating: number;
  text: string | null;
  tags: string[];
  reviewer: { id: string; nickname: string | null; avatar_url: string | null };
  reviewer_role: 'BUYER' | 'SELLER' | null;
  created_at: string;
}

function toProfileReview(r: RawProfileReview): ProfileReview {
  return {
    id: r.id,
    rating: r.rating,
    text: r.text,
    tags: r.tags,
    reviewer: { id: r.reviewer.id, nickname: r.reviewer.nickname, avatarUrl: r.reviewer.avatar_url },
    reviewerRole: r.reviewer_role,
    createdAt: r.created_at,
  };
}

export interface UserReviewsPage extends PageResponse<ProfileReview> {
  avgRating: number | null;
  tagCounts: ReviewTagCount[];
}

/** 받은 후기 전체(모든 별점, 최신순). 헤더 집계(avgRating·tagCounts)는 매 페이지 응답에 같이 온다. */
export async function fetchUserReviews(userId: string, page = 1, size = 20): Promise<UserReviewsPage> {
  if (USE_MOCK) {
    return { items: [], total: 0, page, size, avgRating: null, tagCounts: [] };
  }
  const res = await api.realFetch<{
    items: RawProfileReview[];
    total: number;
    page: number;
    size: number;
    avg_rating: number | null;
    tag_counts: ReviewTagCount[];
  }>(`/users/${userId}/reviews?page=${page}&size=${size}`);
  return {
    items: res.items.map(toProfileReview),
    total: res.total,
    page: res.page,
    size: res.size,
    avgRating: res.avg_rating,
    tagCounts: res.tag_counts,
  };
}

export async function fetchUserStats(userId: string): Promise<UserStats> {
  if (USE_MOCK) {
    return { month: '2026-05', total_km: 0, lifetime_km: 0, quest_count: 0, avg_safety_grade: null, review_count: 0, avg_rating: null };
  }
  return api.realFetch<UserStats>(`/users/me/stats?user_id=${userId}`);
}

export async function fetchQuestHistory(userId: string, page = 1, size = 20): Promise<PageResponse<QuestHistoryItem>> {
  if (USE_MOCK) {
    return { items: [], total: 0, page: 1, size: 20 };
  }
  return api.realFetch<PageResponse<QuestHistoryItem>>(`/users/me/quest-history?user_id=${userId}&page=${page}&size=${size}`);
}

export async function fetchAllBadges(userId?: string): Promise<BadgeWithEarned[]> {
  if (USE_MOCK) return [];
  const qs = userId ? `?user_id=${userId}` : '';
  return api.realFetch<BadgeWithEarned[]>(`/badges${qs}`);
}

export type UserReportReason = 'ABUSE' | 'FRAUD' | 'INAPPROPRIATE_PROFILE' | 'SPAM' | 'OTHER';
export const USER_REPORT_REASONS: UserReportReason[] = ['ABUSE', 'FRAUD', 'INAPPROPRIATE_PROFILE', 'SPAM', 'OTHER'];

// rethrow:true — 중복 신고 409 원문이 전역 토스트로 새는 것 방지(reportListing 과 동일 이유).
export async function reportUser(userId: string, reason: UserReportReason, note?: string): Promise<void> {
  await api.realFetch(
    `/users/${userId}/report`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, note: note ?? null }),
    },
    'bff',
    { rethrow: true },
  );
}
