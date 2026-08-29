import { USE_MOCK, api, requireSession } from './client';
import { transformCard } from './market';
import type { Appointment, DmAppointmentMeta, DmConversation, DmMessage, DmReaction, PriceOffer } from './types';

function transformPriceOffer(raw: any): PriceOffer {
  return {
    id: raw.id,
    listingId: raw.listing_id,
    conversationId: raw.conversation_id,
    proposerId: raw.proposer_id,
    sellerId: raw.seller_id ?? null,
    amount: raw.amount,
    status: raw.status,
  };
}

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
    completionRequestedBy: raw.completion_requested_by ?? null,
    completionRequestedAt: raw.completion_requested_at ?? null,
    completionDeclinedAt: raw.completion_declined_at ?? null,
    completionDeclinedBy: raw.completion_declined_by ?? null,
  };
}

function transformConversation(raw: any): DmConversation {
  return {
    id: raw.id,
    otherUserId: raw.other_user_id,
    otherUserNickname: raw.other_user_nickname ?? null,
    otherUserAvatarUrl: raw.other_user_avatar_url ?? null,
    lastMessagePreview: raw.last_message_preview ?? null,
    lastMessageType: raw.last_message_type ?? null,
    lastMessageMeta: raw.last_message_meta ?? null,
    lastMessageAt: raw.last_message_at,
    unreadCount: raw.unread_count ?? 0,
    contextType: raw.context_type ?? null,
    contextId: raw.context_id ?? null,
    contextListing: raw.context_listing ? transformCard(raw.context_listing) : null,
    appointmentUnlocked: raw.appointment_unlocked ?? false,
    conversationType: raw.conversation_type ?? 'direct',
    title: raw.title ?? null,
    photoUrl: raw.photo_url ?? null,
    memberCount: raw.member_count ?? 2,
    communityGroupId: raw.community_group_id ?? null,
    activeTrades: (raw.active_trades ?? []).map((t: any) => ({
      appointmentId: t.appointment_id,
      listingId: t.listing_id,
      listingTitle: t.listing_title ?? null,
      thumbnailUrl: t.thumbnail_url ?? null,
      status: t.status,
    })),
    notice: raw.notice
      ? {
          messageId: raw.notice.message_id,
          content: raw.notice.content ?? null,
          setBy: raw.notice.set_by ?? null,
          setByNickname: raw.notice.set_by_nickname ?? null,
          setAt: raw.notice.set_at ?? null,
        }
      : null,
    boardUnread: raw.board_unread ?? 0,
  };
}

function transformReaction(raw: any): DmReaction {
  return { emoji: raw.emoji, count: raw.count ?? 0, reactedByMe: raw.reacted_by_me ?? false };
}

function transformMessage(raw: any): DmMessage {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    senderId: raw.sender_id,
    content: raw.content ?? null,
    imageUrl: raw.image_url ?? null,
    audioUrl: raw.audio_url ?? null,
    readAt: raw.read_at ?? null,
    createdAt: raw.created_at,
    messageType: raw.message_type ?? 'text',
    meta: raw.meta ?? null,
    appointment: raw.appointment ? transformAppointment(raw.appointment) : null,
    priceOffer: raw.price_offer ? transformPriceOffer(raw.price_offer) : null,
    updatedAt: raw.updated_at ?? null,
    editedAt: raw.edited_at ?? null,
    deletedAt: raw.deleted_at ?? null,
    replyToMessageId: raw.reply_to_message_id ?? null,
    replyPreview: raw.reply_preview
      ? {
          senderId: raw.reply_preview.senderId,
          senderNickname: raw.reply_preview.senderNickname ?? null,
          content: raw.reply_preview.content ?? null,
          messageType: raw.reply_preview.messageType ?? null,
        }
      : null,
    reactions: (raw.reactions ?? []).map(transformReaction),
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
      lastMessageType: null,
      lastMessageMeta: null,
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      contextType: context?.type ?? null,
      contextId: context?.id ?? null,
      contextListing: null,
      appointmentUnlocked: false,
      conversationType: 'direct',
      title: null,
      photoUrl: null,
      memberCount: 2,
      communityGroupId: null,
      activeTrades: [],
      notice: null,
      boardUnread: 0,
    }, 100);
  }
  requireSession();
  const raw = await api.realFetch<any>('/dm/conversations', {
    method: 'POST',
    body: JSON.stringify({
      other_user_id: otherUserId,
      context_type: context?.type ?? null,
      context_id: context?.id ?? null,
    }),
  });
  return transformConversation(raw);
}

