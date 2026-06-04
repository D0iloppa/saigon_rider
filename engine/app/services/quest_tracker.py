"""퀘스트 카드 달성 체크 — 신호(Signal) 기반 validator 디스패치."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import Date, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.enums import QuestCardStatusEnum
from app.models import SreQuestCard, SreUser
from app.schemas import DailySlotInfo
from app.services import equip_effects, seed_config
from app.services.quest_validators import EventSignal, GpsSignal, Signal, registry

log = logging.getLogger(__name__)


async def update(user_id: int, lat: float, lng: float, distance_m: float) -> list[int]:
    """GPS 수신 시 진입점 — GpsSignal 로 변환해 디스패치."""
    return await dispatch(user_id, GpsSignal(lat=lat, lng=lng, distance_m=distance_m))


async def dispatch_event(user_id: int, kind: str, payload: dict | None = None) -> list[int]:
    """비-GPS 도메인 이벤트 진입점 — EventSignal 로 디스패치."""
    return await dispatch(user_id, EventSignal(kind=kind, payload=payload or {}))


async def dispatch(user_id: int, signal: Signal) -> list[int]:
    async with AsyncSessionLocal() as db:
        active_cards = await _get_active_cards(db, user_id)
        completed_ids: list[int] = []
        now = datetime.now(timezone.utc)

        for card in active_cards:
            validator = registry.get(card.card_type)
            if validator is None or not validator.accepts(signal):
                continue

            # GPS 공통 텔레메트리 (속도·last_*)
            if isinstance(signal, GpsSignal):
                _update_gps_telemetry(card, signal, now)

            result = await validator.on_signal(card, signal, db)
            if result.completed:
                await _complete_card(card)
                completed_ids.append(card.card_id)

        await db.commit()
    return completed_ids


def _update_gps_telemetry(card: SreQuestCard, signal: GpsSignal, now: datetime) -> None:
    if signal.lat == 0 and signal.lng == 0:
        return  # 좌표 없는 핑은 텔레메트리 갱신하지 않음
    prev_ts = card.last_gps_at
    dt = (now - prev_ts).total_seconds() if prev_ts is not None else 0.0
    if signal.distance_m > 0 and dt > 0:
        card.last_speed_kmh = round(signal.distance_m / dt * 3.6, 2)
    elif signal.distance_m <= 0:
        card.last_speed_kmh = 0.0
    # dt == 0 (첫 핑) 케이스는 이전 값 유지

    card.last_lat = signal.lat
    card.last_lng = signal.lng
    card.last_gps_at = now


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

    item_bonus = (await equip_effects._resolve_by_user_id(db, user_id)).quest_slot_bonus

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
