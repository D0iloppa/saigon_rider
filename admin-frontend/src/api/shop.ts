import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface ShopItem {
  item_code: string
  display_name: string
  rarity: string
  collection_code: string | null
  slot: string
  shop_price_gp: number | null
  shop_price_gc: number | null
  is_shop_visible: boolean
  season_lock: boolean
  required_season_code: string | null
}

export interface ShopItemWriteBody {
  shop_price_gp: number | null
  shop_price_gc: number | null
  is_shop_visible: boolean
  season_lock: boolean
  required_season_code: string | null
}

export interface DailyFeaturedRow {
  featured_date: string
  item_code: string
  item_name: string
  discount_pct: number
  sort_order: number
}

export interface DailyFeaturedRefreshBody {
  date: string
  items: { item_code: string; discount_pct: number; sort_order: number }[]
}

export function useShopItems() {
  return useQuery({
    queryKey: ['shop-items'],
    queryFn: () => api<ShopItem[]>('/admin/api/shop'),
  })
}

export function useUpdateShopItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ item_code, body }: { item_code: string; body: ShopItemWriteBody }) =>
      api<ShopItem>(`/admin/api/shop/${item_code}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop-items'] }),
  })
}

export function useDailyFeaturedHistory() {
  return useQuery({
    queryKey: ['daily-featured-history'],
    queryFn: () => api<DailyFeaturedRow[]>('/admin/api/shop/daily-featured'),
  })
}

export function useRefreshDailyFeatured() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: DailyFeaturedRefreshBody) =>
      api<void>('/admin/api/shop/daily-featured/refresh', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-featured-history'] }),
  })
}
