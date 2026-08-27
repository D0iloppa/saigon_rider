import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

/** 업체 후기 모더레이션 (HIDE/RESTORE) — 016 §8-2 P-BAD-REVIEW, 대표 지적 2026-08-18.
 * 업체가 정당한 후기를 "악성리뷰"로 신고해도 운영자가 조치할 수단이 없던 갭을 메운다.
 * 신고는 큐에 적재만(M1, 탐지≠차단) — 조치는 운영자가 명시적으로 누를 때만 일어난다. */

export interface ReviewReportBrief {
  id: string
  reporter: { id: string; nickname: string | null }
  reason: string
  note: string | null
  status: string
  created_at: string
}

export interface ReviewDetail {
  id: string
  profile_id: string
  user_id: string
  rating: number
  body: string
  owner_reply: string | null
  owner_replied_at: string | null
  created_at: string
  hidden_at: string | null
  hidden_reason: string | null
  hidden_reason_code: string | null
  hidden_by: string | null
  reports: ReviewReportBrief[]
}

export function useReview(reviewId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', reviewId],
    queryFn: () => api<ReviewDetail>(`/admin/api/reviews/${reviewId}`),
    enabled: !!reviewId,
  })
}

// O-1(260827) — 사장님에게는 원문(reason) 대신 이 코드만 i18n 매핑해 보여준다.
// 신고 사유(frontend/src/api/biz.ts BizReviewReportReason)와 동일 코드셋.
export const HIDDEN_REASON_CODES = ['SPAM', 'ABUSE', 'INAPPROPRIATE', 'OTHER'] as const
export type HiddenReasonCode = (typeof HIDDEN_REASON_CODES)[number]

export interface ReviewModerateBody {
  action: 'HIDE' | 'RESTORE'
  reason: string
  reason_code?: HiddenReasonCode
  report_id?: string
}

export function useModerateReview(reviewId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReviewModerateBody) =>
      api(`/admin/api/reviews/${reviewId}/moderate`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', reviewId] })
    },
  })
}
