import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery } from './client'

export interface PushUser {
  user_id: number
  external_user_uuid: string
  fcm_token: string
  device_uuid: string
  nickname?: string
}

export interface PushHistoryRow {
  sent_at: string
  title: string
  mode: string
  sent_count: number
  failed_count: number
  sender: string
}

export interface SendPushBody {
  title: string
  body: string
  mode: 'broadcast' | 'individual'
  user_ids?: number[]
}

export interface SendPushResult {
  success: boolean
  sent_count?: number
  failed_count?: number
  [key: string]: unknown
}

export function usePushUsers(q = '') {
  return useQuery({
    queryKey: ['push', 'users', q],
    queryFn: () => api<PushUser[]>(`/admin/api/push/users${buildQuery({ q })}`),
  })
}

export function usePushHistory(limit = 50) {
  return useQuery({
    queryKey: ['push', 'history', limit],
    queryFn: () => api<PushHistoryRow[]>(`/admin/api/push/history${buildQuery({ limit })}`),
  })
}

export function useSendPush() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SendPushBody) => api<SendPushResult>('/admin/api/push/send', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['push', 'history'] }),
  })
}
