import { api } from './client';
import { loadSession } from '@/lib/session';

/**
 * 실시간 위치공유 채널 API (설계 SoT: ai-docs/task/active/260829_live_location_channel_task.md).
 * prefix `/dm/conversations/{cid}/location-channel`. 응답은 서버가 camelCase 로 준다(변환 없음).
 * 모든 호출은 `rethrow: true` — 404(활성 채널 없음)/403(미참가)/410(종료) 을 호출부가 상태로 판정하므로
 * 전역 원문 토스트를 막는다.
 */
export interface LocationChannelDest {
  lat: number;
  lng: number;
  name: string | null;
}

export interface LocationChannelMember {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  heading: number | null;
  speedMps: number | null;
  locatedAt: string | null;
  arrivedAt: string | null;
  etaS: number | null;
  distanceM: number | null;
  /** 서버 ETA 계산 시각(Phase 2). 없으면 아직 첫 계산 전. */
  etaComputedAt?: string | null;
  leftAt: string | null;
}

/** 목적지 변경 제안(§3-3). 채널당 pending 최대 1개. */
export interface LocationChannelProposal {
  id: string;
  proposedBy: string;
  proposedByNickname: string;
  lat: number;
  lng: number;
  name: string | null;
  createdAt: string;
  expiresAt: string;
  votes: { userId: string; accept: boolean; votedAt: string }[];
  requiredAcceptCount: number;
}

export type LocationChannelProposalStatus = 'accepted' | 'rejected' | 'expired' | 'withdrawn';

export interface LocationChannelState {
  id: string;
  conversationId: string;
  appointmentId: string | null;
  dest: LocationChannelDest | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  endedAt: string | null;
  endReason: string | null;
  members: LocationChannelMember[];
  me: { userId: string; joined: boolean };
  /** 진행 중 목적지 변경 제안(Phase 2). 서버 미구현/없음 → undefined|null. */
  pendingProposal?: LocationChannelProposal | null;
}

export type LocationChannelEventType =
  | 'snapshot'
  | 'member_joined'
  | 'member_left'
  | 'location'
  | 'eta'
  | 'arrived'
  | 'dest_set'
  | 'dest_proposed'
  | 'dest_vote'
  | 'dest_resolved'
  | 'channel_ended';

export interface LocationChannelEnvelope {
  type: LocationChannelEventType;
  channelId: string;
  at: string;
  actorId?: string;
  payload: any;
}

export interface LocationEventPayload {
  userId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  heading: number | null;
  speedMps: number | null;
  locatedAt: string;
}

const base = (cid: string) => `/dm/conversations/${cid}/location-channel`;
const RETHROW = { rethrow: true } as const;

/** realFetch 오류에서 HTTP 상태코드 추출 — `status` 속성(4xx 일반) 또는 "HTTP {n} | ..." 메시지(401/403). */
export function httpStatusOf(err: unknown): number | null {
  const s = (err as { status?: number } | null)?.status;
  if (typeof s === 'number') return s;
  const m = /^HTTP (\d+)/.exec((err as Error)?.message ?? '');
  return m ? Number(m[1]) : null;
}

export async function createOrJoinLocationChannel(
  conversationId: string,
  body: { consentVersion: string; dest?: { lat: number; lng: number; name?: string }; appointmentId?: string },
): Promise<LocationChannelState> {
  return api.realFetch<LocationChannelState>(
    base(conversationId),
    {
      method: 'POST',
      body: JSON.stringify({
        consent_version: body.consentVersion,
        ...(body.dest ? { dest: body.dest } : {}),
        ...(body.appointmentId ? { appointment_id: body.appointmentId } : {}),
      }),
    },
    'bff',
    RETHROW,
  );
}

export async function fetchLocationChannel(conversationId: string): Promise<LocationChannelState> {
  return api.realFetch<LocationChannelState>(base(conversationId), {}, 'bff', RETHROW);
}

export async function leaveLocationChannel(conversationId: string): Promise<void> {
  await api.realFetch(`${base(conversationId)}/members/me`, { method: 'DELETE' }, 'bff', RETHROW);
}

export async function putLocationChannelLocation(
  conversationId: string,
  body: { lat: number; lng: number; accuracy_m: number; heading?: number; speed_mps?: number },
): Promise<LocationChannelState> {
  return api.realFetch<LocationChannelState>(
    `${base(conversationId)}/members/me/location`,
    { method: 'PUT', body: JSON.stringify(body) },
    'bff',
    RETHROW,
  );
}

export async function putLocationChannelDestination(
  conversationId: string,
  body: { lat: number; lng: number; name?: string },
): Promise<LocationChannelState> {
  return api.realFetch<LocationChannelState>(
    `${base(conversationId)}/destination`,
    { method: 'PUT', body: JSON.stringify(body) },
    'bff',
    RETHROW,
  );
}

/** 목적지 변경 제안(§3-3). 409 `{code:'pending_exists'}`. 활성 멤버 1명이면 서버가 즉시 반영(`dest_set`). */
export async function proposeLocationChannelDestination(
  conversationId: string,
  body: { lat: number; lng: number; name?: string },
): Promise<LocationChannelState> {
  return api.realFetch<LocationChannelState>(
    `${base(conversationId)}/destination/proposals`,
    { method: 'POST', body: JSON.stringify(body) },
    'bff',
    RETHROW,
  );
}

/** 제안 투표. 400 `{code:'proposer_cannot_vote'}`. */
export async function voteLocationChannelProposal(
  conversationId: string,
  proposalId: string,
  accept: boolean,
): Promise<LocationChannelState> {
  return api.realFetch<LocationChannelState>(
    `${base(conversationId)}/destination/proposals/${proposalId}/vote`,
    { method: 'POST', body: JSON.stringify({ accept }) },
    'bff',
    RETHROW,
  );
}

/** 제안 철회(제안자만) → 204. */
export async function withdrawLocationChannelProposal(conversationId: string, proposalId: string): Promise<void> {
  await api.realFetch(`${base(conversationId)}/destination/proposals/${proposalId}`, { method: 'DELETE' }, 'bff', RETHROW);
}

/** SSE 이벤트 스트림 URL — realFetch 와 같은 base(`/api/bff`). */
export function locationChannelEventsUrl(conversationId: string): string {
  return `/api/bff${base(conversationId)}/events`;
}

/** SSE 요청에 붙일 세션 헤더 — client.ts 의 realFetch 가 붙이는 것과 동일 키. */
export function locationChannelSseHeaders(): Record<string, string> {
  const session = loadSession();
  return session?.userId && session.sessionToken
    ? { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken }
    : {};
}
