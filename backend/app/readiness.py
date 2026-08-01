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
                      to_regclass('public.notification_outbox') IS NOT NULL AS notification_outbox_ok,
                      EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='admin_accounts'
                          AND column_name='role'
                      ) AS admin_role_ok,
                      to_regclass('public.ad_tiers') IS NOT NULL AS ad_tiers_ok,
                      EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='marketplace_ads'
                          AND column_name='tier_id'
                      ) AS marketplace_ads_tier_ok,
                      EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='business_profile'
                          AND column_name='verification_status'
                      ) AS biz_verification_ok,
                      to_regclass('public.business_follow') IS NOT NULL AS business_follow_ok,
                      to_regclass('public.ad_events') IS NOT NULL AS ad_events_ok,
                      to_regclass('public.ad_daily_stats') IS NOT NULL AS ad_daily_stats_ok,
                      to_regclass('public.business_price') IS NOT NULL AS business_price_ok,
                      EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='flood_risk_daily'
                          AND column_name='is_stale'
                      ) AS flood_risk_stale_ok
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
