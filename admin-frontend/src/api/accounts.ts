import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export type AdminRole = 'admin' | 'manager'

export interface AdminAccountRow {
  id: string
  username: string
  role: AdminRole
  note: string | null
  created_at: string
  updated_at: string
}

export interface AdminAccountCreateBody {
  username: string
  password: string
  role: AdminRole
  note?: string
}

export interface AdminAccountUpdateBody {
  role?: AdminRole
  note?: string
  password?: string
}

export function useAdminAccounts() {
  return useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => api<AdminAccountRow[]>('/admin/api/accounts'),
  })
}

export function useCreateAdminAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminAccountCreateBody) =>
      api<AdminAccountRow>('/admin/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-accounts'] }),
  })
}

export function useUpdateAdminAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminAccountUpdateBody }) =>
      api<AdminAccountRow>(`/admin/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-accounts'] }),
  })
}

export function useDeleteAdminAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/api/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-accounts'] }),
  })
}