export async function fetchConversation(conversationId: string): Promise<DmConversation> {
  requireSession();
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}`);
  return transformConversation(raw);
}

/**
 * 메시지 목록/증분 동기화.
 * `after` 는 **updated_at 워터마크** — 신규뿐 아니라 수정/삭제/공감변경된 메시지가 전부
 * 실려 온다(215_dm_message_sync). 소비처는 id 로 upsert 하면 된다.
 * `after` 없는 요청은 created_at 순 offset 페이지네이션(과거분 로드) — total 이 정확하다.
 */
export async function fetchMessages(
  conversationId: string,
  page = 1,
  after?: string,
  size = 50,
): Promise<{ items: DmMessage[]; total: number }> {
  if (USE_MOCK) return api.delay({ items: [], total: 0 }, 100);
  let url = `/dm/conversations/${conversationId}/messages?page=${page}&size=${size}`;
  if (after) url += `&after=${encodeURIComponent(after)}`;
  const res = await api.realFetch<{ items: any[]; total: number }>(url);
  return { items: res.items.map(transformMessage), total: res.total };
}

export interface SendMessageOpts {
  imageContentId?: string;
  /** 워키토키 음성메시지(A-3/A-7) — 있으면 서버가 message_type 을 'voice' 로 강제한다. */
  audioContentId?: string;
  messageType?: string;
  meta?: DmAppointmentMeta;
  /** 답장 대상 메시지 id — 서버가 전송 시점에 reply_preview 스냅샷을 만든다. */
  replyToMessageId?: string;
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
      audioUrl: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      messageType: opts.messageType ?? 'text',
      meta: opts.meta ?? null,
      appointment: null,
      priceOffer: null,
      updatedAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      replyToMessageId: opts.replyToMessageId ?? null,
      replyPreview: null,
      reactions: [],
    }, 100);
  }
  requireSession();
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      image_content_id: opts.imageContentId ?? null,
      audio_content_id: opts.audioContentId ?? null,
      message_type: opts.messageType ?? 'text',
      meta: opts.meta ?? null,
      reply_to_message_id: opts.replyToMessageId ?? null,
    }),
  }, 'bff', { rethrow: true });
  return transformMessage(raw);
}

/** 본인 텍스트 메시지 수정 — 수정본에는 editedAt 이 찍힌다. */
export async function editMessage(conversationId: string, messageId: string, content: string): Promise<DmMessage> {
  const raw = await api.realFetch<any>(
    `/dm/conversations/${conversationId}/messages/${messageId}`,
    { method: 'PATCH', body: JSON.stringify({ content }) },
    'bff',
    { rethrow: true },
  );
  return transformMessage(raw);
}

/** 본인 메시지 소프트 삭제 — 상대에게는 "삭제된 메시지" 플레이스홀더로 보인다. */
export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await api.realFetch(
    `/dm/conversations/${conversationId}/messages/${messageId}`,
    { method: 'DELETE' },
    'bff',
    { rethrow: true },
  );
}

/** 공감 고정 팔레트 — 서버 _DM_REACTION_EMOJIS 와 동일해야 한다. */
export const DM_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

/** 공감 추가. 해당 메시지의 최신 공감 집계를 반환한다. */
export async function addReaction(conversationId: string, messageId: string, emoji: string): Promise<DmReaction[]> {
  const raw = await api.realFetch<any[]>(
    `/dm/conversations/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    { method: 'POST' },
    'bff',
    { rethrow: true },
  );
  return (raw ?? []).map(transformReaction);
}

