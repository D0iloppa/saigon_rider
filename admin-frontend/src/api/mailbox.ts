import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, apiUpload, buildQuery } from './client'

export type MailFolder = 'inbox' | 'sent' | 'trash'
export type ComposeMode = 'new' | 'reply' | 'reply_all' | 'forward'

export interface Mailbox {
  address: string
}

export interface MailFolderStatus {
  key: MailFolder
  total: number
  unseen: number
}

export interface MailMessageRow {
  uid: number
  from_name: string
  from_addr: string
  to: string
  subject: string
  date: string | null
  seen: boolean
  answered: boolean
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
  message_id: string
  reply_to: string[]
  to_addrs: string[]
  cc_addrs: string[]
  text: string | null
  html: string | null
  attachments: MailAttachment[]
}

export interface MailReadReceipt {
  id: number
  message_id: string
  recipient_email: string
  subject: string | null
  sent_at: string
  first_opened_at: string | null
  open_count: number
}

/** 수신자별 SMTP 결과 — 한 명이라도 나갔으면 200(부분 실패 포함), 전원 실패만 502. */
export interface SendMailResult {
  message_id: string
  sent: string[]
  failed: { address: string; error: string }[]
  sent_copy_saved: boolean
}

export interface SendMailInput {
  mode: ComposeMode
  to: string[]
  cc: string[]
  subject: string
  body: string
  orig_folder?: MailFolder
  orig_uid?: number
  include_original_attachments?: boolean
  files: File[]
}

const base = (address: string) => `/admin/api/mailboxes/${encodeURIComponent(address)}`

export function useMailboxes() {
  return useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => api<Mailbox[]>('/admin/api/mailboxes'),
  })
}

export function useMailFolders(address: string) {
  return useQuery({
    queryKey: ['mailbox-folders', address],
    queryFn: () => api<MailFolderStatus[]>(`${base(address)}/folders`),
    enabled: !!address,
  })
}

export function useMailMessages(address: string, folder: MailFolder, page: number, size: number, enabled = true) {
  return useQuery({
    queryKey: ['mailbox-messages', address, folder, page, size],
    queryFn: () => api<MailMessagePage>(`${base(address)}/messages${buildQuery({ folder, page, size })}`),
    enabled: !!address && enabled,
    placeholderData: keepPreviousData,
  })
}

export function useMailMessage(address: string, folder: MailFolder, uid: number | null) {
  return useQuery({
    queryKey: ['mailbox-message', address, folder, uid],
    queryFn: () => api<MailMessageDetail>(`${base(address)}/messages/${uid}${buildQuery({ folder })}`),
    enabled: !!address && uid !== null,
  })
}

/** messageId 를 주면 그 발송 건만(보낸메일함 상세 배지), 없으면 메일함 전체(수신확인 화면). */
export function useReadReceipts(address: string, messageId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['mailbox-receipts', address, messageId ?? ''],
    queryFn: () => api<MailReadReceipt[]>(`${base(address)}/read-receipts${buildQuery({ message_id: messageId ?? undefined })}`),
    enabled: !!address && enabled,
  })
}

export function attachmentUrl(address: string, folder: MailFolder, uid: number, index: number): string {
  return `${base(address)}/messages/${uid}/attachments/${index}${buildQuery({ folder })}`
}

export function setSeen(address: string, folder: MailFolder, uids: number[], seen: boolean) {
  return api<void>(`${base(address)}/messages/flags`, { method: 'POST', body: JSON.stringify({ folder, uids, seen }) })
}

export function moveToTrash(address: string, folder: MailFolder, uids: number[]) {
  return api<void>(`${base(address)}/messages/trash`, { method: 'POST', body: JSON.stringify({ folder, uids }) })
}

export function restoreFromTrash(address: string, uids: number[]) {
  return api<void>(`${base(address)}/messages/restore`, { method: 'POST', body: JSON.stringify({ folder: 'trash', uids }) })
}

export function purgeMessages(address: string, uids: number[]) {
  return api<{ purged: number }>(`${base(address)}/messages/purge`, {
    method: 'POST',
    body: JSON.stringify({ folder: 'trash', uids }),
  })
}

export function emptyTrash(address: string) {
  return api<{ purged: number }>(`${base(address)}/trash/empty`, { method: 'POST' })
}

export function sendMail(address: string, input: SendMailInput) {
  const form = new FormData()
  form.append('mode', input.mode)
  form.append('to', input.to.join(', '))
  form.append('cc', input.cc.join(', '))
  form.append('subject', input.subject)
  form.append('body', input.body)
  if (input.orig_folder && input.orig_uid !== undefined) {
    form.append('orig_folder', input.orig_folder)
    form.append('orig_uid', String(input.orig_uid))
    form.append('include_original_attachments', input.include_original_attachments ? 'true' : 'false')
  }
  for (const f of input.files) form.append('files', f, f.name)
  return apiUpload<SendMailResult>(`${base(address)}/send`, form)
}
