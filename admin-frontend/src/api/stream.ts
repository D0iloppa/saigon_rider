import { useQuery } from '@tanstack/react-query'
import { api, buildQuery } from './client'

export interface StreamGroup {
  name: string
  pending: number
  consumers: number
  [key: string]: unknown
}

export interface StreamInfo {
  length: number
  groups: StreamGroup[]
  exists: boolean
}

export interface StreamMessage {
  id: string
  type: string
  uuid: string
  message: string
  ts: string
  phone: string | null
}

export interface StreamMessagesParams {
  count?: number
  type?: string
  uuid?: string
}

export interface GpsTracePoint {
  lat: number
  lng: number
  d: number
  ts: number
}

export interface GpsTraceResult {
  uuid: string
  platform: string
  start: string
  end: string
  point_count: number
  total_distance: number
  points: GpsTracePoint[]
}

export interface GpsTraceParams {
  uuid: string
  start: string
  end: string
  platform: string
}

export function useStreamInfo() {
  return useQuery({
    queryKey: ['stream', 'info'],
    queryFn: () => api<StreamInfo>('/admin/api/stream/info'),
    refetchInterval: 10000,
  })
}

export function useStreamMessages(params: StreamMessagesParams) {
  return useQuery({
    queryKey: ['stream', 'messages', params],
    queryFn: () => api<StreamMessage[]>(`/admin/api/stream/messages${buildQuery({ ...params })}`),
  })
}

export function useGpsTrace(params: GpsTraceParams | null) {
  return useQuery({
    queryKey: ['stream', 'gps-trace', params],
    queryFn: () => api<GpsTraceResult>(`/admin/api/stream/gps-trace${buildQuery({ ...params! })}`),
    enabled: params !== null,
  })
}
