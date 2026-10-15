import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, buildQuery } from './client'

export interface Mailbox {
  address: string
}

export interface MailMessageRow {
  uid: number
  from_name: string
  from_addr: string
  subject: string
  date: string | null
  seen: boolean
  has_attachments: boolean
  size: number
}

export interface MailMessagePage {
  total: number
  items: MailMessageRow[]
}

export interface MailAttachment {
  index: number
  filename: string
  content_type: string
  size: number
}

export interface MailMessageDetail {
  uid: number
  from: string
  to: string
  cc: string
  subject: string
  date: string | null
  text: string | null
  html: string | null
  attachments: MailAttachment[]
}

export function useMailboxes() {
  return useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => api<Mailbox[]>('/admin/api/mailboxes'),
  })
}

export function useMailMessages(address: string, page: number, size: number) {
  return useQuery({
    queryKey: ['mailbox-messages', address, page, size],
    queryFn: () =>
      api<MailMessagePage>(`/admin/api/mailboxes/${encodeURIComponent(address)}/messages${buildQuery({ page, size })}`),
    enabled: !!address,
    placeholderData: keepPreviousData,
  })
}

export function useMailMessage(address: string, uid: number | null) {
  return useQuery({
    queryKey: ['mailbox-message', address, uid],
    queryFn: () => api<MailMessageDetail>(`/admin/api/mailboxes/${encodeURIComponent(address)}/messages/${uid}`),
    enabled: !!address && uid !== null,
  })
}

export function attachmentUrl(address: string, uid: number, index: number): string {
  return `/admin/api/mailboxes/${encodeURIComponent(address)}/messages/${uid}/attachments/${index}`
}
