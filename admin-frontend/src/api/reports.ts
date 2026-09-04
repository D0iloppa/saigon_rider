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
  target_type: 'LISTING' | 'USER' | 'DM' | 'REVIEW'
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
  assignee_username: string | null
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
  // R-2(260819 W3) — resolution_note(내부 메모)와 분리된 신고자 공개용 요약 사유. 종결 재편집 시 프리필용.
  public_resolution_summary: string | null
  // 후기(REVIEW)/업체(BIZ) 신고 자동 연결용 — listing_detail 처럼 상세 객체를 만들지 않고
  // id 만 흘려보낸다(GET /admin/api/reviews/{id} 가 후기 원문+신고내역을 이미 함께 준다,
  // 대표 지적 2026-08-18 핵심 갭 수정).
  review_id?: string | null
  business_profile_id?: string | null
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
  // 신고 코멘트 + 사진 첨부(197, 대표 지적 2026-08-18) — note 는 ReportRow 에 이미 있음
  report_images: string[]
}

export interface ReportListParams {
  target_type?: string
  status?: string
  assignee?: string
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
  // R-2(260819 W3) — 비어있으면 저장하지 않고 신고자 통보는 고정 문구로 폴백.
  public_resolution_summary?: string
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

export function useAssignReport(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assignee_username: string | null) =>
      api<{ id: string; assignee_username: string | null }>(`/admin/api/reports/${id}/assignee`, {
        method: 'PATCH',
        body: JSON.stringify({ assignee_username }),
      }),
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
