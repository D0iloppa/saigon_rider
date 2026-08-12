import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

/** S-16 / D-7 — 거래 완료 이의 큐. 구매자가 완료를 요청했는데 판매자가 확인하지 않거나 거절한 건. */

export interface TradeParty {
  id: string | null
  nickname: string | null
}

export interface CompletionRequestRow {
  appointment_id: string
  listing_id: string
  listing_title: string
  listing_status: string
  price_vnd: number
  when_at: string
  seller: TradeParty
  buyer: TradeParty
  completion_requested_at: string
  completion_declined_at: string | null
  pending_hours: number
}

export type CompletionRequestState = 'pending' | 'declined' | 'all'

export interface CompletionRequestListParams {
  state?: CompletionRequestState
  min_pending_hours?: number
  page?: number
  size?: number
}

export function useCompletionRequests(params: CompletionRequestListParams) {
  return useQuery({
    queryKey: ['completion-requests', params],
    queryFn: () =>
      api<Page<CompletionRequestRow>>(`/admin/api/trades/completion-requests${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

/** 강제완료(거래를 완료로 확정) / 기각(요청만 내림) — 둘 다 사유 필수. */
export function useResolveCompletionRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      appointmentId,
      action,
      reason,
    }: {
      appointmentId: string
      action: 'force-complete' | 'dismiss'
      reason: string
    }) =>
      api<{ ok: boolean }>(`/admin/api/trades/completion-requests/${appointmentId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['completion-requests'] })
      // 강제완료는 매물을 SOLD 로 바꾼다.
      qc.invalidateQueries({ queryKey: ['listings'] })
    },
  })
}
