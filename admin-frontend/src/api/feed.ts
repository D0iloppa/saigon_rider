import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

export interface FeedAuthorBrief {
  id: string
  nickname: string | null
  avatar_url: string
}

export interface AdminFeedRow {
  id: string
  author: FeedAuthorBrief
  content: string | null
  thumbnail_url: string | null
  image_count: number
  like_count: number
  comment_count: number
  is_story: boolean
  created_at: string
}

export interface AdminFeedDetail {
  id: string
  author: FeedAuthorBrief
  content: string | null
  image_urls: string[]
  image_content_ids: string[]
  latitude: number | string | null
  longitude: number | string | null
  district_name: string | null
  like_count: number
  comment_count: number
  is_story: boolean
  created_at: string
  updated_at: string
}

export interface AdminCommentRow {
  id: string
  post_id: string
  author: FeedAuthorBrief
  parent_id: string | null
  content: string | null
  has_image: boolean
  like_count: number
  created_at: string
}

export interface FeedListParams {
  page?: number
  size?: number
}

export interface FeedWriteBody {
  content?: string | null
  is_story: boolean
  image_content_ids: string[]
}

export function useFeedList(params: FeedListParams) {
  return useQuery({
    queryKey: ['feed', params],
    queryFn: () => api<Page<AdminFeedRow>>(`/admin/api/community/feed${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function useFeedPost(id: string) {
  return useQuery({
    queryKey: ['feed', id],
    queryFn: () => api<AdminFeedDetail>(`/admin/api/community/feed/${id}`),
    enabled: !!id,
  })
}

export function useFeedComments(id: string) {
  return useQuery({
    queryKey: ['feed', id, 'comments'],
    queryFn: () => api<AdminCommentRow[]>(`/admin/api/community/feed/${id}/comments`),
    enabled: !!id,
  })
}

export function useCreateFeedPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FeedWriteBody) =>
      api<AdminFeedDetail>('/admin/api/community/feed', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  })
}

export function useUpdateFeedPost(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FeedWriteBody) =>
      api<AdminFeedDetail>(`/admin/api/community/feed/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  })
}

export function useDeleteFeedPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/api/community/feed/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  })
}
