import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

export interface UserBrief {
  id: string
  nickname: string | null
}

export interface ReportedUserBrief extends UserBrief {
  status: string
  report_count: number
}

export interface ListingBrief {
  id: string
  title: string
  status: string
}

export interface ReportRow {
  id: string
  target_type: 'LISTING' | 'USER' | 'DM'
  reason: string
  note: string | null
  status: 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'REJECTED'
  created_at: string
  reporter: UserBrief
  reported_user: ReportedUserBrief
  listing: ListingBrief | null
  conversation_id: string | null
  handled_by: string | null
  handled_at: string | null
}

export interface SanctionBrief {
  id: string
  type: string
  reason: string
  ends_at: string | null
  admin_username: string
  created_at: string
}

export interface ReportDetail extends ReportRow {
  resolution_note: string | null
  reported_user_summary: {
    sanctions: SanctionBrief[]
    report_count: number
    manner_temp: number | null
    phone_verified: boolean
  }
  listing_detail: {
    id: string
    title: string
    description: string | null
    price_vnd: number
    status: string
    created_at: string
    image_urls: string[]
  } | null
}

export interface ReportListParams {
  target_type?: string
  status?: string
  page?: number
  size?: number
}

export function useReports(params: ReportListParams) {
  return useQuery({
    queryKey: ['reports', params],
    queryFn: () => api<Page<ReportRow>>(`/admin/api/reports${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function useReport(id: string) {
  return useQuery({
    queryKey: ['reports', id],
    queryFn: () => api<ReportDetail>(`/admin/api/reports/${id}`),
    enabled: !!id,
  })
}

export interface ReportStatusUpdateBody {
  status: 'REVIEWING' | 'RESOLVED' | 'REJECTED'
  resolution_note?: string
}

export function useUpdateReportStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReportStatusUpdateBody) =>
      api(`/admin/api/reports/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export interface DmMessageRow {
  id: string
  sender_id: string
  sender_nickname: string | null
  content: string | null
  message_type: string
  image_url: string | null
  created_at: string
}

export function useReportDmMessages(reportId: string, page: number) {
  return useQuery({
    queryKey: ['reports', reportId, 'dm-messages', page],
    queryFn: () => api<Page<DmMessageRow>>(`/admin/api/reports/${reportId}/dm-messages${buildQuery({ page })}`),
    placeholderData: keepPreviousData,
  })
}
