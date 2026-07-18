import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, buildQuery, type Page } from './client'

export interface SellerBrief {
  id: string
  nickname: string | null
}

export interface AdminListingRow {
  id: string
  title: string
  price_vnd: number
  status: 'ON_SALE' | 'RESERVED' | 'SOLD' | 'HIDDEN' | 'REMOVED'
  seller: SellerBrief
  report_count: number
  created_at: string
  thumbnail_url: string | null
}

export interface ListingReportRow {
  id: string
  reporter: SellerBrief
  reason: string
  note: string | null
  status: string
  created_at: string
}

export interface ListingDetail {
  id: string
  title: string
  description: string | null
  price_vnd: number
  status: string
  seller: SellerBrief
  moderated_at: string | null
  created_at: string
  image_urls: string[]
  reports: ListingReportRow[]
}

export interface ListingListParams {
  q?: string
  status?: string
  seller_id?: string
  page?: number
  size?: number
}

export function useListings(params: ListingListParams) {
  return useQuery({
    queryKey: ['listings', params],
    queryFn: () => api<Page<AdminListingRow>>(`/admin/api/listings${buildQuery({ ...params })}`),
    placeholderData: keepPreviousData,
  })
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listings', id],
    queryFn: () => api<ListingDetail>(`/admin/api/listings/${id}`),
    enabled: !!id,
  })
}

export interface ModerateBody {
  action: 'HIDE' | 'REMOVE' | 'RESTORE'
  reason: string
  report_id?: string
}

export function useModerateListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ listingId, body }: { listingId: string; body: ModerateBody }) =>
      api<{ id: string; status: string; moderated_at: string | null }>(`/admin/api/listings/${listingId}/moderate`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
