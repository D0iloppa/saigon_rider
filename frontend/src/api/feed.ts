import { USE_MOCK, api } from './client';
import { MOCK_FEED, MOCK_COMMENTS } from '@/data/feed';
import type { FeedPost, Comment } from './types';

export async function fetchFeed(filter?: 'all' | 'neighborhood' | 'friends' | 'hot'): Promise<FeedPost[]> {
  if (USE_MOCK) {
    let list = [...MOCK_FEED];
    if (filter === 'hot') list = list.sort((a, b) => b.cheerCount - a.cheerCount);
    return api.delay(list, 200);
  }
  return api.realFetch<FeedPost[]>(`/feed?filter=${filter ?? 'all'}`);
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
  return api.realFetch<{ cheered: boolean; count: number }>(`/feed/${postId}/cheer`, {
    method: 'POST',
  });
}
