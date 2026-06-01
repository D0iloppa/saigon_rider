"""퀘스트 카드 달성 체크 — GPS 수신마다 호출."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from math import atan2, cos, radians, sin, sqrt

from sqlalchemy import Date, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.enums import QuestCardStatusEnum, QuestCardTypeEnum
from app.models import SreQuestCard, SreUser
from app.schemas import DailySlotInfo
from app.services import seed_config

log = logging.getLogger(__name__)


async def update(user_id: int, lat: float, lng: float, distance_m: float) -> list[int]:
    async with AsyncSessionLocal() as db:
        active_cards = await _get_active_cards(db, user_id)
        completed_ids: list[int] = []
        has_coord = not (lat == 0 and lng == 0)
        now = datetime.now(timezone.utc)

        for card in active_cards:
            # ── 라이브 텔레메트리 갱신 (모든 카드 공통) ──
            if has_coord:
                prev_ts = card.last_gps_at
                dt = (now - prev_ts).total_seconds() if prev_ts is not None else 0.0
                if distance_m > 0 and dt > 0:
                    card.last_speed_kmh = round(distance_m / dt * 3.6, 2)
                elif distance_m <= 0:
                    card.last_speed_kmh = 0.0
                # dt == 0 (첫 핑) 케이스는 이전 값 유지

                card.last_lat = lat
                card.last_lng = lng
                card.last_gps_at = now

                if card.card_type == QuestCardTypeEnum.CHECKPOINT \
                        and card.target_lat is not None and card.target_lng is not None:
                    card.distance_to_target_m = int(
                        _haversine(lat, lng, float(card.target_lat), float(card.target_lng))
                    )

            # ── 달성 판정 ──
            if card.card_type == QuestCardTypeEnum.DISTANCE:
                if distance_m <= 0:
                    continue
                card.current_distance_m += int(distance_m)
                if card.current_distance_m >= card.target_distance_m:
                    await _complete_card(card)
                    completed_ids.append(card.card_id)

            elif card.card_type == QuestCardTypeEnum.CHECKPOINT:
                if not has_coord or card.distance_to_target_m is None:
                    continue
                threshold = await seed_config.get_seed_int("CHECKPOINT_PROXIMITY_M", 100)
                if card.distance_to_target_m <= threshold:
                    await _complete_card(card)
                    completed_ids.append(card.card_id)

        await db.commit()
    return completed_ids


async def calc_daily_slots(db: AsyncSession, user_id: int) -> DailySlotInfo:
    base = await seed_config.get_seed_int("DAILY_QUEST_BASE_SLOTS", 3)

    result = await db.execute(
        select(SreUser.total_exp_granted).where(SreUser.user_id == user_id)
    )
    total_exp = result.scalar_one_or_none() or 0
    user_level = total_exp // 1000

    bonus_cfg = await seed_config.get_seed_json("DAILY_SLOT_LEVEL_BONUS", {"steps": []})
    level_bonus = 0
    for threshold, bonus in (bonus_cfg or {}).get("steps", []):
        if user_level >= threshold:
            level_bonus += bonus

    item_bonus = 0

    today_vn = func.date(func.timezone("Asia/Ho_Chi_Minh", func.now()))
    result = await db.execute(
        select(func.count()).select_from(SreQuestCard).where(
            SreQuestCard.user_id == user_id,
            SreQuestCard.status.in_([
                QuestCardStatusEnum.ACTIVE,
                QuestCardStatusEnum.COMPLETED,
            ]),
            cast(func.timezone("Asia/Ho_Chi_Minh", SreQuestCard.accepted_at), Date) == today_vn,
        )
    )
    used = result.scalar_one()

    max_slots = base + level_bonus + item_bonus
    return DailySlotInfo(
        max_slots=max_slots,
        used_slots=used,
        remaining=max(0, max_slots - used),
        base=base,
        level_bonus=level_bonus,
        item_bonus=item_bonus,
    )


async def _get_active_cards(db: AsyncSession, user_id: int) -> list[SreQuestCard]:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(SreQuestCard).where(
            SreQuestCard.user_id == user_id,
            SreQuestCard.status == QuestCardStatusEnum.ACTIVE,
            or_(SreQuestCard.expires_at.is_(None), SreQuestCard.expires_at > now),
        )
    )
    return list(result.scalars().all())


async def _complete_card(card: SreQuestCard) -> None:
    card.status = QuestCardStatusEnum.COMPLETED
    card.completed_at = datetime.now(timezone.utc)
    try:
        from app.redis_client import get_redis, STREAM_KEY
        r = await get_redis()
        await r.xadd(STREAM_KEY, {
            "type": "quest_completed",
            "message": json.dumps({
                "card_id": card.card_id,
                "user_id": card.user_id,
                "external_quest_id": card.external_quest_id,
                "user_quest_id": card.user_quest_id,
                "card_type": card.card_type.value,
            }),
        })
    except Exception:
        log.warning("Failed to publish quest_completed event for card=%d", card.card_id)


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))
