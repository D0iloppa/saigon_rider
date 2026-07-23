import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface GachaDefinition {
  gacha_code: string
  display_name: string
  description: string | null
  cost_currency: string
  cost_per_pull: number
  cost_per_10_pull: number
  pity_threshold: number | null
  drop_table: Record<string, unknown>
  status: string
  is_listed: boolean
  sort_order: number | null
}

export interface GachaWriteBody {
  display_name: string
  description: string | null
  cost_per_pull: number
  cost_per_10_pull: number
  drop_table: Record<string, unknown>
  pity_threshold: number | null
  status: string
  is_listed: boolean
  sort_order: number | null
}

export function useGachaDefinitions() {
  return useQuery({
    queryKey: ['gacha-definitions'],
    queryFn: () => api<GachaDefinition[]>('/admin/api/gacha'),
  })
}

export function useUpdateGachaDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ gacha_code, body }: { gacha_code: string; body: GachaWriteBody }) =>
      api<GachaDefinition>(`/admin/api/gacha/${gacha_code}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gacha-definitions'] }),
  })
}
