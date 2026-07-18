import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

export interface AdminAuditLogRow {
  id: number
  admin_username: string
  admin_role: string
  action: string
  target_type: string | null
  target_id: string | null
  detail: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

export interface AuditLogListParams {
  admin?: string
  action?: string
  target_type?: string
  page?: number
  size?: number
}

export function useAuditLogs(params: AuditLogListParams) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => api<Page<AdminAuditLogRow>>(`/admin/api/audit-logs${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}
