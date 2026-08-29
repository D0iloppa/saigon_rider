import { api } from './client';

/**
 * 대화방 게시판 (init/218, P1) — 방 안의 Discord 식 채널 + 글.
 * 서버 규칙: direct 방은 400, 읽기·쓰기는 방 멤버만, 채널 관리는 운영진(owner/admin),
 * 글 삭제는 작성자 또는 운영진. 본문 금칙어는 400 `banned_keyword`.
 * 댓글(init/219, P2)도 같은 축 — 쓰기는 멤버, 삭제는 작성자 또는 운영진.
 */

export interface DmChannel {
  id: string;
  conversationId: string;
  name: string;
  position: number;
  createdAt: string;
  /** 내가 마지막으로 읽은 뒤 남이 쓴 글 수 (init/220). 댓글은 세지 않는다. */
  unreadCount: number;
}

export interface DmChannelPost {
  id: string;
  channelId: string;
  authorId: string;
  authorNickname: string | null;
  authorAvatarUrl: string | null;
  body: string;
  imageUrls: string[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

function transformChannel(raw: any): DmChannel {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    name: raw.name,
    position: raw.position ?? 0,
    createdAt: raw.created_at,
    unreadCount: raw.unread_count ?? 0,
  };
}

function transformPost(raw: any): DmChannelPost {
  return {
    id: raw.id,
    channelId: raw.channel_id,
    authorId: raw.author_id,
    authorNickname: raw.author_nickname ?? null,
    authorAvatarUrl: raw.author_avatar_url ?? null,
    body: raw.body,
    imageUrls: raw.image_urls ?? [],
    commentCount: raw.comment_count ?? 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export async function fetchChannels(conversationId: string): Promise<DmChannel[]> {
  const rows = await api.realFetch<any[]>(`/dm/conversations/${conversationId}/channels`);
  return rows.map(transformChannel);
}

/** 채널 생성 — 운영진만. 새 채널은 목록 맨 뒤에 붙는다(서버가 position 을 매긴다). 실패는 호출부가 안내(rethrow). */
export async function createChannel(conversationId: string, name: string): Promise<DmChannel> {
  const raw = await api.realFetch<any>(
    `/dm/conversations/${conversationId}/channels`,
    { method: 'POST', body: JSON.stringify({ name }) },
    'bff',
    { rethrow: true },
  );
  return transformChannel(raw);
}

/** 채널 이름 변경·자리 이동 — 운영진만. position 은 옮길 자리(index), 재번호는 서버가 한다(rethrow). */
export async function patchChannel(
  conversationId: string,
  channelId: string,
  patch: { name?: string; position?: number },
): Promise<DmChannel> {
  const raw = await api.realFetch<any>(
    `/dm/conversations/${conversationId}/channels/${channelId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
      }),
    },
    'bff',
    { rethrow: true },
  );
  return transformChannel(raw);
}

/** 채널 삭제 — 운영진만. 채널 안의 글도 함께 사라진다(rethrow). */
export async function deleteChannel(conversationId: string, channelId: string): Promise<void> {
  await api.realFetch(
    `/dm/conversations/${conversationId}/channels/${channelId}`,
    { method: 'DELETE' },
    'bff',
    { rethrow: true },
  );
}

/** 채널 읽음 표시 (init/220) — 배지를 끄는 부수효과일 뿐이라 실패해도 화면을 막지 않는다(rethrow 안 함). */
export async function markChannelRead(conversationId: string, channelId: string): Promise<void> {
  await api.realFetch(`/dm/conversations/${conversationId}/channels/${channelId}/read`, { method: 'PUT' });
}

export async function fetchChannelPosts(
  conversationId: string,
  channelId: string,
  page = 1,
  size = 20,
): Promise<{ items: DmChannelPost[]; total: number }> {
  const res = await api.realFetch<any>(
    `/dm/conversations/${conversationId}/channels/${channelId}/posts?page=${page}&size=${size}`,
  );
  return { items: (res.items ?? []).map(transformPost), total: res.total ?? 0 };
}

/** 글 작성 — 멤버 누구나. 금칙어가 있으면 서버가 400 `banned_keyword` 로 막는다(rethrow). */
export async function createChannelPost(
  conversationId: string,
  channelId: string,
  body: string,
  imageContentIds: string[] = [],
): Promise<DmChannelPost> {
  const raw = await api.realFetch<any>(
    `/dm/conversations/${conversationId}/channels/${channelId}/posts`,
    { method: 'POST', body: JSON.stringify({ body, image_content_ids: imageContentIds }) },
    'bff',
    { rethrow: true },
  );
  return transformPost(raw);
}

export async function fetchChannelPost(conversationId: string, postId: string): Promise<DmChannelPost> {
  return transformPost(await api.realFetch<any>(`/dm/conversations/${conversationId}/posts/${postId}`));
}

/** 글 삭제(소프트) — 작성자 또는 운영진. 실패는 호출부가 안내(rethrow). */
export async function deleteChannelPost(conversationId: string, postId: string): Promise<void> {
  await api.realFetch(`/dm/conversations/${conversationId}/posts/${postId}`, { method: 'DELETE' }, 'bff', {
    rethrow: true,
  });
}

export interface DmChannelComment {
  id: string;
  postId: string;
  authorId: string;
  authorNickname: string | null;
  authorAvatarUrl: string | null;
  parentId: string | null;
  body: string;
  /** 삭제됐지만 답글이 남아 자리만 지키는 댓글 — 본문은 비어 있다. */
  deleted: boolean;
  createdAt: string;
}

function transformComment(raw: any): DmChannelComment {
  return {
    id: raw.id,
    postId: raw.post_id,
    authorId: raw.author_id,
    authorNickname: raw.author_nickname ?? null,
    authorAvatarUrl: raw.author_avatar_url ?? null,
    parentId: raw.parent_id ?? null,
    body: raw.body ?? '',
    deleted: raw.deleted ?? false,
    createdAt: raw.created_at,
  };
}

/** 댓글 목록 — 작성순 평면 목록. 답글은 parentId 로만 표현된다(들여쓰기 1단). */
export async function fetchChannelComments(conversationId: string, postId: string): Promise<DmChannelComment[]> {
  const rows = await api.realFetch<any[]>(`/dm/conversations/${conversationId}/posts/${postId}/comments`);
  return rows.map(transformComment);
}

/** 댓글·답글 작성 — 멤버 누구나. 금칙어는 서버가 400 `banned_keyword` 로 막는다(rethrow). */
export async function createChannelComment(
  conversationId: string,
  postId: string,
  body: string,
  parentId?: string | null,
): Promise<DmChannelComment> {
  const raw = await api.realFetch<any>(
    `/dm/conversations/${conversationId}/posts/${postId}/comments`,
    { method: 'POST', body: JSON.stringify({ body, parent_id: parentId ?? null }) },
    'bff',
    { rethrow: true },
  );
  return transformComment(raw);
}

/** 댓글 삭제(소프트) — 작성자 또는 운영진(rethrow). */
export async function deleteChannelComment(
  conversationId: string,
  postId: string,
  commentId: string,
): Promise<void> {
  await api.realFetch(
    `/dm/conversations/${conversationId}/posts/${postId}/comments/${commentId}`,
    { method: 'DELETE' },
    'bff',
    { rethrow: true },
  );
}
