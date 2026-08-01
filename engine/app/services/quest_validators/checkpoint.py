"""CHECKPOINT — 목표 좌표 근접거리 ≤ 임계값(seed CHECKPOINT_PROXIMITY_M)."""
from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt

from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import QuestCardTypeEnum
from app.models import SreQuestCard
from app.services import seed_config

from .base import GpsSignal, QuestValidator, Signal, ValidationResult


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


class CheckpointValidator(QuestValidator):
    card_type = QuestCardTypeEnum.CHECKPOINT

    def accepts(self, signal: Signal) -> bool:
        return isinstance(signal, GpsSignal)

    async def on_signal(
        self, card: SreQuestCard, signal: Signal, db: AsyncSession
    ) -> ValidationResult:
        # 좌표 없는 핑(0,0)은 평가하지 않는다 (기존 has_coord 가드).
        if not isinstance(signal, GpsSignal) or (signal.lat == 0 and signal.lng == 0):
            return ValidationResult()
        target_lat = card.criteria.get("target_lat")
        target_lng = card.criteria.get("target_lng")
        if target_lat is None or target_lng is None:
            return ValidationResult()
        card.distance_to_target_m = int(
            _haversine(signal.lat, signal.lng, float(target_lat), float(target_lng))
        )
        threshold = await seed_config.get_seed_int("CHECKPOINT_PROXIMITY_M", 100)
        return ValidationResult(completed=card.distance_to_target_m <= threshold)
