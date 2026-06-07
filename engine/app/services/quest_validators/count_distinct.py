"""COUNT_DISTINCT — 특정 이벤트의 payload 식별키 기준 서로 다른 값 개수 ≥ 목표.

criteria: {"action_code": "<액션코드>", "distinct_key": "<payload 식별필드>", "target_count": <int>}
progress: {"seen": [<중복제거된 키 목록>]}

예) "정비소 2곳 비교" = MAINTENANCE_RECEIPT 이벤트의 payload.shop_id 가 서로 다른 게 2개 이상.
같은 정비소를 여러 번 인증해도 1개로만 집계된다(count_event 와의 차이).

emitter 가 payload 에 distinct_key 를 실어주지 않으면 집계되지 않는다(진행도 0 유지).
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import QuestCardTypeEnum
from app.models import SreQuestCard

from .base import EventSignal, QuestValidator, Signal, ValidationResult


class CountDistinctValidator(QuestValidator):
    card_type = QuestCardTypeEnum.COUNT_DISTINCT

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

        distinct_key = card.criteria.get("distinct_key")
        if not distinct_key:
            return ValidationResult()
        value = (signal.payload or {}).get(distinct_key)
        if value is None:
            return ValidationResult()  # 식별키 없는 이벤트는 집계 불가

        seen = list((card.progress or {}).get("seen", []))
        if value not in seen:
            seen.append(value)
            # JSONB 변경 감지를 위해 새 dict 재할당
            card.progress = {**(card.progress or {}), "seen": seen}

        target = card.criteria.get("target_count")
        completed = target is not None and len(seen) >= int(target)
        return ValidationResult(completed=completed)
