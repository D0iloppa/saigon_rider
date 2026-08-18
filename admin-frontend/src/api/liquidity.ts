import { useQuery } from '@tanstack/react-query'
import { api, buildQuery } from './client'

export interface LiquidityTargets {
  l1_inquiry_rate_target: number
  l2_deal_rate_target: number
  l3_zero_result_rate_target: number
  l4_median_hours_target: number
}

export interface ListingLiquidityRow {
  week_start: string
  ward_id: number | null
  sample_listings: number
  l1_inquiry_rate: number | null
  l2_deal_rate: number | null
  l4_median_hours_to_inquiry: number | null
  l5_new_active_sellers: number
}

export interface SearchLiquidityRow {
  week_start: string
  total_searches: number
  l3_zero_result_rate: number | null
}

export interface LiquidityPanel {
  demo_excluded: boolean
  targets: LiquidityTargets
  listings: ListingLiquidityRow[]
  search: SearchLiquidityRow[]
}

export interface LiquidityPanelParams {
  weeks?: number
  ward_id?: number
  include_demo?: boolean
}

export function useLiquidityPanel(params: LiquidityPanelParams) {
  return useQuery({
    queryKey: ['liquidity', 'panel', params],
    queryFn: () =>
      api<LiquidityPanel>(
        `/admin/api/liquidity/panel${buildQuery({
          weeks: params.weeks,
          ward_id: params.ward_id,
          include_demo: params.include_demo === undefined ? undefined : String(params.include_demo),
        })}`,
      ),
  })
}
