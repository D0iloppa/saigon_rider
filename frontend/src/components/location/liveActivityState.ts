import type { LocationChannelMember, LocationChannelState } from '@/api/locationChannel';

/**
 * 실시간 위치공유 채널 → Live Activity(`kind:'location'`) state 변환 (순수 함수, side-effect 없음).
 * SoT: ai-docs/task/active/260829_live_location_channel_task.md §Phase 3 (A).
 *
 * `statusKind` 정의(고정):
 *   myArrived && peerArrived  → 'arrived'  (둘 다 도착)
 *   myArrived && !peerArrived → 'waiting'  (나만 도착, 상대를 기다림)
 *   그 외                      → 'moving'
 * ('ended' 는 이 함수가 만들지 않는다 — 채널 종료 시 호출부가 리터럴로 붙인다.)
 */

/** 지구 대원거리(m) — `haversineM` 단일 정의처(런타임 훅이 이 값을 재사용한다). */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type LocationChannelStatusKind = 'moving' | 'waiting' | 'arrived';

export interface LocationLiveActivityState {
  myEtaS: number | null;
  myDistanceM: number | null;
  peerEtaS: number | null;
  peerDistanceM: number | null;
  peerToMeDistanceM: number | null;
  myArrived: boolean;
  peerArrived: boolean;
  participantCount: number;
  statusKind: LocationChannelStatusKind;
  updatedAtMs: number;
}

/**
 * 상대 선택 — 1:1 은 유일한 후보라 자연히 "상대"가 뽑히고, 그룹은 나와 가장 가까운 활성
 * 참가자(좌표 있는 사람 중 haversine 최소)가 뽑힌다 — 별도 분기 없이 같은 규칙으로 처리된다.
 * 내 좌표를 아직 모르면(측위 전) 거리 랭킹이 불가능하므로 첫 활성 후보로 대체한다.
 */
export function selectLocationChannelPeer(
  members: LocationChannelMember[],
  meUserId: string,
  meCoords: { lat: number; lng: number } | null,
): LocationChannelMember | null {
  const candidates = members.filter(
    (m) => m.userId !== meUserId && !m.leftAt && m.lat != null && m.lng != null,
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1 || !meCoords) return candidates[0];
  let best = candidates[0];
  let bestD = haversineM(meCoords, { lat: best.lat as number, lng: best.lng as number });
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i];
    const d = haversineM(meCoords, { lat: c.lat as number, lng: c.lng as number });
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export function computeLocationLiveActivityState(
  state: LocationChannelState,
  meUserId: string,
): LocationLiveActivityState | null {
  const me = state.members.find((m) => m.userId === meUserId);
  if (!me) return null;
  const meCoords = me.lat != null && me.lng != null ? { lat: me.lat, lng: me.lng } : null;
  const peer = selectLocationChannelPeer(state.members, meUserId, meCoords);
  const peerCoords = peer && peer.lat != null && peer.lng != null ? { lat: peer.lat, lng: peer.lng } : null;
  const myArrived = !!me.arrivedAt;
  const peerArrived = !!peer?.arrivedAt;
  const statusKind: LocationChannelStatusKind =
    myArrived && peerArrived ? 'arrived' : myArrived && !peerArrived ? 'waiting' : 'moving';
  return {
    myEtaS: me.etaS,
    myDistanceM: me.distanceM,
    peerEtaS: peer?.etaS ?? null,
    peerDistanceM: peer?.distanceM ?? null,
    peerToMeDistanceM: meCoords && peerCoords ? haversineM(meCoords, peerCoords) : null,
    myArrived,
    peerArrived,
    participantCount: state.members.filter((m) => !m.leftAt).length,
    statusKind,
    updatedAtMs: Date.now(),
  };
}
