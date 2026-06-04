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
from .distance import DistanceValidator

registry.register(DistanceValidator())
registry.register(CheckpointValidator())

__all__ = [
    "EventSignal",
    "GpsSignal",
    "QuestValidator",
    "Signal",
    "ValidationResult",
    "ValidatorRegistry",
    "registry",
    "CheckpointValidator",
    "DistanceValidator",
]
