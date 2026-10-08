import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, buildQuery } from './client'

// ── FactMind 공개 디렉터리 (/admin/api/fm) ─────────────────────────

export type FmLocale = 'vi' | 'ko' | 'en'
export type FmSubjectStatus = 'draft' | 'published' | 'withdrawn'
export type FmLocalized = Record<FmLocale, string>

export interface FmSubjectRow {
  id: string
  kind: 'platform' | 'business'
  name: string
  slug: string | null
  status: FmSubjectStatus
  ward_id: number | null
  ward_name: string | null
  category_code: string | null
  locale_source: FmLocale
  published_at: string | null
  verified_at: string | null
  verification_ok: boolean | null
  updated_at: string
}

export interface FmProblem {
  url?: string
  reason?: string
  reason_code?: string
}

export interface FmVerification {
  ok: boolean
  problems: FmProblem[]
  checked: string[]
  at: string
}

export interface FmEvent {
  id: string
  subject_id?: string | null
  kind: string
  body: unknown
  created_at: string
}

export interface FmSubjectDetail extends FmSubjectRow {
  publication: {
    id: string
    artifact_digest: string
    files: string[]
    published_at: string
    verified_at: string | null
    verification: FmVerification | null
  } | null
  events: FmEvent[]
}

export interface FmSubjectParams {
  kind?: string
  status?: string
  q?: string
  limit?: number
  offset?: number
}

export interface FmPlatformFacts {
  name: FmLocalized
  description: FmLocalized
  same_as: string[]
  service_area: FmLocalized
  faq: Array<{ q: FmLocalized; a: FmLocalized }>
}

export interface FmDiagnoseItem {
  code: string
  state: 'ok' | 'problem' | 'skipped'
  title: string
  problem?: string
  fix?: string
  evidence?: unknown
}

export interface FmDiagnoseResult {
  url: string
  complete_reads: boolean
  items: FmDiagnoseItem[]
  reads: Array<{ url: string; http_status: number | null }>
}

/** 백엔드 오류는 `detail: { code, ... }` 객체라 공용 api()가 코드를 잃는다 — 코드를 메시지로 보존하는 전용 fetch. */
async function fmApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/admin/api/fm${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  if (res.status === 401) {
    if (!window.location.pathname.startsWith('/admin/login')) window.location.href = '/admin/login'
    throw new ApiError(401, '로그인이 필요합니다.')
  }
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`
    try {
      const body = await res.json()
      const detail = body?.detail
      if (typeof detail === 'string') msg = detail
      else if (typeof detail?.code === 'string') msg = detail.code
    } catch {
      // JSON 아님 — 기본 메시지 유지
    }
    throw new ApiError(res.status, msg)
  }
  return (await res.json()) as T
}

const post = <T,>(path: string, body?: unknown) =>
  fmApi<T>(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })

export function useFmSubjects(params: FmSubjectParams) {
  return useQuery({
    queryKey: ['fm', 'subjects', params],
    queryFn: () =>
      fmApi<{ items: FmSubjectRow[]; total: number }>(
        `/subjects${buildQuery({ ...params, limit: params.limit ?? 50, offset: params.offset ?? 0 })}`,
      ),
  })
}

export function useFmSubject(id: string | null) {
  return useQuery({
    queryKey: ['fm', 'subject', id],
    queryFn: () => fmApi<FmSubjectDetail>(`/subjects/${id}`),
    enabled: !!id,
  })
}

function useInvalidateFm() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['fm'] })
}

export function useFmSync() {
  const invalidate = useInvalidateFm()
  return useMutation({
    mutationFn: () =>
      post<{ created: number; updated: number; published: number; platform: 'created' | 'republished' | 'unchanged' }>(
        '/subjects/sync',
      ),
    onSuccess: invalidate,
  })
}

export function useFmPublish() {
  const invalidate = useInvalidateFm()
  return useMutation({
    mutationFn: (id: string) =>
      post<{ publication_id: string; slug: string; url: string; artifact_digest: string; published_at: string }>(
        `/subjects/${id}/publish`,
      ),
    onSuccess: invalidate,
  })
}

export function useFmVerify() {
  const invalidate = useInvalidateFm()
  return useMutation({
    mutationFn: (id: string) =>
      post<{ ok: boolean; verified_at: string; problems: FmProblem[]; checked: string[] }>(`/subjects/${id}/verify`),
    onSuccess: invalidate,
  })
}

export function useFmWithdraw() {
  const invalidate = useInvalidateFm()
  return useMutation({
    mutationFn: (id: string) => post<{ status: 'withdrawn'; withdrawn_at: string }>(`/subjects/${id}/withdraw`),
    onSuccess: invalidate,
  })
}

export function useFmPlatformFacts() {
  return useQuery({
    queryKey: ['fm', 'platform-facts'],
    queryFn: () =>
      fmApi<{ subject_id: string; version: number; status: FmSubjectStatus; facts: FmPlatformFacts }>('/platform-facts'),
  })
}

export function useFmSavePlatformFacts() {
  const invalidate = useInvalidateFm()
  return useMutation({
    mutationFn: (facts: FmPlatformFacts) =>
      fmApi<{ version: number }>('/platform-facts', { method: 'PUT', body: JSON.stringify({ facts }) }),
    onSuccess: invalidate,
  })
}

export function useFmEvents(kind?: string) {
  return useQuery({
    queryKey: ['fm', 'events', kind],
    queryFn: () => fmApi<{ items: FmEvent[] }>(`/events${buildQuery({ kind, limit: 50 })}`),
  })
}

export function useFmDiagnose() {
  return useMutation({
    mutationFn: (input: { url: string; name?: string; locale: 'ko-KR' | 'vi' | 'en' }) =>
      post<FmDiagnoseResult>('/diagnose', input),
  })
}
