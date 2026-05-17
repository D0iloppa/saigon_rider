import { USE_MOCK, api, requireSession } from './client';
import { MOCK_FEED, MOCK_COMMENTS } from '@/data/feed';
import type { FeedPost, Comment } from './types';

function parseHashtags(text: string | null): string[] {
  if (!text) return [];
  return (text.match(/#[\w가-힣]+/g) ?? []).map((t) => t.slice(1));
}

function stripHashtags(text: string | null): string | null {
  if (!text) return null;
  return text.replace(/#[\w가-힣]+/g, '').replace(/\s+/g, ' ').trim() || null;
}

// BFF snake_case 응답 → FeedPost
function transformPost(raw: any): FeedPost {
  const imageUrls: string[] = raw.image_urls ?? [];
  return {
    id: raw.id,
    userId: raw.user_id,
    userNickname: raw.user_nickname ?? null,
    userAvatarUrl: raw.user_avatar_url ?? null,
    userLevel: raw.user_level ?? 1,
    photoUrl: imageUrls[0] ?? raw.image_url ?? null,
    photoUrls: imageUrls.length > 0 ? imageUrls : (raw.image_url ? [raw.image_url] : []),
    imageContentIds: (raw.image_content_ids ?? []).map(String),
    caption: stripHashtags(raw.content),
    hashtags: parseHashtags(raw.content),
    distanceKm: raw.distance_km != null ? Number(raw.distance_km) : null,
    safetyGrade: raw.safety_grade ?? null,
    rewardExp: raw.reward_exp ?? null,
    cheerCount: raw.like_count ?? 0,
    commentCount: raw.comment_count ?? 0,
    iCheered: false,
    createdAt: raw.created_at,
  };
}

export interface FetchFeedOptions {
  filter?: 'all' | 'neighborhood' | 'friends' | 'hot';
  userId?: string;
  lat?: number;
  lng?: number;
  page?: number;
  size?: number;
}

export interface FeedPage {
  items: FeedPost[];
  total: number;
  page: number;
  size: number;
}

export async function fetchFeed(
  filterOrOpts?: string | FetchFeedOptions,
): Promise<FeedPage> {
  const opts: FetchFeedOptions = typeof filterOrOpts === 'string'
    ? { filter: filterOrOpts as FetchFeedOptions['filter'] }
    : filterOrOpts ?? {};
  const filter = opts.filter ?? 'all';
  const page = opts.page ?? 1;
  const size = opts.size ?? 20;

  if (USE_MOCK) {
    let list = [...MOCK_FEED];
    if (filter === 'hot') list = list.sort((a, b) => b.cheerCount - a.cheerCount);
    const start = (page - 1) * size;
    return api.delay({ items: list.slice(start, start + size), total: list.length, page, size }, 200);
  }

  const params = new URLSearchParams({ filter, page: String(page), size: String(size) });
  if (opts.userId) params.set('user_id', opts.userId);
  if (opts.lat != null) params.set('lat', String(opts.lat));
  if (opts.lng != null) params.set('lng', String(opts.lng));

  const res = await api.realFetch<{ items: any[]; total: number; page: number; size: number }>(`/feed?${params}`);
  return { items: res.items.map(transformPost), total: res.total, page: res.page, size: res.size };
}

export interface CreateFeedPostParams {
  userId: string;
  content?: string;
  imageContentId?: string;
  imageContentIds?: string[];
  latitude?: number;
  longitude?: number;
  districtId?: number;
  isStory?: boolean;
}

export async function createFeedPost(params: CreateFeedPostParams): Promise<void> {
  if (USE_MOCK) return api.delay(undefined, 200);
  await api.realFetch('/feed', {
    method: 'POST',
    body: JSON.stringify({
      user_id: params.userId,
      content: params.content ?? null,
      image_content_ids: params.imageContentIds ?? (params.imageContentId ? [params.imageContentId] : []),
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      district_id: params.districtId ?? null,
      is_story: params.isStory ?? false,
    }),
  });
}

export async function fetchFeedPost(postId: string): Promise<FeedPost> {
  if (USE_MOCK) {
    const post = MOCK_FEED.find((p) => p.id === postId);
    if (!post) throw new Error('Not found');
    return api.delay(post, 100);
  }
  const raw = await api.realFetch<any>(`/feed/${postId}`);
  return transformPost(raw);
}

export async function fetchMyFeed(userId: string, page = 1, size = 20): Promise<FeedPage> {
  if (USE_MOCK) {
    const list = MOCK_FEED.filter((p) => p.userId === userId);
    const start = (page - 1) * size;
    return api.delay({ items: list.slice(start, start + size), total: list.length, page, size }, 200);
  }
  const params = new URLSearchParams({ filter: 'all', page: String(page), size: String(size), author_id: userId });
  const res = await api.realFetch<{ items: any[]; total: number; page: number; size: number }>(`/feed?${params}`);
  return { items: res.items.map(transformPost), total: res.total, page: res.page, size: res.size };
}

export async function updateFeedPost(postId: string, params: {
  userId: string;
  content?: string;
  imageContentIds?: string[];
}): Promise<void> {
  if (USE_MOCK) return api.delay(undefined, 200);
  await api.realFetch(`/feed/${postId}`, {
    method: 'PUT',
    body: JSON.stringify({
      user_id: params.userId,
      content: params.content ?? null,
      image_content_ids: params.imageContentIds ?? null,
    }),
  });
}

export async function deleteFeedPost(postId: string, userId: string): Promise<void> {
  if (USE_MOCK) return api.delay(undefined, 200);
  await api.realFetch(`/feed/${postId}`, {
    method: 'DELETE',
    body: JSON.stringify({ user_id: userId }),
  });
}

function transformComment(raw: any): Comment {
  return {
    id: String(raw.id),
    postId: String(raw.post_id),
    userNickname: raw.user_nickname ?? raw.user_id ?? 'unknown',
    userAvatarUrl: raw.user_avatar_url ?? undefined,
    content: raw.content ?? '',
    createdAt: raw.created_at,
    likeCount: raw.like_count ?? 0,
    iLiked: false,
    parentId: raw.parent_id ?? undefined,
  };
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  if (USE_MOCK) {
    const list = MOCK_COMMENTS.filter((c) => c.postId === postId);
    return api.delay(list, 150);
  }
  const raw = await api.realFetch<any[]>(`/feed/${postId}/comments`);
  return raw.map(transformComment);
}

export async function postComment(
  postId: string,
  content: string,
  userId: string,
): Promise<{ id: string; createdAt: string }> {
  if (USE_MOCK) {
    return api.delay({ id: `c-new-${Date.now()}`, createdAt: new Date().toISOString() }, 100);
  }
  const raw = await api.realFetch<any>(`/feed/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, content }),
  });
  return { id: String(raw.id), createdAt: raw.created_at };
}

export interface StoryItem {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
}

export async function fetchStories(): Promise<StoryItem[]> {
  if (USE_MOCK) {
    return api.delay([], 100);
  }
  const raw = await api.realFetch<any[]>(`/feed/stories`);
  return raw.map((r) => ({
    userId: String(r.user_id),
    nickname: r.user_nickname ?? '',
    avatarUrl: r.user_avatar_url ?? null,
  }));
}

export async function toggleCommentLike(
  postId: string,
  commentId: string,
): Promise<{ liked: boolean; count: number }> {
  if (USE_MOCK) {
    return api.delay({ liked: true, count: 1 }, 100);
  }
  const session = requireSession();
  const res = await api.realFetch<{ liked: boolean; like_count: number }>(
    `/feed/${postId}/comments/${commentId}/like`,
    {
      method: 'POST',
      body: JSON.stringify({ user_id: session.userId }),
    },
  );
  return { liked: res.liked, count: res.like_count };
}

export async function toggleCheer(postId: string): Promise<{ cheered: boolean; count: number }> {
  if (USE_MOCK) {
    const post = MOCK_FEED.find((p) => p.id === postId);
    if (!post) return { cheered: false, count: 0 };
    post.iCheered = !post.iCheered;
    post.cheerCount += post.iCheered ? 1 : -1;
    return api.delay({ cheered: post.iCheered, count: post.cheerCount }, 100);
  }
  const session = requireSession();
  const res = await api.realFetch<{ liked: boolean; like_count: number }>(`/feed/${postId}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: session.userId }),
  });
  return { cheered: res.liked, count: res.like_count };
}
