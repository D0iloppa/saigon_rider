import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface FuelMeta {
  brands: string[]
  fuel_types: string[]
}

export interface FuelPriceRow {
  brand: string
  fuel_type: string
  price_vnd: number
  effective_date: string
  source: string
}

export interface FuelPriceUpsertBody {
  brand: string
  fuel_type: string
  price_vnd: number
  effective_date?: string
}

export interface FuelFetchLogRow {
  source: string
  scheduled_at: string
  finished_at: string | null
  status: string | null
  items_found: number
  items_inserted: number
  error_message: string | null
}

export interface FuelPipelineHealth {
  stale_days: number | null
  latest_effective_date: string | null
  last_success_at: string | null
  consecutive_failures: number
  logs: FuelFetchLogRow[]
}

export function useFuelMeta() {
  return useQuery({
    queryKey: ['fuel-meta'],
    queryFn: () => api<FuelMeta>('/admin/api/fuel/meta'),
  })
}

export function useFuelPrices() {
  return useQuery({
    queryKey: ['fuel-prices'],
    queryFn: () => api<FuelPriceRow[]>('/admin/api/fuel/prices'),
  })
}

export function useUpsertFuelPrice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: FuelPriceUpsertBody) => api<FuelPriceRow>('/admin/api/fuel/prices', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fuel-prices'] })
      qc.invalidateQueries({ queryKey: ['fuel-pipeline-health'] })
    },
  })
}

export function useFuelPipelineHealth() {
  return useQuery({
    queryKey: ['fuel-pipeline-health'],
    queryFn: () => api<FuelPipelineHealth>('/admin/api/fuel/pipeline-health'),
  })
}
