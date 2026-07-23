import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface Item {
  item_code: string
  display_name: string
  slot: string
  rarity: string
  collection_code: string | null
  asset_uri: string | null
  shop_price_gp: number | null
  shop_price_gc: number | null
  is_shop_visible: boolean
  season_lock: boolean
  required_season_code: string | null
  effect_type: string | null
}

export interface ItemWriteBody {
  display_name: string
  slot: string
  rarity: string
  collection_code: string | null
  asset_uri: string | null
  shop_price_gp: number | null
  shop_price_gc: number | null
  is_shop_visible: boolean
  season_lock: boolean
  required_season_code: string | null
  effect_type: string | null
}

export interface ItemCreateBody extends ItemWriteBody {
  item_code: string
}

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: () => api<Item[]>('/admin/api/items'),
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ItemCreateBody) => api<Item>('/admin/api/items', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}

export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ item_code, body }: { item_code: string; body: ItemWriteBody }) =>
      api<Item>(`/admin/api/items/${item_code}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (item_code: string) => api<void>(`/admin/api/items/${item_code}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}
