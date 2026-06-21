import { USE_MOCK, api, requireSession } from './client';
import { transformCard } from './market';
import type { Appointment, DmAppointmentMeta, DmConversation, DmMessage } from './types';

function transformAppointment(raw: any): Appointment {
  return {
    id: raw.id,
    listingId: raw.listing_id,
    conversationId: raw.conversation_id,
    proposerId: raw.proposer_id,
    sellerId: raw.seller_id ?? null,
    whenAt: raw.when_at,
    placeName: raw.place_name ?? null,
    placeLat: raw.place_lat ?? null,
    placeLng: raw.place_lng ?? null,
    status: raw.status,
  };
}

function transformConversation(raw: any): DmConversation {
  return {
    id: raw.id,
    otherUserId: raw.other_user_id,
    otherUserNickname: raw.other_user_nickname ?? null,
    otherUserAvatarUrl: raw.other_user_avatar_url ?? null,
    lastMessagePreview: raw.last_message_preview ?? null,
    lastMessageAt: raw.last_message_at,
    unreadCount: raw.unread_count ?? 0,
    contextType: raw.context_type ?? null,
    contextId: raw.context_id ?? null,
    contextListing: raw.context_listing ? transformCard(raw.context_listing) : null,
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
    messageType: raw.message_type ?? 'text',
    meta: raw.meta ?? null,
    appointment: raw.appointment ? transformAppointment(raw.appointment) : null,
  };
}

export interface ConversationContext {
  type: 'listing';
  id: string;
}

export async function fetchConversations(): Promise<DmConversation[]> {
  if (USE_MOCK) return api.delay([], 150);
  const session = requireSession();
  const raw = await api.realFetch<any[]>(`/dm/conversations?user_id=${session.userId}`);
  return raw.map(transformConversation);
}

export async function createConversation(
  otherUserId: string,
  context?: ConversationContext,
): Promise<DmConversation> {
  if (USE_MOCK) {
    return api.delay({
      id: `conv-${Date.now()}`,
      otherUserId,
      otherUserNickname: null,
      otherUserAvatarUrl: null,
      lastMessagePreview: null,
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      contextType: context?.type ?? null,
      contextId: context?.id ?? null,
      contextListing: null,
    }, 100);
  }
  const session = requireSession();
  const raw = await api.realFetch<any>('/dm/conversations', {
    method: 'POST',
    body: JSON.stringify({
      user_id: session.userId,
      other_user_id: otherUserId,
      context_type: context?.type ?? null,
      context_id: context?.id ?? null,
    }),
  });
  return transformConversation(raw);
}

export async function fetchConversation(conversationId: string): Promise<DmConversation> {
  const session = requireSession();
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}?user_id=${session.userId}`);
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

export interface SendMessageOpts {
  imageContentId?: string;
  messageType?: string;
  meta?: DmAppointmentMeta;
}

export async function sendMessage(
  conversationId: string,
  content: string,
  opts: SendMessageOpts = {},
): Promise<DmMessage> {
  if (USE_MOCK) {
    return api.delay({
      id: `msg-${Date.now()}`,
      conversationId,
      senderId: requireSession().userId,
      content,
      imageUrl: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      messageType: opts.messageType ?? 'text',
      meta: opts.meta ?? null,
      appointment: null,
    }, 100);
  }
  const session = requireSession();
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      sender_id: session.userId,
      content,
      image_content_id: opts.imageContentId ?? null,
      message_type: opts.messageType ?? 'text',
      meta: opts.meta ?? null,
    }),
  });
  return transformMessage(raw);
}

export async function markRead(conversationId: string): Promise<void> {
  if (USE_MOCK) return api.delay(undefined, 50);
  const session = requireSession();
  await api.realFetch(`/dm/conversations/${conversationId}/read`, {
    method: 'POST',
    body: JSON.stringify({ user_id: session.userId }),
  });
}

// ── 거래 약속 (SGR-287) — DM 메시지 meta → 도메인 엔티티 ────────────
export interface ProposeAppointmentInput {
  whenAt: string;
  placeName?: string | null;
  placeLat?: number | null;
  placeLng?: number | null;
}

/** 약속 제안. 채팅 타임라인용 appointment 메시지를 반환한다. */
export async function proposeAppointment(
  conversationId: string,
  input: ProposeAppointmentInput,
): Promise<DmMessage> {
  const raw = await api.realFetch<any>('/market/appointments', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: conversationId,
      when_at: input.whenAt,
      place_name: input.placeName ?? null,
      place_lat: input.placeLat ?? null,
      place_lng: input.placeLng ?? null,
    }),
  });
  return transformMessage(raw);
}

export async function acceptAppointment(appointmentId: string): Promise<Appointment> {
  return transformAppointment(await api.realFetch<any>(`/market/appointments/${appointmentId}/accept`, { method: 'PATCH' }));
}

export async function completeAppointment(appointmentId: string): Promise<Appointment> {
  return transformAppointment(await api.realFetch<any>(`/market/appointments/${appointmentId}/complete`, { method: 'PATCH' }));
}

export async function cancelAppointment(appointmentId: string): Promise<Appointment> {
  return transformAppointment(await api.realFetch<any>(`/market/appointments/${appointmentId}/cancel`, { method: 'PATCH' }));
}
