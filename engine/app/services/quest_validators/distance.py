"""DISTANCE — 누적 이동거리 ≥ 목표거리(criteria.target_distance_m)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import QuestCardTypeEnum
from app.models import SreQuestCard

from .base import GpsSignal, QuestValidator, Signal, ValidationResult


class DistanceValidator(QuestValidator):
    card_type = QuestCardTypeEnum.DISTANCE

    def accepts(self, signal: Signal) -> bool:
        return isinstance(signal, GpsSignal)

    async def on_signal(
        self, card: SreQuestCard, signal: Signal, db: AsyncSession
    ) -> ValidationResult:
        if not isinstance(signal, GpsSignal) or signal.distance_m <= 0:
            return ValidationResult()
        card.current_distance_m += int(signal.distance_m)
        target = card.criteria.get("target_distance_m")
        completed = target is not None and card.current_distance_m >= target
        return ValidationResult(completed=completed)
