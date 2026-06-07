"""퀘스트 검증 전략 패키지 — import 시 validator 를 registry 에 등록한다."""
from __future__ import annotations

from .base import (
    EventSignal,
    GpsSignal,
    QuestValidator,
    Signal,
    ValidationResult,
    ValidatorRegistry,
    registry,
)
from .checkpoint import CheckpointValidator
from .count_distinct import CountDistinctValidator
from .count_event import CountEventValidator
from .distance import DistanceValidator

registry.register(DistanceValidator())
registry.register(CheckpointValidator())
registry.register(CountEventValidator())
registry.register(CountDistinctValidator())

__all__ = [
    "EventSignal",
    "GpsSignal",
    "QuestValidator",
    "Signal",
    "ValidationResult",
    "ValidatorRegistry",
    "registry",
    "CheckpointValidator",
    "CountDistinctValidator",
    "CountEventValidator",
    "DistanceValidator",
]
