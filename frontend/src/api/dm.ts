import { USE_MOCK, api } from './client';
import { loadSession } from '@/lib/session';
import type { DmConversation, DmMessage } from './types';

function transformConversation(raw: any): DmConversation {
  return {
    id: raw.id,
    otherUserId: raw.other_user_id,
    otherUserNickname: raw.other_user_nickname ?? null,
    otherUserAvatarUrl: raw.other_user_avatar_url ?? null,
    lastMessagePreview: raw.last_message_preview ?? null,
    lastMessageAt: raw.last_message_at,
    unreadCount: raw.unread_count ?? 0,
  };
}

function transformMessage(raw: any): DmMessage {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    senderId: raw.sender_id,
    content: raw.content ?? null,
    imageUrl: raw.image_url ?? null,
    readAt: raw.read_at ?? null,
    createdAt: raw.created_at,
  };
}

export async function fetchConversations(): Promise<DmConversation[]> {
  if (USE_MOCK) return api.delay([], 150);
  const session = loadSession();
  const raw = await api.realFetch<any[]>(`/dm/conversations?user_id=${session?.userId}`);
  return raw.map(transformConversation);
}

export async function createConversation(otherUserId: string): Promise<DmConversation> {
  if (USE_MOCK) {
    return api.delay({
      id: `conv-${Date.now()}`,
      otherUserId,
      otherUserNickname: null,
      otherUserAvatarUrl: null,
      lastMessagePreview: null,
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
    }, 100);
  }
  const session = loadSession();
  const raw = await api.realFetch<any>('/dm/conversations', {
    method: 'POST',
    body: JSON.stringify({ user_id: session?.userId, other_user_id: otherUserId }),
  });
  return transformConversation(raw);
}

export async function fetchMessages(
  conversationId: string,
  page = 1,
  after?: string,
): Promise<{ items: DmMessage[]; total: number }> {
  if (USE_MOCK) return api.delay({ items: [], total: 0 }, 100);
  let url = `/dm/conversations/${conversationId}/messages?page=${page}`;
  if (after) url += `&after=${encodeURIComponent(after)}`;
  const res = await api.realFetch<{ items: any[]; total: number }>(url);
  return { items: res.items.map(transformMessage), total: res.total };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  imageContentId?: string,
): Promise<DmMessage> {
  if (USE_MOCK) {
    return api.delay({
      id: `msg-${Date.now()}`,
      conversationId,
      senderId: loadSession()?.userId ?? '',
      content,
      imageUrl: null,
      readAt: null,
      createdAt: new Date().toISOString(),
    }, 100);
  }
  const session = loadSession();
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      sender_id: session?.userId,
      content,
      image_content_id: imageContentId ?? null,
    }),
  });
  return transformMessage(raw);
}

export async function markRead(conversationId: string): Promise<void> {
  if (USE_MOCK) return api.delay(undefined, 50);
  const session = loadSession();
  await api.realFetch(`/dm/conversations/${conversationId}/read`, {
    method: 'POST',
    body: JSON.stringify({ user_id: session?.userId }),
  });
}
