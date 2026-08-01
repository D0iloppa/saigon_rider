import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface DailyNetRow {
  day: string
  currency: string
  earned: number
  spent: number
  net: number
}

export interface GachaRoiRow {
  gacha_code: string
  pulls: number
  unique_users: number
  avg_rarity_score: number
  pity_hits: number
  dup_rate_pct: number
}

export interface ChannelRatioRow {
  source: string
  purchases: number
  users: number
}

export interface PityDistributionRow {
  gacha_code: string
  pity_count: number
  users: number
}

export function useOpsDailyNet() {
  return useQuery({
    queryKey: ['ops', 'daily-net'],
    queryFn: () => api<DailyNetRow[]>('/admin/api/ops/daily-net'),
  })
}

export function useOpsGachaRoi() {
  return useQuery({
    queryKey: ['ops', 'gacha-roi'],
    queryFn: () => api<GachaRoiRow[]>('/admin/api/ops/gacha-roi'),
  })
}

export function useOpsChannelRatio() {
  return useQuery({
    queryKey: ['ops', 'channel-ratio'],
    queryFn: () => api<ChannelRatioRow[]>('/admin/api/ops/channel-ratio'),
  })
}

export function useOpsPityDistribution() {
  return useQuery({
    queryKey: ['ops', 'pity-distribution'],
    queryFn: () => api<PityDistributionRow[]>('/admin/api/ops/pity-distribution'),
  })
}
