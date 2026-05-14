import { USE_MOCK, api } from './client';
import { MOCK_FEED, MOCK_COMMENTS } from '@/data/feed';
import { loadSession } from '@/lib/session';
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
  return {
    id: raw.id,
    userId: raw.user_id,
    userNickname: raw.user_nickname ?? null,
    userAvatarUrl: raw.user_avatar_url ?? null,
    userLevel: raw.user_level ?? 1,
    photoUrl: raw.image_url ?? null,
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

export async function fetchFeed(filter?: 'all' | 'neighborhood' | 'friends' | 'hot'): Promise<FeedPost[]> {
  if (USE_MOCK) {
    let list = [...MOCK_FEED];
    if (filter === 'hot') list = list.sort((a, b) => b.cheerCount - a.cheerCount);
    return api.delay(list, 200);
  }
  const res = await api.realFetch<{ items: any[]; total: number }>(`/feed?filter=${filter ?? 'all'}`);
  return res.items.map(transformPost);
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  if (USE_MOCK) {
    const list = MOCK_COMMENTS.filter((c) => c.postId === postId);
    return api.delay(list, 150);
  }
  return api.realFetch<Comment[]>(`/feed/${postId}/comments`);
}

export async function toggleCheer(postId: string): Promise<{ cheered: boolean; count: number }> {
  if (USE_MOCK) {
    const post = MOCK_FEED.find((p) => p.id === postId);
    if (!post) return { cheered: false, count: 0 };
    post.iCheered = !post.iCheered;
    post.cheerCount += post.iCheered ? 1 : -1;
    return api.delay({ cheered: post.iCheered, count: post.cheerCount }, 100);
  }
  const session = loadSession();
  const res = await api.realFetch<{ liked: boolean; like_count: number }>(`/feed/${postId}/like`, {
    method: 'POST',
    body: JSON.stringify({ user_id: session?.userId ?? null }),
  });
  return { cheered: res.liked, count: res.like_count };
}
