"""COUNT_EVENT — 특정 도메인 이벤트(action_code) 발생 횟수 ≥ 목표횟수.

criteria: {"action_code": "<액션코드>", "target_count": <int>}
progress: {"count": <누적 횟수>}

agg='count_event' 패턴 전용. action_code 가 무엇인지(댓글/영수증/공유 등)는
criteria 로 주입받고, validator 는 "EventSignal 횟수 누적" 한 가지만 책임진다.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import QuestCardTypeEnum
from app.models import SreQuestCard

from .base import EventSignal, QuestValidator, Signal, ValidationResult


class CountEventValidator(QuestValidator):
    card_type = QuestCardTypeEnum.COUNT_EVENT

    def accepts(self, signal: Signal) -> bool:
        return isinstance(signal, EventSignal)

    async def on_signal(
        self, card: SreQuestCard, signal: Signal, db: AsyncSession
    ) -> ValidationResult:
        if not isinstance(signal, EventSignal):
            return ValidationResult()
        action_code = card.criteria.get("action_code")
        if not action_code or signal.kind != action_code:
            return ValidationResult()

        count = int((card.progress or {}).get("count", 0)) + 1
        # JSONB 변경 감지를 위해 새 dict 로 재할당 (in-place 변경은 dirty 추적 안 됨)
        card.progress = {**(card.progress or {}), "count": count}

        target = card.criteria.get("target_count")
        completed = target is not None and count >= int(target)
        return ValidationResult(completed=completed)
