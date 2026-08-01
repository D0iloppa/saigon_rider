import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

export interface UserBrief {
  id: string
  nickname: string | null
}

export interface TicketRow {
  id: string
  title: string
  user: UserBrief
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
  has_unread_reply: boolean
  created_at: string
  last_reply_at: string | null
}

export interface ReplyRow {
  id: number
  author_type: string
  body: string
  created_at: string
}

export interface TicketDetail extends TicketRow {
  body: string
  replies: ReplyRow[]
}

export interface TicketListParams {
  status?: string
  page?: number
  size?: number
}

export function useTickets(params: TicketListParams) {
  return useQuery({
    queryKey: ['support-tickets', params],
    queryFn: () => api<Page<TicketRow>>(`/admin/api/support/tickets${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['support-tickets', id],
    queryFn: () => api<TicketDetail>(`/admin/api/support/tickets/${id}`),
    enabled: !!id,
  })
}

export function useCreateReply(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      api<TicketDetail>(`/admin/api/support/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })
}

export function useUpdateTicketStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') =>
      api<TicketDetail>(`/admin/api/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })
}
