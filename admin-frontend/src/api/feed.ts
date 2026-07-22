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
  latitude: number | string | null
  longitude: number | string | null
  district_name: string | null
  like_count: number
  comment_count: number
  is_story: boolean
  created_at: string
  updated_at: string
}

export interface FeedListParams {
  page?: number
  size?: number
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

export function useDeleteFeedPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/api/community/feed/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  })
}
