import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

// ── POI ──────────────────────────────────────────────────────────

export interface PoiCategory {
  code: string
  label_ko: string
  label_vi: string
  label_en: string
  icon: string
  sort_order: number
}

export interface PoiRow {
  id: string
  category: string
  name_ko: string
  name_vi: string | null
  name_en: string | null
  description: string | null
  address: string | null
  lat: number | string
  lng: number | string
  photo_content_id: string | null
  photo_url: string | null
  published: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PoiWriteBody {
  category: string
  name_ko: string
  name_vi?: string | null
  name_en?: string | null
  description?: string | null
  address?: string | null
  lat: number
  lng: number
  photo_content_id?: string | null
  published: boolean
  sort_order: number
}

export interface PoiListParams {
  category?: string
  q?: string
  page?: number
  size?: number
}

export function usePoiCategories() {
  return useQuery({
    queryKey: ['map', 'poi-categories'],
    queryFn: () => api<PoiCategory[]>('/admin/api/map/poi-categories'),
  })
}

export function usePoiList(params: PoiListParams) {
  return useQuery({
    queryKey: ['map', 'poi', params],
    queryFn: () => api<Page<PoiRow>>(`/admin/api/map/poi${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function usePoi(id: string) {
  return useQuery({
    queryKey: ['map', 'poi', id],
    queryFn: () => api<PoiRow>(`/admin/api/map/poi/${id}`),
    enabled: !!id,
  })
}

export function useCreatePoi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PoiWriteBody) => api<PoiRow>('/admin/api/map/poi', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'poi'] }),
  })
}

export function useUpdatePoi(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PoiWriteBody) => api<PoiRow>(`/admin/api/map/poi/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'poi'] }),
  })
}

export function useUnpublishPoi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<PoiRow>(`/admin/api/map/poi/${id}/unpublish`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'poi'] }),
  })
}

// ── 장소 제보 ─────────────────────────────────────────────────────

export interface PlaceSuggestionRow {
  id: number
  name: string
  category: string | null
  address: string | null
  lat: number | string
  lng: number | string
  note: string | null
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  review_note: string | null
  created_at: string
  reviewed_at: string | null
}

export function usePlaceSuggestions(status?: string) {
  return useQuery({
    queryKey: ['map', 'place-suggestions', status],
    queryFn: () => api<PlaceSuggestionRow[]>(`/admin/api/map/place-suggestions${buildQuery({ status })}`),
  })
}

export function useConfirmPlaceSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<PlaceSuggestionRow>(`/admin/api/map/place-suggestions/${id}/confirm`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'place-suggestions'] }),
  })
}

export function useRejectPlaceSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, review_note }: { id: number; review_note: string }) =>
      api<PlaceSuggestionRow>(`/admin/api/map/place-suggestions/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ review_note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'place-suggestions'] }),
  })
}

// ── 주유소 제보 ───────────────────────────────────────────────────

export interface GasSubmissionRow {
  submission_id: number
  name: string
  lat: number | string
  lng: number | string
  phone: string | null
  brand: string | null
  brand_normalized: string | null
  district_code: string | null
  note: string | null
  reporter_user_id: string | null
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  review_note: string | null
  reviewed_at: string | null
  resulting_station_id: number | null
  created_at: string
}

export function useGasSubmissions(status?: string) {
  return useQuery({
    queryKey: ['map', 'gas-submissions', status],
    queryFn: () => api<GasSubmissionRow[]>(`/admin/api/map/gas-submissions${buildQuery({ status })}`),
  })
}

export function useConfirmGasSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (submissionId: number) =>
      api<GasSubmissionRow>(`/admin/api/map/gas-submissions/${submissionId}/confirm`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'gas-submissions'] }),
  })
}

export function useRejectGasSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ submissionId, review_note }: { submissionId: number; review_note?: string }) =>
      api<GasSubmissionRow>(`/admin/api/map/gas-submissions/${submissionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ review_note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'gas-submissions'] }),
  })
}

// ── 정비소 제보 ───────────────────────────────────────────────────

export interface RepairSubmissionRow {
  submission_id: number
  name: string
  lat: number | string
  lng: number | string
  phone: string | null
  district_code: string | null
  note: string | null
  reporter_user_id: string | null
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  review_note: string | null
  reviewed_at: string | null
  resulting_shop_id: number | null
  created_at: string
}

export function useRepairSubmissions(status?: string) {
  return useQuery({
    queryKey: ['map', 'repair-submissions', status],
    queryFn: () => api<RepairSubmissionRow[]>(`/admin/api/map/repair-submissions${buildQuery({ status })}`),
  })
}

export function useConfirmRepairSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (submissionId: number) =>
      api<RepairSubmissionRow>(`/admin/api/map/repair-submissions/${submissionId}/confirm`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'repair-submissions'] }),
  })
}

export function useRejectRepairSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ submissionId, review_note }: { submissionId: number; review_note?: string }) =>
      api<RepairSubmissionRow>(`/admin/api/map/repair-submissions/${submissionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ review_note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map', 'repair-submissions'] }),
  })
}
