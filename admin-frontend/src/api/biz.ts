import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiUpload, buildQuery } from './client'

// ── 비즈니스 계정 심사 ─────────────────────────────────────────────

export interface BizAccountRow {
  id: string
  created_at: string
  name: string
  category: string | null
  address: string | null
  phone: string | null
  photo_url: string | null
  applicant_id: string | null
  applicant_nickname: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  reject_reason: string | null
  verification_status: 'pending' | 'docs_submitted' | 'verified' | 'rejected'
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
  // 검증축 (init/151) — 계정 승인축과 별개
  rep_name: string | null
  biz_license_url: string | null
  signboard_url: string | null
  verified_at: string | null
  verification_reject_reason: string | null
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

export interface BizCategory {
  code: string
  group_code: string
  group_label_ko: string
  label_ko: string
  sort_order: number
}

export interface BizAccountCreateInput {
  name: string
  category?: string | null
  address: string
  latitude: number
  longitude: number
  phone: string
  photo_content_id?: string | null
  intro?: string | null
}

export function useBizCategories() {
  return useQuery({
    queryKey: ['biz', 'categories'],
    queryFn: () => api<BizCategory[]>('/admin/api/biz/categories'),
  })
}

export function useUploadBizPhoto() {
  return useMutation({
    mutationFn: (file: File) => apiUpload<{ id: string; imgproxy_url: string }>('/admin/api/biz/upload', file),
  })
}

export function useCreateBizAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BizAccountCreateInput) =>
      api<BizAccountRow>('/admin/api/biz/accounts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'accounts'] }),
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

// ── 검증 심사 (init/151 — 계정 승인축과 별개) ──────────────────────

export function useVerifyBizAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/admin/api/biz/accounts/${id}/verify`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'accounts'] }),
  })
}

export function useRejectBizAccountVerification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/admin/api/biz/accounts/${id}/reject-verification`, { method: 'POST', body: JSON.stringify({ reason }) }),
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
  is_ongoing: boolean
  subscription_status: 'pending_payment' | 'active' | 'expired'
  tier_id: string
  tier_name: string
  monthly_price_snapshot_vnd: number
  ad_fee: number
}

export function useBizAds(status?: string) {
  return useQuery({
    queryKey: ['biz', 'ads', status],
    queryFn: () => api<BizAdRow[]>(`/admin/api/biz/ads${buildQuery({ status })}`),
  })
}

export function useBizAd(id: string) {
  return useQuery({
    queryKey: ['biz', 'ads', 'detail', id],
    queryFn: () => api<BizAdRow>(`/admin/api/biz/ads/${id}`),
    enabled: !!id,
  })
}

/** 특정 파트너 소유 광고 목록. launching=true 면 현재 론칭중(승인+활성+게시기간 내)인 것만. */
export function useBizAdsByPartner(profileId: string, launching?: boolean) {
  return useQuery({
    queryKey: ['biz', 'ads', 'partner', profileId, launching],
    queryFn: () =>
      api<BizAdRow[]>(
        `/admin/api/biz/ads${buildQuery({ profile_id: profileId, launching: launching ? 'true' : undefined })}`
      ),
    enabled: !!profileId,
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

export function useActivateBizAdSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/admin/api/biz/ads/${id}/activate-subscription`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'ads'] }),
  })
}

// ── 광고 티어 정책 ─────────────────────────────────────────────────

export interface BizAdTier {
  id: string
  name: string
  monthly_price_vnd: number
  exposure_weight: number
  is_active: boolean
  display_order: number
  features_json: string[] | null
}

export type BizAdTierInput = Omit<BizAdTier, 'id'>

export function useBizAdTiers() {
  return useQuery({
    queryKey: ['biz', 'ad-tiers'],
    queryFn: () => api<BizAdTier[]>('/admin/api/biz/ad-tiers'),
  })
}

export function useCreateBizAdTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BizAdTierInput) =>
      api<BizAdTier>('/admin/api/biz/ad-tiers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biz', 'ad-tiers'] }),
  })
}

export function useUpdateBizAdTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: BizAdTier) =>
      api<BizAdTier>(`/admin/api/biz/ad-tiers/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz', 'ad-tiers'] })
      qc.invalidateQueries({ queryKey: ['biz', 'ads'] })
    },
  })
}
