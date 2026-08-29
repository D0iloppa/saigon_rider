"""실시간 위치공유 채널(Live Location Channel) — Phase 1 코어.

SoT: ai-docs/task/active/260829_live_location_channel_task.md §3·§4·§7·§8 Phase 1.
워키토키(`d_modules/WalkieTalkie/.../api.py`)의 SSE+HTTP 하이브리드 패턴을 복제하되,
`location` 등 이벤트는 좌표 페이로드를 직접 싣는다(D3). 좌표는 이력 미보관 — 참가자별
최신 1건만 보관하고, 이탈·채널종료 시 즉시 NULL(§7-3).
"""

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import DmConversation, LocationChannel, LocationChannelMember, MarketplaceAppointment
from ..schemas import (
    LocationChannelCreateRequest,
    LocationChannelDestinationRequest,
    LocationChannelPingRequest,
)
from ..services.dm_policy import require_member, require_participant, require_unblocked
from ..services.location_channel_broadcast import location_channel_broadcaster
from ..services.location_channel_lifecycle import resolve_end_reason
from ..utils import haversine_m, resolve_avatar_url

router = APIRouter(prefix="/dm/conversations/{conversation_id}/location-channel", tags=["Location Channel"])

# 목적지 반경 진입 판정(§3-2) — 경로안내와 동일 상수.
ARRIVAL_RADIUS_M = 40
# 참가 중엔 항상 정밀좌표(§7-5) — 그 대신 정확도가 지나치게 낮은 좌표는 거부한다.
ACCURACY_MAX_M = 35
# 세션 TTL(§7-2).
CHANNEL_TTL = timedelta(hours=3)


async def _require_conversation_membership(db: AsyncSession, conv: DmConversation, session_uid: uuid.UUID) -> None:
    if conv.conversation_type == "direct":
        require_participant(conv, session_uid)
    else:
        await require_member(db, conv, session_uid)


async def _require_conversation_access(db: AsyncSession, conv: DmConversation, session_uid: uuid.UUID) -> None:
    """방 멤버십 + (1:1 한정) 차단 관계 검사(§7-6).

    차단이 감지되면 활성 채널이 있는 경우 그 채널을 `end_reason='blocked'` 로 즉시 종료
    (좌표 NULL + `channel_ended` 방송)한 뒤 403 을 던진다 — "차단 시 서로 좌표 필터링" 만으로는
    부족하고 1:1 채널 자체를 끝내야 한다(§7-6).
    """
    await _require_conversation_membership(db, conv, session_uid)
    if conv.conversation_type != "direct":
        return
    other = conv.participant_2 if conv.participant_1 == session_uid else conv.participant_1
    try:
        await require_unblocked(db, session_uid, other)
    except HTTPException:
        channel = await _active_channel_for_conversation(db, conv.id)
        if channel is not None:
            now = datetime.now(UTC)
            channel.ended_at = now
            channel.end_reason = "blocked"
            for m in channel.members:
                m.lat = None
                m.lng = None
                m.accuracy_m = None
                m.heading = None
                m.speed_mps = None
                m.located_at = None
            await db.commit()
            await _publish(channel.id, "channel_ended", actor_id=None, payload={"endReason": "blocked"})
        raise


