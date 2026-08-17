import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

// ── 관리자 본인 프로필 ────────────────────────────────────────────

export interface Profile {
  nickname: string | null
  avatar_content_id: string | null
  avatar_url: string
}

export function useProfile() {
  return useQuery({
    queryKey: ['settings-profile'],
    queryFn: () => api<Profile>('/admin/api/settings/profile'),
  })
}

export function useUpdateProfileNickname() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nickname: string) =>
      api<Profile>('/admin/api/settings/profile/nickname', { method: 'PUT', body: JSON.stringify({ nickname }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-profile'] }),
  })
}

export function useUpdateProfileAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content_id: string | null) =>
      api<Profile>('/admin/api/settings/profile/avatar', { method: 'PUT', body: JSON.stringify({ content_id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-profile'] }),
  })
}

// ── 닉네임 단어사전 ──────────────────────────────────────────────

export type NicknameWordType = 'adjective' | 'noun'

export interface NicknameWord {
  id: number
  word: string
  word_type: NicknameWordType
  created_at: string
}

export function useNicknameWords() {
  return useQuery({
    queryKey: ['settings-nickname-words'],
    queryFn: () => api<NicknameWord[]>('/admin/api/settings/nickname-words'),
  })
}

export function useCreateNicknameWord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { word: string; word_type: NicknameWordType }) =>
      api<NicknameWord>('/admin/api/settings/nickname-words', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-nickname-words'] }),
  })
}

export function useDeleteNicknameWord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/admin/api/settings/nickname-words/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-nickname-words'] }),
  })
}

// ── 앱 버전 관리 (root/admin 전용) ─────────────────────────────────

export interface AppVersion {
  id: number
  version: string
  is_active: boolean
  is_force_update: boolean
  release_note: string | null
  released_at: string | null
  ios_build: string | null
  android_build: string | null
}

export interface AppVersionCreateBody {
  version: string
  ios_build?: string
  android_build?: string
  release_note?: string
  is_force_update?: boolean
  is_active?: boolean
}

export function useAppVersions() {
  return useQuery({
    queryKey: ['settings-versions'],
    queryFn: () => api<AppVersion[]>('/admin/api/settings/versions'),
  })
}

export function useCreateAppVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AppVersionCreateBody) =>
      api<AppVersion>('/admin/api/settings/versions', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-versions'] }),
  })
}

export function useDeleteAppVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/admin/api/settings/versions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-versions'] }),
  })
}

// ── 서비스 설정 (root/admin 전용) ──────────────────────────────────

export interface ServiceConfig {
  dm_poll_interval: string
  keyword_alert_max_count: string
}

export function useServiceConfig() {
  return useQuery({
    queryKey: ['settings-service-config'],
    queryFn: () => api<ServiceConfig>('/admin/api/settings/service-config'),
  })
}

export function useUpdateServiceConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ServiceConfig) =>
      api<ServiceConfig>('/admin/api/settings/service-config', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-service-config'] }),
  })
}