/** 공감 제거. 해당 메시지의 최신 공감 집계를 반환한다. */
export async function removeReaction(conversationId: string, messageId: string, emoji: string): Promise<DmReaction[]> {
  const raw = await api.realFetch<any[]>(
    `/dm/conversations/${conversationId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    { method: 'DELETE' },
    'bff',
    { rethrow: true },
  );
  return (raw ?? []).map(transformReaction);
}

export async function markRead(conversationId: string): Promise<void> {
  if (USE_MOCK) return api.delay(undefined, 50);
  requireSession();
  await api.realFetch(`/dm/conversations/${conversationId}/read`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// ── 워키토키(A-7) 채널정보 UX — 참석 인원 + 소프트 녹음중 신호 ─────────
export interface DmPresence {
  totalMembers: number;
  activeMembers: number;
  recordingUsers: { id: string; nickname: string | null }[];
}

function transformPresence(raw: any): DmPresence {
  return {
    totalMembers: raw.total_members ?? 0,
    activeMembers: raw.active_members ?? 0,
    recordingUsers: (raw.recording_users ?? []).map((u: any) => ({ id: u.id, nickname: u.nickname ?? null })),
  };
}

export async function fetchConversationPresence(conversationId: string): Promise<DmPresence> {
  return transformPresence(await api.realFetch<any>(`/dm/conversations/${conversationId}/presence`));
}

export async function notifyRecordingPresence(conversationId: string, action: 'start' | 'stop'): Promise<void> {
  await api.realFetch(`/dm/conversations/${conversationId}/recording-presence`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

// 워키토키 음성메시지(A-3/D-6) — 수신자가 재생 완료 시 서버가 파일을 삭제하고 playedAt 을 기록.
export async function markVoicePlayed(conversationId: string, messageId: string): Promise<DmMessage> {
  const raw = await api.realFetch<any>(
    `/dm/conversations/${conversationId}/messages/${messageId}/played`,
    { method: 'POST' },
  );
  return transformMessage(raw);
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
      // datetime-local(뷰어 로컬시각) → tz 포함 UTC ISO. 백엔드는 tz-aware 만 수용 (DM-1)
      when_at: new Date(input.whenAt).toISOString(),
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

/** S-16: 구매자가 거래 완료를 요청한다(완료 확정은 판매자 권한 그대로). */
export async function requestAppointmentCompletion(appointmentId: string): Promise<Appointment> {
  return transformAppointment(
    await api.realFetch<any>(`/market/appointments/${appointmentId}/request-completion`, { method: 'PATCH' }),
  );
}

/** S-16: 판매자가 완료 요청을 거절한다(약속은 ACCEPTED 유지). */
export async function declineAppointmentCompletion(appointmentId: string): Promise<Appointment> {
  return transformAppointment(
    await api.realFetch<any>(`/market/appointments/${appointmentId}/decline-completion`, { method: 'PATCH' }),
  );
}

export async function cancelAppointment(appointmentId: string): Promise<Appointment> {
  return transformAppointment(await api.realFetch<any>(`/market/appointments/${appointmentId}/cancel`, { method: 'PATCH' }));
}


// ── 가격제안 — 약속(SGR-287)과 동일하게 DM 메시지 + 도메인 엔티티 ────
/** 가격제안. 채팅 타임라인용 price_offer 메시지를 반환한다. 기존 PROPOSED 제안은 서버가 supersede. */
export async function proposePriceOffer(conversationId: string, amount: number): Promise<DmMessage> {
  const raw = await api.realFetch<any>('/market/price-offers', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId, amount }),
  });
  return transformMessage(raw);
}

export async function acceptPriceOffer(offerId: string): Promise<PriceOffer> {
  return transformPriceOffer(await api.realFetch<any>(`/market/price-offers/${offerId}/accept`, { method: 'PATCH' }));
}

export async function declinePriceOffer(offerId: string): Promise<PriceOffer> {
  return transformPriceOffer(await api.realFetch<any>(`/market/price-offers/${offerId}/decline`, { method: 'PATCH' }));
}

export async function cancelPriceOffer(offerId: string): Promise<PriceOffer> {
  return transformPriceOffer(await api.realFetch<any>(`/market/price-offers/${offerId}/cancel`, { method: 'PATCH' }));
}

// ── 그룹/오픈톡방 (260827 group/open 확장, §3.5) ────────────────────
export async function createGroupConversation(
  title: string,
  memberIds: string[],
  photoContentId?: string,
): Promise<DmConversation> {
  requireSession();
  const raw = await api.realFetch<any>('/dm/conversations/group', {
    method: 'POST',
    body: JSON.stringify({
      title,
      member_ids: memberIds,
      ...(photoContentId ? { photo_content_id: photoContentId } : {}),
    }),
  });
  return transformConversation(raw);
}

export async function inviteMembers(conversationId: string, userIds: string[]): Promise<DmConversation> {
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  });
  return transformConversation(raw);
}

export async function removeMember(conversationId: string, userId: string): Promise<void> {
  await api.realFetch(`/dm/conversations/${conversationId}/members/${userId}`, { method: 'DELETE' });
}

export async function joinOpenConversation(conversationId: string): Promise<DmConversation> {
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}/join`, { method: 'POST' });
  return transformConversation(raw);
}

