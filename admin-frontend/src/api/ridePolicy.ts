import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface RideBand {
  code: string
  threshold_m: number
}

export interface RidePolicy {
  proximity_m: number
  daily_quest_base_slots: number
  bands: RideBand[]
}

export function useRidePolicy() {
  return useQuery({
    queryKey: ['ride-policy'],
    queryFn: () => api<RidePolicy>('/admin/api/ride-policy'),
  })
}

export function useSaveRidePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RidePolicy) =>
      api<RidePolicy>('/admin/api/ride-policy', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.setQueryData(['ride-policy'], data)
    },
  })
}
