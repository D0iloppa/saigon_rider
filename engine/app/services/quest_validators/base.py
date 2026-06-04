"""퀘스트 검증 전략 인터페이스 — 신호(Signal) 기반.

검증 로직을 card_type 별 전략(QuestValidator)으로 분리한다.
입력 트리거는 Signal 로 추상화한다: GPS 핑은 GpsSignal, 도메인 이벤트는 EventSignal.
각 Validator 는 자신이 구독하는 Signal 만 처리(accepts)하고, 카드 상태를 갱신한 뒤
달성 여부를 ValidationResult 로 반환한다.

신규 퀘스트 타입 추가 = QuestValidator 구현 1개 + registry 등록. (디스패처 변경 불필요)
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import ClassVar, Union

from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import QuestCardTypeEnum
from app.models import SreQuestCard


@dataclass
class GpsSignal:
    """GPS 핑 — 이동거리·좌표 기반 타입이 구독."""
    lat: float
    lng: float
    distance_m: float


@dataclass
class EventSignal:
    """도메인 이벤트 — 댓글 작성·퀘스트 카운터 등 비-GPS 타입이 구독."""
    kind: str
    payload: dict = field(default_factory=dict)


Signal = Union[GpsSignal, EventSignal]


@dataclass
class ValidationResult:
    completed: bool = False


class QuestValidator(ABC):
    """card_type 1종에 대응하는 검증 전략."""

    card_type: ClassVar[QuestCardTypeEnum]

    @abstractmethod
    def accepts(self, signal: Signal) -> bool:
        """이 validator 가 처리할 신호인지 판정한다."""

    @abstractmethod
    async def on_signal(
        self, card: SreQuestCard, signal: Signal, db: AsyncSession
    ) -> ValidationResult:
        """신호를 받아 카드 상태를 갱신하고 달성 여부를 반환한다."""


class ValidatorRegistry:
    def __init__(self) -> None:
        self._by_type: dict[QuestCardTypeEnum, QuestValidator] = {}

    def register(self, validator: QuestValidator) -> None:
        self._by_type[validator.card_type] = validator

    def get(self, card_type: QuestCardTypeEnum) -> QuestValidator | None:
        return self._by_type.get(card_type)


registry = ValidatorRegistry()
