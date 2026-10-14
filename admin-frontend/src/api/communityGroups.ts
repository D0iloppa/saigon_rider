import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

export interface GroupTopic {
  code: string
  label_ko: string
  label_en: string
  label_vi: string
}

export interface AdminGroupRow {
  id: string
  name: string
  description: string | null
  topic: string
  topic_label_ko: string | null
  join_policy: 'open' | 'approval' | 'invite'
  visibility: 'public' | 'private'
  group_type: string
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'
  member_count: number
  post_count: number
  cover_content_id: string | null
  cover_url: string | null
  owner_id: string | null
  created_at: string
}

export interface GroupCreateBody {
  name: string
  description?: string | null
  topic: string
  join_policy: string
  visibility: string
  cover_content_id?: string | null
}

export interface GroupUpdateBody {
  name?: string
  description?: string | null
  topic?: string
  join_policy?: string
  visibility?: string
  cover_content_id?: string | null
  status?: 'ACTIVE' | 'SUSPENDED'
}

export function useGroupTopics() {
  return useQuery({
    queryKey: ['community-groups', 'topics'],
    queryFn: () => api<GroupTopic[]>('/admin/api/community-groups/topics'),
  })
}

export function useGroupList(params: { page?: number; size?: number }) {
  return useQuery({
    queryKey: ['community-groups', params],
    queryFn: () => api<Page<AdminGroupRow>>(`/admin/api/community-groups${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: GroupCreateBody) =>
      api<AdminGroupRow>('/admin/api/community-groups', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-groups'] }),
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: GroupUpdateBody }) =>
      api<AdminGroupRow>(`/admin/api/community-groups/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-groups'] }),
  })
}
