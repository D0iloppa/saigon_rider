import { useQuery } from '@tanstack/react-query'
import { api, buildQuery } from './client'

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
