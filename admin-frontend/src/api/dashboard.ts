import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface ReasonCount {
  reason: string
  count: number
}

export interface DashboardSummary {
  dau: number
  new_users_today: number
  new_users_7d: number
  listings_today: number
  listings_7d: number
  listings_on_sale: number
  listings_hidden: number
  trades_today: number
  trades_7d: number
  reports_today: number
  reports_open: number
  reports_resolved_7d: number
  tickets_today: number
  tickets_open: number
  first_reply_sla_hours: number | null
  users_suspended: number
  users_banned: number
  reports_by_reason: ReasonCount[]
  biz_partners_pending: number
  biz_ads_pending: number
  biz_partners_approved: number
  biz_partners_new_today: number
  biz_partners_new_7d: number
  biz_partners_suspended: number
  biz_ads_launching: number
  biz_ads_today: number
  biz_ads_7d: number
  biz_ads_tier_gold: number
  biz_ads_tier_silver: number
  biz_ads_tier_bronze: number
  biz_ads_fee_sum: number
}

export interface DailyPoint {
  date: string
  new_users: number
  new_listings: number
  trades_completed: number
  reports_created: number
  tickets_created: number
  new_partners: number
  new_ads: number
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api<DashboardSummary>('/admin/api/dashboard/summary'),
    refetchInterval: 60_000,
  })
}

export function useDashboardDaily(days = 14) {
  return useQuery({
    queryKey: ['dashboard', 'daily', days],
    queryFn: () => api<DailyPoint[]>(`/admin/api/dashboard/daily?days=${days}`),
  })
}
