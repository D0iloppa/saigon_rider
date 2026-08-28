"""지표 상태(«0 ≠ 미측정») 공용 타입 — 배선 여부·표본 커버리지를 값과 함께 실어보내기 위한 최소 헬퍼.

값이 0 인 지표를 "진짜 0(측정됨)"과 "계측 미배선"으로 구분하지 못하면 어드민이 오판한다.
새 프레임워크가 아니라 응답에 얹을 상태 리터럴 + 커버리지 비율 헬퍼 정도만 제공한다.
"""

from typing import Literal

from pydantic import BaseModel

MetricState = Literal["live", "partial", "cold", "not_wired", "stale"]


class MetricStatus(BaseModel):
    state: MetricState
    # partial 상태일 때 표본/모집단 커버리지(0~1). 그 외 상태에서는 보통 None.
    coverage: float | None = None


def coverage_ratio(sample: int, population: int) -> float | None:
    """population 이 0 이면 0% 가 아니라 None(계산 불가) 을 돌려준다."""
    if population <= 0:
        return None
    return sample / population
