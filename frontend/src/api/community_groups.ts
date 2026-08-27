import { api, requireSession } from './client';
import { transformPost } from './feed';
import type { FeedPost } from './types';
import type { CommunityGroup, CommunityGroupMember } from './types';

function transformGroup(raw: any): CommunityGroup {
  return {
    id: raw.id,
    slug: raw.slug ?? null,
    name: raw.name,
    description: raw.description ?? null,
    coverUrl: raw.cover_url ?? null,
    groupType: raw.group_type,
    wardId: raw.ward_id ?? null,
    districtId: raw.district_id ?? null,
    joinPolicy: raw.join_policy,
    visibility: raw.visibility,
    ownerId: raw.owner_id ?? null,
    memberCount: raw.member_count,
    postCount: raw.post_count,
    status: raw.status,
    createdAt: raw.created_at,
    myMembershipStatus: raw.my_membership_status ?? null,
    myRole: raw.my_role ?? null,
    conversationId: raw.conversation_id ?? null,
  };
}

function transformMember(raw: any): CommunityGroupMember {
  return {
    userId: raw.user_id,
    nickname: raw.nickname ?? null,
    avatarUrl: raw.avatar_url ?? null,
    role: raw.role,
    status: raw.status,
    joinedAt: raw.joined_at,
  };
}

export interface CreateGroupParams {
  name: string;
  description?: string;
  groupType?: 'interest' | 'neighborhood';
  wardId?: number;
  districtId?: number;
  joinPolicy?: 'open' | 'approval' | 'invite';
  visibility?: 'public' | 'private';
  coverContentId?: string;
}

export async function createGroup(params: CreateGroupParams): Promise<CommunityGroup> {
  requireSession();
  const raw = await api.realFetch<any>('/community/groups', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      description: params.description ?? null,
      group_type: params.groupType ?? 'interest',
      ward_id: params.wardId ?? null,
      district_id: params.districtId ?? null,
      join_policy: params.joinPolicy ?? 'open',
      visibility: params.visibility ?? 'public',
      cover_content_id: params.coverContentId ?? null,
    }),
  });
  return transformGroup(raw);
}

export interface GroupPage {
  items: CommunityGroup[];
  total: number;
  page: number;
  size: number;
}

export async function listGroups(filter: 'all' | 'mine' = 'all', page = 1, size = 20): Promise<GroupPage> {
  const params = new URLSearchParams({ filter, page: String(page), size: String(size) });
  const res = await api.realFetch<{ items: any[]; total: number; page: number; size: number }>(
    `/community/groups?${params}`,
  );
  return { items: res.items.map(transformGroup), total: res.total, page: res.page, size: res.size };
}

export async function getGroup(idOrSlug: string): Promise<CommunityGroup> {
  const raw = await api.realFetch<any>(`/community/groups/${idOrSlug}`);
  return transformGroup(raw);
}

export interface PatchGroupParams {
  name?: string;
  description?: string;
  joinPolicy?: 'open' | 'approval' | 'invite';
  visibility?: 'public' | 'private';
  coverContentId?: string;
}

export async function patchGroup(groupId: string, patch: PatchGroupParams): Promise<CommunityGroup> {
  const raw = await api.realFetch<any>(`/community/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: patch.name ?? null,
      description: patch.description ?? null,
      join_policy: patch.joinPolicy ?? null,
      visibility: patch.visibility ?? null,
      cover_content_id: patch.coverContentId ?? null,
    }),
  });
  return transformGroup(raw);
}

export async function joinGroup(groupId: string): Promise<CommunityGroup> {
  requireSession();
  const raw = await api.realFetch<any>(`/community/groups/${groupId}/join`, { method: 'POST' });
  return transformGroup(raw);
}

export async function approveMember(groupId: string, userId: string): Promise<CommunityGroup> {
  const raw = await api.realFetch<any>(`/community/groups/${groupId}/members/${userId}/approve`, {
    method: 'POST',
  });
  return transformGroup(raw);
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await api.realFetch(`/community/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
}

export async function listMembers(groupId: string): Promise<CommunityGroupMember[]> {
  const raw = await api.realFetch<any[]>(`/community/groups/${groupId}/members`);
  return raw.map(transformMember);
}

export interface GroupPostsPage {
  items: FeedPost[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}

export async function listGroupPosts(groupId: string, page = 1, size = 20): Promise<GroupPostsPage> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  const res = await api.realFetch<{ items: any[]; total: number; page: number; size: number; has_more: boolean }>(
    `/community/groups/${groupId}/posts?${params}`,
  );
  return { items: res.items.map(transformPost), total: res.total, page: res.page, size: res.size, hasMore: res.has_more };
}
