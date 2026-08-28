import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

export interface AdminUserRow {
  id: string
  nickname: string | null
  phone: string | null
  level: number
  manner_temp: number
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'
  suspended_until: string | null
  phone_verified: boolean
  created_at: string
  last_seen_at: string | null
  report_count: number
  listing_count: number
}

export interface UserSanctionRow {
  id: string
  type: string
  reason: string
  report_id: string | null
  ends_at: string | null
  admin_username: string
  created_at: string
}

export interface UserRecentReport {
  id: string
  target_type: string
  reason: string
  status: string
  created_at: string
}

export interface UserDetail extends AdminUserRow {
  phone_verified_at: string | null
  sanctions: UserSanctionRow[]
  recent_reports: UserRecentReport[]
  oauth_providers: string[]
}

export interface UserListParams {
  q?: string
  status?: string
  page?: number
  size?: number
}

export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => api<Page<AdminUserRow>>(`/admin/api/users${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function useUser(id: string, reason: string) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => api<UserDetail>(`/admin/api/users/${id}${buildQuery({ reason })}`),
    enabled: !!id && !!reason,
  })
}

export interface UserActionEvent {
  [key: string]: unknown
}

export interface UserActionEventsResponse {
  engine_reachable: boolean
  events: UserActionEvent[]
}

export function useUserActionEvents(id: string) {
  return useQuery({
    queryKey: ['users', id, 'action-events'],
    queryFn: () => api<UserActionEventsResponse>(`/admin/api/action-events/users/${id}`),
    enabled: !!id,
  })
}

export interface UserDevice {
  device_uuid: string | null
  fcm_token: string | null
  logged_in_at: string | null
}

export function useUserDevice(id: string) {
  return useQuery({
    queryKey: ['users', id, 'device'],
    queryFn: () => api<UserDevice>(`/admin/api/users/${id}/device`),
    enabled: !!id,
  })
}

export interface SanctionCreateBody {
  type: 'WARN' | 'SUSPEND' | 'BAN'
  reason: string
  days?: number
  report_id?: string
}

export function useCreateSanction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: SanctionCreateBody }) =>
      api<UserDetail>(`/admin/api/users/${userId}/sanctions`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export function useLiftSanction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      api<UserDetail>(`/admin/api/users/${userId}/sanctions/lift`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useResetPhoneVerification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api<UserDetail>(`/admin/api/users/${userId}/phone-verification/reset`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
