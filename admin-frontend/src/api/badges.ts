import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface BadgeCondition {
  metric: string
  op: string
  value: number
}

export interface BadgeConditionRule {
  operator: 'AND' | 'OR'
  conditions: BadgeCondition[]
}

export interface BadgeRow {
  id: string
  name: string
  name_ko: string | null
  name_vi: string | null
  name_en: string | null
  description_ko: string | null
  description_vi: string | null
  description_en: string | null
  icon_url: string | null
  icon_content_id: string | null
  icon_display_url: string | null
  condition_rule: BadgeConditionRule | null
  is_active: boolean
  earned_count: number
  created_at: string
}

export interface BadgeWriteBody {
  name: string
  name_ko?: string | null
  name_vi?: string | null
  name_en?: string | null
  description_ko?: string | null
  description_vi?: string | null
  description_en?: string | null
  icon_url?: string | null
  icon_content_id?: string | null
  is_active: boolean
  condition_rule: BadgeConditionRule | null
}

export interface BadgeMeta {
  metrics: { code: string; label: string }[]
  ops: string[]
}

export function useBadgeMeta() {
  return useQuery({
    queryKey: ['badge-meta'],
    queryFn: () => api<BadgeMeta>('/admin/api/badges/meta'),
    staleTime: Infinity,
  })
}

export function useBadges() {
  return useQuery({
    queryKey: ['badges'],
    queryFn: () => api<BadgeRow[]>('/admin/api/badges'),
  })
}

export function useCreateBadge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BadgeWriteBody) => api<BadgeRow>('/admin/api/badges', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

export function useUpdateBadge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BadgeWriteBody }) =>
      api<BadgeRow>(`/admin/api/badges/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}

export function useDeleteBadge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/api/badges/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['badges'] }),
  })
}
