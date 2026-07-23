import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface PolicyCondition {
  metric: string
  op: string
  value: number
}

export interface PolicyAction {
  action_type: string
  value: number
  ref_id: string | null
  sort_order: number
}

export interface RewardPolicy {
  id: number
  policy_code: string
  name: string
  description: string | null
  priority: number
  is_repeatable: boolean
  repeat_interval: number | null
  repeat_metric: string | null
  repeat_metric_interval: number | null
  is_active: boolean
  conditions: PolicyCondition[]
  actions: PolicyAction[]
}

export interface RewardPolicyWriteBody {
  policy_code: string
  name: string
  description: string | null
  conditions: PolicyCondition[]
  is_repeatable: boolean
  repeat_interval: number | null
  repeat_metric: string | null
  repeat_metric_interval: number | null
  is_active: boolean
  priority: number
  actions: PolicyAction[]
}

export function useRewardPolicies() {
  return useQuery({
    queryKey: ['reward-policies'],
    queryFn: () => api<RewardPolicy[]>('/admin/api/reward-policies'),
  })
}

export function useCreateRewardPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RewardPolicyWriteBody) =>
      api<RewardPolicy>('/admin/api/reward-policies', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reward-policies'] }),
  })
}

export function useUpdateRewardPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: RewardPolicyWriteBody }) =>
      api<RewardPolicy>(`/admin/api/reward-policies/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reward-policies'] }),
  })
}

export function useDeleteRewardPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/admin/api/reward-policies/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reward-policies'] }),
  })
}
