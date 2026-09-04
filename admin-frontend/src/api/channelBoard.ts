import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { MetricStatus } from './dashboard'

export interface ChannelSlot {
  key: string
  label: string
  status: MetricStatus
  headline: number | null
  detail_path: string | null
}

export interface ChannelBoardOut {
  generated_at: string
  slots: ChannelSlot[]
}

export function useChannelBoard() {
  return useQuery({
    queryKey: ['analytics', 'channel-board'],
    queryFn: () => api<ChannelBoardOut>('/admin/api/analytics/channel-board'),
  })
}
