/** DEV Context 어드민 API — __DEV_context KV + dev Features + dev Todos (Plane 프록시, DB 폴백). */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface DevContextRow {
  key: string
  value: string
  status: string
  updated_at: string
}

export interface DevFeature {
  id: number
  category: string
  name: string
  description: string | null
  status: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DevTodo {
  id: number
  title: string
  description: string | null
  priority: string
  status: string
  feature_id: number | null
  feature: DevFeature | null
  due_date: string | null
  created_at: string
  updated_at: string
}

// ── Context KV ──────────────────────────────────────────────────

export function useDevContextList() {
  return useQuery({
    queryKey: ['dev-context', 'context'],
    queryFn: () => api<DevContextRow[]>('/admin/api/dev-context/context'),
  })
}

export function useUpsertDevContext() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { key: string; value: string; status?: string }) =>
      api('/admin/api/dev-context/context', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'context'] }),
  })
}

export function useCycleDevContext() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => api(`/admin/api/dev-context/context/${encodeURIComponent(key)}/status-cycle`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'context'] }),
  })
}

export function useDeleteDevContext() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => api(`/admin/api/dev-context/context/${encodeURIComponent(key)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'context'] }),
  })
}

// ── Features ────────────────────────────────────────────────────

export function useDevFeatures() {
  return useQuery({
    queryKey: ['dev-context', 'features'],
    queryFn: () => api<{ items: DevFeature[]; total: number; categories: string[] }>('/admin/api/dev-context/features'),
  })
}

export function useCreateDevFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { category: string; name: string; status?: string }) =>
      api('/admin/api/dev-context/features', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'features'] }),
  })
}

export function useCycleDevFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api(`/admin/api/dev-context/features/${id}/cycle`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'features'] }),
  })
}

export function useDeleteDevFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api(`/admin/api/dev-context/features/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'features'] }),
  })
}

// ── Todos ───────────────────────────────────────────────────────

export function useDevTodos() {
  return useQuery({
    queryKey: ['dev-context', 'todos'],
    queryFn: () => api<{ items: DevTodo[]; total: number }>('/admin/api/dev-context/todos'),
  })
}

export function useCreateDevTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { title: string; priority?: string; feature_id?: number }) =>
      api('/admin/api/dev-context/todos', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'todos'] }),
  })
}

export function useCycleDevTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api(`/admin/api/dev-context/todos/${id}/cycle`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'todos'] }),
  })
}

export function useDeleteDevTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api(`/admin/api/dev-context/todos/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dev-context', 'todos'] }),
  })
}
