from sqlalchemy import text

from .database import AsyncSessionLocal
from .engine_client import engine_client
from .services.redis_cache import get_client


async def check_readiness() -> dict[str, str]:
    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    """
                    SELECT
                      to_regclass('public.users') IS NOT NULL AS users_ok,
                      to_regclass('public.user_quests') IS NOT NULL AS quests_ok,
                      to_regclass('public.internal_reward_grants') IS NOT NULL AS grants_ok,
                      EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='user_quests'
                          AND column_name='reward_grant_status'
                      ) AS reward_state_ok,
                      EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='notifications'
                          AND column_name='source_event_id'
                      ) AS notification_event_id_ok,
                      to_regclass('public.uq_notifications_source_event_user') IS NOT NULL
                        AS notification_event_index_ok,
                      to_regclass('public.notification_outbox') IS NOT NULL AS notification_outbox_ok
                    """
                )
            )
        ).one()
        if not all(row):
            raise RuntimeError("required BFF schema is not initialized")

    redis = await get_client()
    if not await redis.ping():
        raise RuntimeError("Redis ping failed")
    await engine_client.check_readiness()
    return {"database": "ready", "redis": "ready", "schema": "ready", "engine": "ready"}
