"""실시간 위치공유 채널 Live Activity 상태 계산 — 순수 함수.

SoT: ai-docs/task/active/260829_live_location_channel_task.md §8 Phase 3-A. `noti_worker`
의 `live_activity.location_update` 핸들러가 이 함수로 활성 참가자 각자의 관점 state 를 계산해
그 사람의 kind='location' 토큰으로 push 한다.

state 계약(camelCase, 프론트/네이티브와 동일 — 임의로 필드를 더하거나 빼지 않는다):
    {myEtaS, myDistanceM, peerEtaS, peerDistanceM, peerToMeDistanceM, myArrived, peerArrived,
     participantCount, statusKind, updatedAtMs}

peer 선택: 1:1(활성 참가자 2명)은 상대. 그룹(3명+)은 좌표가 있는 참가자 중 나와 가장 가까운
사람. 아무도 좌표가 없으면 좌표 없는 첫 참가자를 peer 로 잡되(누군가는 표시해야 하므로) 거리
관련 필드는 계산하지 않는다(None).

statusKind: 채널 종료 → 'ended'. 나·상대 모두 도착 → 'arrived'. 나만 도착 → 'waiting'.
그 외(둘 다 이동 중이거나 peer 가 없음) → 'moving'.
DB 세션이 필요 없다 — 이미 로드된 멤버/채널 객체만 받는다(단위테스트가 실 DB 없이 검증 가능).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol


class _MemberLike(Protocol):
    user_id: Any
    lat: float | None
    lng: float | None
    eta_s: int | None
    distance_m: int | None
    arrived_at: datetime | None
    left_at: datetime | None


class _ChannelLike(Protocol):
    ended_at: datetime | None


def _pick_peer(me: _MemberLike, others: list[_MemberLike]) -> _MemberLike | None:
    if not others:
        return None
    with_coords = [m for m in others if m.lat is not None and m.lng is not None]
    if not with_coords or me.lat is None or me.lng is None:
        return with_coords[0] if with_coords else others[0]

    from ..utils import haversine_m

    return min(
        with_coords,
        key=lambda m: haversine_m(float(me.lat), float(me.lng), float(m.lat), float(m.lng)),
    )


def build_state(me: _MemberLike, members: list[_MemberLike], channel: _ChannelLike, now: datetime) -> dict[str, Any]:
    active_members = [m for m in members if m.left_at is None]
    others = [m for m in active_members if m.user_id != me.user_id]
    peer = _pick_peer(me, others)

    peer_to_me_distance_m = None
    if peer is not None and me.lat is not None and me.lng is not None and peer.lat is not None and peer.lng is not None:
        from ..utils import haversine_m

        peer_to_me_distance_m = round(haversine_m(float(me.lat), float(me.lng), float(peer.lat), float(peer.lng)))

    my_arrived = me.arrived_at is not None
    peer_arrived = peer is not None and peer.arrived_at is not None

    if channel.ended_at is not None:
        status_kind = "ended"
    elif my_arrived and peer_arrived:
        status_kind = "arrived"
    elif my_arrived and not peer_arrived:
        status_kind = "waiting"
    else:
        status_kind = "moving"

    return {
        "myEtaS": me.eta_s,
        "myDistanceM": me.distance_m,
        "peerEtaS": peer.eta_s if peer is not None else None,
        "peerDistanceM": peer.distance_m if peer is not None else None,
        "peerToMeDistanceM": peer_to_me_distance_m,
        "myArrived": my_arrived,
        "peerArrived": peer_arrived,
        "participantCount": len(active_members),
        "statusKind": status_kind,
        "updatedAtMs": int(now.timestamp() * 1000),
    }
