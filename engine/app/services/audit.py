from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def record(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: int,
    action_code: str,
    actor_user_id: Optional[int] = None,
    before: Optional[dict[str, Any]] = None,
    after: Optional[dict[str, Any]] = None,
) -> AuditLog:
    entry = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        actor_user_id=actor_user_id,
        action_code=action_code,
        before_snapshot=before,
        after_snapshot=after,
    )
    db.add(entry)
    await db.flush()
    return entry
