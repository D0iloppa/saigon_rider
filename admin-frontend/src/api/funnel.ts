import { useQuery } from '@tanstack/react-query'
import { api, buildQuery } from './client'
import type { MetricStatus } from './dashboard'

export interface SegmentedFunnelRow {
  week_start: string
  acq_source: string
  persona: string
  ward_id: number | null
  signups: number
  verified_phone: number
  searched: number
  listing_viewed: number
  inquiry_started: number
  contact_exchanged: number
  deal_completed: number
}

export interface SegmentedFunnelParams {
  days?: number
  acq_source?: string
  persona?: string
}

export function useSegmentedFunnel(params: SegmentedFunnelParams) {
  return useQuery({
    queryKey: ['funnel', 'segmented', params],
    queryFn: () =>
      api<SegmentedFunnelRow[]>(
        `/admin/api/funnel/segmented${buildQuery({
          days: params.days,
          acq_source: params.acq_source,
          persona: params.persona,
        })}`,
      ),
  })
}

export interface DailyFunnelPoint {
  date: string
  counts: Record<string, number>
}

export function useDailyFunnel(days = 14) {
  return useQuery({
    queryKey: ['funnel', 'daily', days],
    queryFn: () => api<DailyFunnelPoint[]>(`/admin/api/funnel/daily${buildQuery({ days })}`),
  })
}

export interface TopReferrer {
  inviter_user_id: string
  inviter_nickname: string | null
  signup_count: number
}

export interface TopReferrerParams {
  days?: number
  limit?: number
}

export function useTopReferrers(params: TopReferrerParams) {
  return useQuery({
    queryKey: ['funnel', 'referrals', 'top', params],
    queryFn: () =>
      api<TopReferrer[]>(`/admin/api/funnel/referrals/top${buildQuery({ days: params.days, limit: params.limit })}`),
  })
}

export interface ZeroResultSearchTerm {
  query: string
  search_count: number
}

export interface ZeroResultSearchParams {
  days?: number
  limit?: number
}

export function useZeroResultSearches(params: ZeroResultSearchParams) {
  return useQuery({
    queryKey: ['funnel', 'zero-results', params],
    queryFn: () =>
      api<ZeroResultSearchTerm[]>(
        `/admin/api/funnel/search/zero-results${buildQuery({ days: params.days, limit: params.limit })}`,
      ),
  })
}

export interface FirstTouchRow {
  utm_source: string
  utm_medium: string
  anon_count: number
  linked_count: number
  conversion_rate: number | null
}

export interface FirstTouchOut {
  status: MetricStatus
  rows: FirstTouchRow[]
}

export function useFirstTouch(days = 90) {
  return useQuery({
    queryKey: ['funnel', 'first-touch', days],
    queryFn: () => api<FirstTouchOut>(`/admin/api/funnel/first-touch${buildQuery({ days })}`),
  })
}
