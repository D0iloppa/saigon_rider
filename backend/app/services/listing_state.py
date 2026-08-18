"""매물 상태 전이 로그 헬퍼 — 016 §4-1 #36.

상태가 바뀌는 모든 지점(등록·수동 전이·약속 수락/취소/완료·모더레이션·자동만료)에서
이 함수를 호출해 `listing_state_log`(init/191)에 전이 이력을 남긴다.

funnel_events.record() 와 달리 **별도 세션을 쓰지 않는다** — 이건 유실 허용 가능한 계측이
아니라 도메인 상태 전이와 원자적으로 같이 커밋돼야 하는 이력이다. db.add() 만 하고 커밋은
호출부(도메인 트랜잭션)가 한다.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ListingStateLog


def log_transition(
    db: AsyncSession,
    listing_id: uuid.UUID,
    from_state: str | None,
    to_state: str,
    *,
    actor_type: str,
    actor_id: uuid.UUID | None = None,
    reason: str | None = None,
) -> None:
    db.add(
        ListingStateLog(
            listing_id=listing_id,
            from_state=from_state,
            to_state=to_state,
            actor_type=actor_type,
            actor_id=actor_id,
            reason=reason,
        )
    )
