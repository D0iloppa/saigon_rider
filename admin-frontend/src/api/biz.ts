import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery } from './client'

// ── 비즈니스 계정 심사 ─────────────────────────────────────────────

export interface BizAccountRow {
  id: string
  created_at: string
  name: string
  category: string | null
  address: string | null
  phone: string | null
  photo_url: string | null
  applicant_id: string
  applicant_nickname: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  reject_reason: string | null
}

export interface BizAccountAdBrief {
  id: string
  title: string
  review_status: string
  created_at: string
}

export interface BizGroupBrief {
  id: string
  name: string
}

export interface BizAccountDetail extends BizAccountRow {
  latitude: number | string | null
  longitude: number | string | null
  group_id: string | null
  group_name: string | null
  reviewed_at: string | null
  ads: BizAccountAdBrief[]
  groups: BizGroupBrief[]
}

export function useBizAccounts(status?: string) {
  return useQuery({
    queryKey: ['biz', 'accounts', status],
    queryFn: () => api<BizAccountRow[]>(`/admin/api/biz/accounts${buildQuery({ status })}`),
  })
}

export function useBizAccount(id: string) {
  return useQuery({
    queryKey: ['biz', 'accounts', id],
    queryFn: () => api<BizAccountDetail>(`/admin/api/biz/accounts/${id}`),
    enabled: !!id,
  })
}

export function useApproveBizAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/admin/api/biz/accounts/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'accounts'] }),
  })
}

export function useRejectBizAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/admin/api/biz/accounts/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'accounts'] }),
  })
}

export function useSuspendBizAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/admin/api/biz/accounts/${id}/suspend`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'accounts'] }),
  })
}

export function useAssignBizAccountGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, group_id, new_group_name }: { id: string; group_id?: string | null; new_group_name?: string }) =>
      api(`/admin/api/biz/accounts/${id}/group`, {
        method: 'POST',
        body: JSON.stringify({ group_id: group_id || null, new_group_name: new_group_name || null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'accounts'] }),
  })
}

// ── 광고 소재 심사 ─────────────────────────────────────────────────

export interface BizAdRow {
  id: string
  created_at: string
  title: string
  body: string | null
  image_url: string | null
  starts_at: string | null
  ends_at: string | null
  partner_name: string
  profile_id: string | null
  profile_name: string | null
  profile_status: string | null
  review_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'STOPPED'
  reject_reason: string | null
}

export function useBizAds(status?: string) {
  return useQuery({
    queryKey: ['biz', 'ads', status],
    queryFn: () => api<BizAdRow[]>(`/admin/api/biz/ads${buildQuery({ status })}`),
  })
}

export function useApproveBizAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/admin/api/biz/ads/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'ads'] }),
  })
}

export function useRejectBizAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/admin/api/biz/ads/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'ads'] }),
  })
}
