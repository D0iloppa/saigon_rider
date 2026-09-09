import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

/** F033 — 수동 QR 거래 조회. payment_status 는 여기서 바꾸지 않는다(운영자 메모만 가능) —
 *  232_marketplace_transactions.sql: 플랫폼이 결제를 보증하지 않는다는 설계 원칙. */

export interface TransactionParty {
  id: string | null
  nickname: string | null
}

export type TransactionPaymentStatus = 'AWAITING_PAYMENT' | 'PAYMENT_REPORTED' | 'PAYMENT_CONFIRMED'

export interface TransactionRow {
  appointment_id: string
  listing_id: string
  listing_title: string
  amount_vnd: number
  payment_status: TransactionPaymentStatus
  buyer: TransactionParty
  seller: TransactionParty
  created_at: string
  updated_at: string
}

export interface TransactionMemo {
  admin_username: string
  note: string
  created_at: string
}

export interface TransactionDetail extends TransactionRow {
  conversation_id: string
  payment_method: string
  appointment_status: string
  when_at: string
  buyer_reported_at: string | null
  seller_confirmed_at: string | null
  qr_registered: boolean
  memos: TransactionMemo[]
}

export interface TransactionListParams {
  payment_status?: TransactionPaymentStatus
  date_from?: string
  date_to?: string
  page?: number
  size?: number
}

export function useTransactions(params: TransactionListParams) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => api<Page<TransactionRow>>(`/admin/api/transactions${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function useTransaction(appointmentId: string) {
  return useQuery({
    queryKey: ['transaction', appointmentId],
    queryFn: () => api<TransactionDetail>(`/admin/api/transactions/${appointmentId}`),
    enabled: !!appointmentId,
  })
}

export function useAddTransactionMemo(appointmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (note: string) =>
      api<void>(`/admin/api/transactions/${appointmentId}/memo`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transaction', appointmentId] }),
  })
}
