import { useQuery } from '@tanstack/react-query'
import { api } from './client'

/** 오늘의 조치 큐 — GET /admin/api/action-queue/summary. 신고/문의/파트너승인/광고승인/완료요청/제보
 * 6종 대기열을 건수+상위 5건 미리보기로 요약한다(과설계 금지 — 전체 목록 재구현 아님). */
export interface ActionQueueItem {
  id: string
  title: string
  subtitle: string | null
  created_at: string
  route: string
}

export interface ActionQueueSection {
  key: string
  label: string
  count: number
  items: ActionQueueItem[]
}

export interface ActionQueueSummary {
  sections: ActionQueueSection[]
}

export function useActionQueueSummary() {
  return useQuery({
    queryKey: ['action-queue', 'summary'],
    queryFn: () => api<ActionQueueSummary>('/admin/api/action-queue/summary'),
  })
}
