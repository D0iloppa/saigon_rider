import { useQuery } from '@tanstack/react-query'
import { api, buildQuery } from './client'

export interface CohortRetentionRow {
  cohort_week: string
  population: number
  suppressed: boolean
  d1_retention: number | null
  d7_retention: number | null
  d30_retention: number | null
}

export interface RetentionCohortsParams {
  weeks?: number
}

export function useRetentionCohorts(params: RetentionCohortsParams) {
  return useQuery({
    queryKey: ['retention', 'cohorts', params],
    queryFn: () => api<CohortRetentionRow[]>(`/admin/api/retention/cohorts${buildQuery({ weeks: params.weeks })}`),
  })
}
