import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

// ── 공지사항 ─────────────────────────────────────────────────────

export interface NoticeRow {
  id: number
  title_vi: string
  title_ko: string | null
  title_en: string | null
  is_pinned: boolean
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface NoticeDetail extends NoticeRow {
  body_vi: string
  body_ko: string | null
  body_en: string | null
}

export interface NoticeUpsertBody {
  title_vi: string
  title_ko?: string | null
  title_en?: string | null
  body_vi: string
  body_ko?: string | null
  body_en?: string | null
  is_pinned?: boolean
}

export interface NoticeListParams {
  is_published?: boolean
  page?: number
  size?: number
}

export function useNotices(params: NoticeListParams) {
  return useQuery({
    queryKey: ['cms-notices', params],
    queryFn: () =>
      api<Page<NoticeRow>>(
        `/admin/api/cms/notices${buildQuery({
          page: params.page,
          size: params.size,
          is_published: params.is_published === undefined ? undefined : String(params.is_published),
        })}`
      ),
    placeholderData: keepPreviousData,
  })
}

export function useNotice(id: string) {
  return useQuery({
    queryKey: ['cms-notices', id],
    queryFn: () => api<NoticeDetail>(`/admin/api/cms/notices/${id}`),
    enabled: !!id,
  })
}

export function useCreateNotice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: NoticeUpsertBody) =>
      api<NoticeDetail>('/admin/api/cms/notices', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-notices'] }),
  })
}

export function useUpdateNotice(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<NoticeUpsertBody> & { is_published?: boolean }) =>
      api<NoticeDetail>(`/admin/api/cms/notices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-notices'] }),
  })
}

export function useDeleteNotice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/api/cms/notices/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-notices'] }),
  })
}

// ── FAQ ─────────────────────────────────────────────────────────

export const FAQ_CATEGORIES = ['GENERAL', 'ACCOUNT', 'MARKET', 'RIDE', 'REWARD'] as const
export type FaqCategory = (typeof FAQ_CATEGORIES)[number]

export interface FaqRow {
  id: number
  category: FaqCategory
  question_vi: string
  question_ko: string | null
  question_en: string | null
  answer_vi: string
  answer_ko: string | null
  answer_en: string | null
  sort_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface FaqUpsertBody {
  category: FaqCategory
  question_vi: string
  question_ko?: string | null
  question_en?: string | null
  answer_vi: string
  answer_ko?: string | null
  answer_en?: string | null
  sort_order?: number
  is_published?: boolean
}

export function useFaqs(category?: string) {
  return useQuery({
    queryKey: ['cms-faqs', category],
    queryFn: () => api<FaqRow[]>(`/admin/api/cms/faqs${buildQuery({ category })}`),
    placeholderData: keepPreviousData,
  })
}

export function useCreateFaq() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FaqUpsertBody) => api<FaqRow>('/admin/api/cms/faqs', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-faqs'] }),
  })
}

export function useUpdateFaq() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<FaqUpsertBody> }) =>
      api<FaqRow>(`/admin/api/cms/faqs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-faqs'] }),
  })
}

export function useDeleteFaq() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/admin/api/cms/faqs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-faqs'] }),
  })
}

// ── 금칙어 ───────────────────────────────────────────────────────

export interface BannedKeywordRow {
  id: number
  keyword: string
  note: string | null
  created_at: string
}

export function useBannedKeywords() {
  return useQuery({
    queryKey: ['cms-banned-keywords'],
    queryFn: () => api<BannedKeywordRow[]>('/admin/api/cms/banned-keywords'),
  })
}

export function useAddBannedKeyword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { keyword: string; note?: string }) =>
      api<BannedKeywordRow>('/admin/api/cms/banned-keywords', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-banned-keywords'] }),
  })
}

export function useDeleteBannedKeyword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/admin/api/cms/banned-keywords/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-banned-keywords'] }),
  })
}