async def _get_conversation(db: AsyncSession, conversation_id: uuid.UUID) -> DmConversation:
    conv = await db.get(DmConversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


async def _load_channel_full(db: AsyncSession, channel_id: uuid.UUID) -> LocationChannel:
    """멤버·유저 관계까지 확실히 채워 직렬화 가능한 상태로 재조회한다 (selectin 재트리거)."""
    result = await db.execute(select(LocationChannel).where(LocationChannel.id == channel_id))
    return result.scalar_one()


async def _active_channel_for_conversation(db: AsyncSession, conversation_id: uuid.UUID) -> LocationChannel | None:
    result = await db.execute(
        select(LocationChannel).where(
            LocationChannel.conversation_id == conversation_id,
            LocationChannel.ended_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


def _find_member(channel: LocationChannel, user_id: uuid.UUID) -> LocationChannelMember | None:
    return next((m for m in channel.members if m.user_id == user_id), None)


async def _member_and_channel_for_ping(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[LocationChannelMember | None, LocationChannel | None]:
    """활성/종료 여부와 무관하게 '지금 이 참가자가 속한 가장 최근 채널'을 찾는다.

    (ping 은 채널이 방금 종료됐어도 410 로 알려줘야 하므로, ended_at 필터 없이 조회한다.)
    """
    result = await db.execute(
        select(LocationChannelMember, LocationChannel)
        .join(LocationChannel, LocationChannelMember.channel_id == LocationChannel.id)
        .where(
            LocationChannel.conversation_id == conversation_id,
            LocationChannelMember.user_id == user_id,
            LocationChannelMember.left_at.is_(None),
        )
        .order_by(LocationChannel.created_at.desc())
        .limit(1)
    )
    row = result.first()
    if row is None:
        return None, None
    return row[0], row[1]


async def _is_active_member(db: AsyncSession, channel_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    """SSE keepalive tick 마다 재확인하는 멤버십(§P1) — left_at IS NULL & 채널 ended_at IS NULL."""
    result = await db.execute(
        select(LocationChannelMember.left_at, LocationChannel.ended_at)
        .join(LocationChannel, LocationChannelMember.channel_id == LocationChannel.id)
        .where(LocationChannelMember.channel_id == channel_id, LocationChannelMember.user_id == user_id)
    )
    row = result.first()
    if row is None:
        return False
    left_at, ended_at = row
    return left_at is None and ended_at is None


async def _publish(channel_id: uuid.UUID, event_type: str, *, actor_id: uuid.UUID | None, payload: dict) -> None:
    envelope: dict[str, Any] = {
        "type": event_type,
        "channelId": str(channel_id),
        "at": datetime.now(UTC).isoformat(),
        "payload": payload,
    }
    if actor_id is not None:
        envelope["actorId"] = str(actor_id)
    await location_channel_broadcaster.publish(str(channel_id), envelope)


def _member_out(m: LocationChannelMember) -> dict:
    user = m.user
    return {
        "userId": str(m.user_id),
        "nickname": getattr(user, "nickname", None),
        "avatarUrl": resolve_avatar_url(user) if user is not None else None,
        "lat": float(m.lat) if m.lat is not None else None,
        "lng": float(m.lng) if m.lng is not None else None,
        "accuracyM": m.accuracy_m,
        "heading": m.heading,
        "speedMps": m.speed_mps,
        "locatedAt": m.located_at.isoformat() if m.located_at else None,
        "arrivedAt": m.arrived_at.isoformat() if m.arrived_at else None,
        "etaS": None,
        "distanceM": None,
        "leftAt": m.left_at.isoformat() if m.left_at else None,
    }


def _serialize_channel(channel: LocationChannel, me_uid: uuid.UUID) -> dict:
    dest = None
    if channel.dest_lat is not None and channel.dest_lng is not None:
        dest = {"lat": float(channel.dest_lat), "lng": float(channel.dest_lng), "name": channel.dest_name}
    joined = any(m.user_id == me_uid and m.left_at is None for m in channel.members)
    return {
        "id": str(channel.id),
        "conversationId": str(channel.conversation_id),
        "appointmentId": str(channel.appointment_id) if channel.appointment_id else None,
        "dest": dest,
        "createdBy": str(channel.created_by),
        "createdAt": channel.created_at.isoformat(),
        "expiresAt": channel.expires_at.isoformat(),
        "endedAt": channel.ended_at.isoformat() if channel.ended_at else None,
        "endReason": channel.end_reason,
        "members": [_member_out(m) for m in channel.members],
        "me": {"userId": str(me_uid), "joined": joined},
    }


async def _maybe_end_channel(channel: LocationChannel, now: datetime) -> bool:
    """자동종료 3중 판정(§7-2). 종료되면 좌표를 즉시 NULL 처리하고 `channel_ended` 를 방송한다."""
    if channel.ended_at is not None:
        return False
    active_members = [m for m in channel.members if m.left_at is None]
    reason = resolve_end_reason(channel, active_members, now)
    if reason is None:
        return False
    channel.ended_at = now
    channel.end_reason = reason
    for m in channel.members:
        m.lat = None
        m.lng = None
        m.accuracy_m = None
        m.heading = None
        m.speed_mps = None
        m.located_at = None
    await _publish(channel.id, "channel_ended", actor_id=None, payload={"endReason": reason})
    return True


@router.post("")
async def create_or_join_channel(
    conversation_id: uuid.UUID,
    body: LocationChannelCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    conv = await _get_conversation(db, conversation_id)
    await _require_conversation_access(db, conv, session_uid)

    now = datetime.now(UTC)
    channel = await _active_channel_for_conversation(db, conversation_id)
    member: LocationChannelMember | None = None
    if channel is None:
        dest_lat: Decimal | None = None
        dest_lng: Decimal | None = None
        dest_name: str | None = None
        if body.appointment_id is not None:
            appt = await db.get(MarketplaceAppointment, body.appointment_id)
            if appt is not None:
                dest_lat, dest_lng, dest_name = appt.place_lat, appt.place_lng, appt.place_name
        if body.dest is not None:
            dest_lat = Decimal(str(body.dest.lat))
            dest_lng = Decimal(str(body.dest.lng))
            dest_name = body.dest.name
        channel = LocationChannel(
            conversation_id=conversation_id,
            appointment_id=body.appointment_id,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
            dest_name=dest_name,
            created_by=session_uid,
            created_at=now,
            expires_at=now + CHANNEL_TTL,
            members=[],
        )
        db.add(channel)
        await db.flush()
        # P0-1: 방금 만든 채널이라 참가자가 있을 수 없다 — `channel.members`(lazy selectin) 를
        # flush 직후 동기적으로 다시 읽으면(구 `_find_member` 호출) 실 DB 에서 MissingGreenlet.
    else:
        member = _find_member(channel, session_uid)

    if member is None:
        member = LocationChannelMember(
            channel_id=channel.id,
            user_id=session_uid,
            consented_at=now,
            consent_version=body.consent_version,
        )
        db.add(member)
        channel.members.append(member)
    else:
        member.consented_at = now
        member.consent_version = body.consent_version
        member.left_at = None
        member.lat = None
        member.lng = None
        member.accuracy_m = None
        member.heading = None
        member.speed_mps = None
        member.located_at = None
        member.arrived_at = None

    await db.commit()
    channel = await _load_channel_full(db, channel.id)
    joined_member = _find_member(channel, session_uid)
    # P2: nickname/avatarUrl 을 이벤트에 실어 프론트가 GET state 재조회 없이도 바로 그릴 수 있게.
    await _publish(channel.id, "member_joined", actor_id=session_uid, payload=_member_out(joined_member))
    return _serialize_channel(channel, session_uid)


@router.get("")
async def get_channel_state(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    conv = await _get_conversation(db, conversation_id)
    await _require_conversation_access(db, conv, session_uid)

    channel = await _active_channel_for_conversation(db, conversation_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="No active channel")
    member = _find_member(channel, session_uid)
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=403, detail="Not a channel member")

    now = datetime.now(UTC)
    await _maybe_end_channel(channel, now)
    await db.commit()
    channel = await _load_channel_full(db, channel.id)
    return _serialize_channel(channel, session_uid)


@router.delete("/members/me", status_code=204)
async def leave_channel(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> Response:
    conv = await _get_conversation(db, conversation_id)
    await _require_conversation_membership(db, conv, session_uid)

    channel = await _active_channel_for_conversation(db, conversation_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="No active channel")
    member = _find_member(channel, session_uid)
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=403, detail="Not a channel member")

    now = datetime.now(UTC)
    member.left_at = now
    member.lat = None
    member.lng = None
    member.accuracy_m = None
    member.heading = None
    member.speed_mps = None
    member.located_at = None
    await _publish(channel.id, "member_left", actor_id=session_uid, payload={"userId": str(session_uid)})
    # P1: 나간 사람 본인의 SSE 연결이 아직 열려 있으면 즉시 끊는다(다음 keepalive tick 을 기다리지 않음).
    await location_channel_broadcaster.close_for_user(str(channel.id), str(session_uid))
    await _maybe_end_channel(channel, now)
    await db.commit()
    return Response(status_code=204)


@router.put("/members/me/location")
async def ping_location(
    conversation_id: uuid.UUID,
    body: LocationChannelPingRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    if body.accuracy_m > ACCURACY_MAX_M:
        raise HTTPException(status_code=400, detail="Accuracy too low")

    conv = await _get_conversation(db, conversation_id)
    await _require_conversation_access(db, conv, session_uid)

    member, channel = await _member_and_channel_for_ping(db, conversation_id, session_uid)
    if member is None or channel is None:
        raise HTTPException(status_code=403, detail="Not a channel member")
    if channel.ended_at is not None:
        raise HTTPException(status_code=410, detail="Channel ended")

    now = datetime.now(UTC)
    member.lat = Decimal(str(body.lat))
    member.lng = Decimal(str(body.lng))
    member.accuracy_m = body.accuracy_m
    member.heading = body.heading
    member.speed_mps = body.speed_mps
    member.located_at = now
    await _publish(
        channel.id,
        "location",
        actor_id=session_uid,
        payload={
            "userId": str(session_uid),
            "lat": body.lat,
            "lng": body.lng,
            "accuracyM": body.accuracy_m,
            "heading": body.heading,
            "speedMps": body.speed_mps,
            "locatedAt": now.isoformat(),
        },
    )

    if channel.dest_lat is not None and channel.dest_lng is not None and member.arrived_at is None:
        distance = haversine_m(float(member.lat), float(member.lng), float(channel.dest_lat), float(channel.dest_lng))
        if distance <= ARRIVAL_RADIUS_M:
            member.arrived_at = now
            await _publish(channel.id, "arrived", actor_id=session_uid, payload={"userId": str(session_uid)})

    await _maybe_end_channel(channel, now)
    await db.commit()
    channel = await _load_channel_full(db, channel.id)
    return _serialize_channel(channel, session_uid)


@router.put("/destination")
async def set_destination(
    conversation_id: uuid.UUID,
    body: LocationChannelDestinationRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    conv = await _get_conversation(db, conversation_id)
    await _require_conversation_access(db, conv, session_uid)

    channel = await _active_channel_for_conversation(db, conversation_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="No active channel")
    member = _find_member(channel, session_uid)
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=403, detail="Not a channel member")

    active_members = [m for m in channel.members if m.left_at is None]
    if channel.dest_lat is not None and len(active_members) != 1:
        raise HTTPException(status_code=409, detail={"code": "proposal_required"})

    channel.dest_lat = Decimal(str(body.lat))
    channel.dest_lng = Decimal(str(body.lng))
    channel.dest_name = body.name
    await db.commit()
    await _publish(
        channel.id,
        "dest_set",
        actor_id=session_uid,
        payload={"lat": body.lat, "lng": body.lng, "name": body.name},
    )
    channel = await _load_channel_full(db, channel.id)
    return _serialize_channel(channel, session_uid)


@router.get("/events")
async def channel_events(
    conversation_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> StreamingResponse:
    conv = await _get_conversation(db, conversation_id)
    await _require_conversation_access(db, conv, session_uid)

    channel = await _active_channel_for_conversation(db, conversation_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="No active channel")
    member = _find_member(channel, session_uid)
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=403, detail="Not a channel member")

    channel_id = channel.id
    snapshot_envelope = {
        "type": "snapshot",
        "channelId": str(channel_id),
        "at": datetime.now(UTC).isoformat(),
        "payload": _serialize_channel(channel, session_uid),
    }

    async def stream():
        yield f"data: {json.dumps(snapshot_envelope, default=str)}\n\n"
        async with location_channel_broadcaster.subscribe(str(channel_id), str(session_uid)) as queue:
            while True:
                if await request.is_disconnected():
                    return
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    # P1: 큐에 신호가 없어도 15초마다 멤버십을 재확인한다 — 핸드셰이크 때만
                    # 검사하면 나간 뒤에도(다른 경로로) 계속 수신할 수 있는 문제가 있었다.
                    if not await _is_active_member(db, channel_id, session_uid):
                        return
                    yield ": keepalive\n\n"
                    continue
                if event.get("type") == "_stream_closed":
                    return
                yield f"data: {json.dumps(event, default=str)}\n\n"
                if event.get("type") == "channel_ended":
                    return

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