export async function updateConversation(
  conversationId: string,
  patch: { title?: string; photoContentId?: string },
): Promise<DmConversation> {
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: patch.title ?? null, photo_content_id: patch.photoContentId ?? null }),
  });
  return transformConversation(raw);
}

export async function toggleMute(conversationId: string): Promise<boolean> {
  const res = await api.realFetch<{ muted: boolean }>(`/dm/conversations/${conversationId}/mute`, { method: 'POST' });
  return res.muted;
}

// ── T&S: 대화 신고 ────────────────────────────────────────────────
export type DmReportReason = 'ABUSE' | 'SCAM' | 'SEXUAL' | 'SPAM' | 'OTHER';
export const DM_REPORT_REASONS: DmReportReason[] = ['ABUSE', 'SCAM', 'SEXUAL', 'SPAM', 'OTHER'];

// rethrow:true — 중복 신고 409 원문이 전역 토스트로 새는 것 방지(reportListing 과 동일 이유).
export async function reportConversation(conversationId: string, reason: DmReportReason, note?: string): Promise<void> {
  await api.realFetch(
    `/dm/conversations/${conversationId}/report`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, note: note ?? null }),
    },
    'bff',
    { rethrow: true },
  );
}

// ── 그룹 운영 (2026-08-28) ─────────────────────────────────────────────────
// 서버 규칙은 ai-docs/context/service-rules.md "그룹 대화방 권한" 참조.
// 요약: 초대 자격은 초대자의 팔로잉(재초대는 면제), owner 만 admin 임명, 강퇴는 재초대로
// 복귀 가능하지만 블랙리스트는 해제 전까지 초대·입장 모두 거부.

export interface DmBan {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  bannedBy: string | null;
  reason: string | null;
  createdAt: string;
}

/** 관리자 임명/해임 — 개설자(owner)만 호출할 수 있다. */
export async function setMemberRole(
  conversationId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  await api.realFetch(`/dm/conversations/${conversationId}/members/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function fetchBans(conversationId: string): Promise<DmBan[]> {
  const rows = await api.realFetch<any[]>(`/dm/conversations/${conversationId}/bans`);
  return rows.map((b) => ({
    userId: b.user_id,
    nickname: b.nickname ?? null,
    avatarUrl: b.avatar_url ?? null,
    bannedBy: b.banned_by ?? null,
    reason: b.reason ?? null,
    createdAt: b.created_at,
  }));
}

/** 블랙리스트 등록 — 활성 멤버면 함께 퇴장 처리된다(밴됐는데 방에 남아있는 상태 방지). */
export async function banMember(conversationId: string, userId: string, reason?: string): Promise<void> {
  await api.realFetch(`/dm/conversations/${conversationId}/bans`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, reason: reason ?? null }),
  });
}

export async function unbanMember(conversationId: string, userId: string): Promise<void> {
  await api.realFetch(`/dm/conversations/${conversationId}/bans/${userId}`, { method: 'DELETE' });
}

export interface DmMember {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

export async function fetchMembers(conversationId: string): Promise<DmMember[]> {
  const rows = await api.realFetch<any[]>(`/dm/conversations/${conversationId}/members`);
  return rows.map((m) => ({
    userId: m.user_id,
    nickname: m.nickname ?? null,
    avatarUrl: m.avatar_url ?? null,
    role: m.role,
    joinedAt: m.joined_at,
  }));
}

/** 방 공지 등록(멤버 누구나) — 방마다 1건이라 등록하면 이전 공지를 덮어쓴다. */
export async function setConversationNotice(conversationId: string, messageId: string): Promise<DmConversation> {
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}/notice`, {
    method: 'PUT',
    body: JSON.stringify({ message_id: messageId }),
  });
  return transformConversation(raw);
}

/** 방 공지 내리기 — 등록자 본인 또는 운영진(owner/admin)만. */
export async function clearConversationNotice(conversationId: string): Promise<DmConversation> {
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}/notice`, { method: 'DELETE' });
  return transformConversation(raw);
}

/** 방 제목·사진 변경. */
export async function patchConversation(
  conversationId: string,
  body: { title?: string; photoContentId?: string },
): Promise<DmConversation> {
  const raw = await api.realFetch<any>(`/dm/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.photoContentId !== undefined ? { photo_content_id: body.photoContentId } : {}),
    }),
  });
  return transformConversation(raw);
}
