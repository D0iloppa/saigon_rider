import hashlib
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import IdempotencyKey


class IdempotencyConflictError(Exception):
    pass


def _request_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


async def claim_or_replay(
    db: AsyncSession,
    *,
    idempotency_key: str,
    operation: str,
    user_uuid: str,
    payload: dict,
) -> dict | None:
    request_hash = _request_hash(payload)
    stmt = (
        pg_insert(IdempotencyKey)
        .values(
            idempotency_key=idempotency_key,
            resource_type=operation,
            external_user_uuid=user_uuid,
            request_hash=request_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.sre_idempotency_ttl_days),
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
    )
    inserted = await db.execute(stmt)
    if inserted.rowcount == 1:
        return None

    existing = (
        await db.execute(select(IdempotencyKey).where(IdempotencyKey.idempotency_key == idempotency_key))
    ).scalar_one()
    if (
        existing.resource_type != operation
        or existing.external_user_uuid != user_uuid
        or existing.request_hash != request_hash
        or existing.response_json is None
    ):
        raise IdempotencyConflictError("Idempotency key already used for a different or incomplete request")
    return existing.response_json


async def store_response(db: AsyncSession, idempotency_key: str, response: dict) -> None:
    await db.execute(
        update(IdempotencyKey)
        .where(IdempotencyKey.idempotency_key == idempotency_key)
        .values(response_json=response)
    )
