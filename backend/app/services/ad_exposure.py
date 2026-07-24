"""광고 티어의 live 가중치로 만드는 결정적 smooth weighted round-robin."""

from __future__ import annotations

from math import gcd
from typing import Protocol

MAX_SEQUENCE_LENGTH = 120


class _Weightable(Protocol):
    exposure_weight: int
    ad_fee: int


def compute_weights[T: _Weightable](ads: list[T]) -> list[int]:
    """관리자 정책 weight와 확장용 ad_fee를 곱한다. 두 값은 최소 1이다."""
    return [max(1, ad.exposure_weight) * max(1, ad.ad_fee) for ad in ads]


def build_exposure_sequence[T: _Weightable](ads: list[T]) -> list[T]:
    if not ads:
        return []
    if len(ads) == 1:
        return [ads[0]]

    weights = compute_weights(ads)
    divisor = 0
    for weight in weights:
        divisor = gcd(divisor, weight)
    if divisor > 1:
        weights = [weight // divisor for weight in weights]

    total = sum(weights)
    current = [0] * len(ads)
    sequence: list[T] = []
    for _ in range(min(total, MAX_SEQUENCE_LENGTH)):
        best = 0
        for index in range(1, len(ads)):
            if current[index] + weights[index] > current[best] + weights[best]:
                best = index
        for index in range(len(ads)):
            current[index] += weights[index]
        current[best] -= total
        sequence.append(ads[best])
    return sequence
