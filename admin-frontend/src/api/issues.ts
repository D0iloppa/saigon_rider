import { useQuery } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

/** 통합 이슈 큐 — GET /admin/api/issues (016 §8-3 #25). reports+support_tickets 병합, 심각도 순. */
export interface IssueRow {
  kind: 'REPORT' | 'TICKET'
  id: string
  source: 'REPORT' | 'APP' | 'BIZ' | 'EXTERNAL'
  persona: string | null
  category: string
  severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4'
  status: string
  created_at: string
  title: string | null
  priority_score: number
  assignee_username: string | null
}

export interface IssueListParams {
  source?: string
  assignee?: string
  limit?: number
}

export function useIssues(params: IssueListParams) {
  return useQuery({
    queryKey: ['issues', params],
    queryFn: () => api<IssueRow[]>(`/admin/api/issues${buildQuery({ ...params })}`),
  })
}

/** 주간 유형별 집계 — GET /admin/api/issues/weekly-summary (016 §8-3 #26, [학습] 단계). */
export interface CategoryStat {
  category: string
  count: number
  median_resolution_hours: number | null
}

export function useWeeklyIssueSummary(days: number) {
  return useQuery({
    queryKey: ['issues', 'weekly-summary', days],
    queryFn: () => api<CategoryStat[]>(`/admin/api/issues/weekly-summary${buildQuery({ days })}`),
  })
}

/** 신고자 신뢰도 — GET /admin/api/reports/reporters (R-5, 017 §12-B). 검수 큐 정렬 참고자료(조회 전용). */
export interface ReporterTrustRow {
  reporter_id: string
  reporter_nickname: string | null
  total_reports: number
  resolved_count: number
  rejected_count: number
  cancelled_count: number
  rejection_rate: number | null // 표본(5건) 미달 시 null — 가짜 0% 금지
  last_reported_at: string
}

export interface ReporterTrustParams {
  page?: number
  size?: number
}

export function useReporterTrust(params: ReporterTrustParams) {
  return useQuery({
    queryKey: ['reports', 'reporters', params],
    queryFn: () => api<Page<ReporterTrustRow>>(`/admin/api/reports/reporters${buildQuery({ ...params })}`),
  })
}
