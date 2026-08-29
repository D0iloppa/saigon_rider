"""강퇴/차단 시 실시간 위치공유 채널 이탈 처리 — dm.py/market.py 에서 호출하는 서비스.

SoT: ai-docs/task/active/260829_live_location_channel_task.md §7 개인정보 불변식.
push 전 코드리뷰(2026-08-29, effort high) 확정 P0 — `routers/dm.py` 의 멤버 제거/밴/자발적
나가기, `routers/market.py` 의 1:1 사용자 차단이 `location_channel_members` 를 건드리지 않아
이미 열린 SSE 스트림이 계속 상대 좌표를 수신하고(재연결만 403), `members_left` 자동종료도 되지
않던 구멍을 막는다.

`routers/location_channels.py` 를 직접 import 하지 않는다 — dm.py/market.py 가 그 라우터를
참조하면 순환참조가 생긴다(그 라우터는 dm_policy 등 서비스만 참조하고 dm.py/market.py 를
참조하지 않는다). 대신 이 서비스가 `location_channel_lifecycle.resolve_end_reason`(순수함수)
과 `location_channel_broadcast`/`location_eta`(서비스)만 사용해 그 라우터의 leave/차단종료
로직을 재구현한다.

호출부(다른 도메인의 성공 경로) 이미 커밋된 뒤에 호출되며, 실패는 로그만 남기고 삼킨다 —
위치채널 정리 실패가 강퇴·차단 같은 원 요청의 성공에 영향을 주면 안 된다.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import LocationChannel
from . import location_eta
from .location_channel_broadcast import location_channel_broadcaster
from .location_channel_lifecycle import resolve_end_reason

log = logging.getLogger(__name__)


async def _publish(channel_id: uuid.UUID, event_type: str, *, actor_id: uuid.UUID | None = None, payload: dict) -> None:
    envelope: dict = {
        "type": event_type,
        "channelId": str(channel_id),
        "at": datetime.now(UTC).isoformat(),
        "payload": payload,
    }
    if actor_id is not None:
        envelope["actorId"] = str(actor_id)
    await location_channel_broadcaster.publish(str(channel_id), envelope)


async def _active_channel(db: AsyncSession, conversation_id: uuid.UUID) -> LocationChannel | None:
    result = await db.execute(
        select(LocationChannel).where(
            LocationChannel.conversation_id == conversation_id,
            LocationChannel.ended_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _null_coords(member) -> None:
    member.lat = None
    member.lng = None
    member.accuracy_m = None
    member.heading = None
    member.speed_mps = None
    member.located_at = None


async def _maybe_end_channel(channel: LocationChannel, now: datetime) -> bool:
    """`routers/location_channels.py::_maybe_end_channel` 과 동일한 자동종료 3중 판정(§7-2)."""
    if channel.ended_at is not None:
        return False
    active_members = [m for m in channel.members if m.left_at is None]
    reason = resolve_end_reason(channel, active_members, now)
    if reason is None:
        return False
    channel.ended_at = now
    channel.end_reason = reason
    for m in channel.members:
        await _null_coords(m)
    await _publish(channel.id, "channel_ended", payload={"endReason": reason})
    return True


async def force_leave(db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID, reason: str) -> None:
    """강퇴/밴/자발적 나가기 성공 직후 호출 — 활성 위치채널 멤버십이 있으면 즉시 이탈 처리한다.

    좌표 즉시 NULL + `member_left` 방송 + 해당 사용자 SSE 큐 즉시 종료(`close_for_user`) +
    자동종료 재평가. `reason` 은 로그 식별용(예: "kicked"/"left"/"banned")이며 채널 `end_reason`
    과는 별개다(그건 `_maybe_end_channel` 이 `resolve_end_reason` 으로 따로 판정).
    """
    try:
        channel = await _active_channel(db, conversation_id)
        if channel is None:
            return
        member = next((m for m in channel.members if m.user_id == user_id), None)
        if member is None or member.left_at is not None:
            return

        now = datetime.now(UTC)
        member.left_at = now
        await _null_coords(member)
        await _publish(channel.id, "member_left", actor_id=user_id, payload={"userId": str(user_id)})
        await location_eta.enqueue_live_activity_update(db, channel.id)
        await location_channel_broadcaster.close_for_user(str(channel.id), str(user_id))
        if await _maybe_end_channel(channel, now):
            await location_eta.enqueue_live_activity_update(db, channel.id, immediate=True)
        await db.commit()
    except Exception:
        log.exception(
            "location_channel_membership.force_leave failed: conversation_id=%s user_id=%s reason=%s",
            conversation_id,
            user_id,
            reason,
        )


async def end_for_block(db: AsyncSession, conversation_id: uuid.UUID) -> None:
    """1:1 사용자 차단 성공 직후 호출 — 활성 위치채널이 있으면 즉시 `end_reason='blocked'` 종료.

    (Phase 1 `routers/location_channels.py::_require_conversation_access` 의 차단 경로와 동일한
    처리 — 전원 좌표 NULL + `channel_ended` 방송.)
    """
    try:
        channel = await _active_channel(db, conversation_id)
        if channel is None:
            return
        now = datetime.now(UTC)
        channel.ended_at = now
        channel.end_reason = "blocked"
        for m in channel.members:
            await _null_coords(m)
        await location_eta.enqueue_live_activity_update(db, channel.id, immediate=True)
        await db.commit()
        await _publish(channel.id, "channel_ended", payload={"endReason": "blocked"})
    except Exception:
        log.exception("location_channel_membership.end_for_block failed: conversation_id=%s", conversation_id)
