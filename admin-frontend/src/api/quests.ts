import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

export interface QuestRow {
  id: string
  title_ko: string | null
  title_vi: string | null
  title_en: string | null
  period: string
  district_id: number | null
  district_name: string | null
  required_level: number
  target_distance_km: string
  badge: string | null
  is_active: boolean
  reward_exp: number
  reward_gold: number
  reward_item: string | null
  starts_at: string | null
  ends_at: string | null
  main_content_id: string | null
  thumbnail_content_id: string | null
  banner_content_id: string | null
  main_image_url: string | null
  thumbnail_image_url: string | null
  banner_image_url: string | null
  created_at: string
}

export interface QuestWriteBody {
  title_ko: string
  title_vi?: string | null
  title_en?: string | null
  period: string
  district_id: number | null
  required_level: number
  target_distance_km: string
  badge: string | null
  is_active: boolean
  reward_exp: number
  reward_gold: number
  reward_item: string | null
  starts_at: string | null
  ends_at: string | null
  main_content_id: string | null
  thumbnail_content_id: string | null
  banner_content_id: string | null
}

export interface QuestMeta {
  districts: { id: number; name_ko: string }[]
  periods: string[]
  badges: string[]
}

export interface QuestListParams {
  q?: string
  period?: string
  active?: string
  page?: number
  size?: number
}

export function useQuestMeta() {
  return useQuery({
    queryKey: ['quest-meta'],
    queryFn: () => api<QuestMeta>('/admin/api/quests/meta'),
    staleTime: Infinity,
  })
}

export function useQuests(params: QuestListParams) {
  return useQuery({
    queryKey: ['quests', params],
    queryFn: () => api<Page<QuestRow>>(`/admin/api/quests${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function useCreateQuest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: QuestWriteBody) => api<QuestRow>('/admin/api/quests', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quests'] }),
  })
}

export function useUpdateQuest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: QuestWriteBody }) =>
      api<QuestRow>(`/admin/api/quests/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quests'] }),
  })
}

export function useDeleteQuest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/api/quests/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quests'] }),
  })
}
