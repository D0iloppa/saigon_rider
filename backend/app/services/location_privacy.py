"""위치 정밀도 판정 공용 서비스.

`app/routers/feed.py::_public_coordinates()` 의 ward-centroid 블러 패턴을 공용 유틸로
승격한 것 — 새 블러 알고리즘을 도입하지 않고 기존에 검증된 패턴을 그대로 재사용한다.
계약은 `app/tests/test_feed_location_privacy.py` 가 고정한다.

거래(약속) 위치공유의 상태별 정밀도 판정(`resolve_precision_level`)도 여기 둔다.
설계서: ai-docs/task/active/260827_deal_location_sharing_task.md §3.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal, Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Ward
from .service_area import in_service_area

PrecisionLevel = Literal["none", "approx", "exact"]

# M-2 확정: exact 창은 약속시각 T-30분 ~ T+60분.
_EXACT_WINDOW_BEFORE = timedelta(minutes=30)
_EXACT_WINDOW_AFTER = timedelta(minutes=60)


async def resolve_nearest_ward(latitude: Decimal, longitude: Decimal, db: AsyncSession) -> Ward | None:
    """서비스 권역 내 가장 가까운 ward centroid를 찾는다. 권역 밖이면 None.

    (구 `feed.py::_nearest_ward` 승격 — 로직 동일.)
    """
    if not in_service_area(latitude, longitude):
        return None
    distance = func.pow(Ward.center_lat - float(latitude), 2) + func.pow(Ward.center_lng - float(longitude), 2)
    return (
        await db.execute(
            select(Ward)
            .where(
                Ward.is_active.is_(True),
                Ward.city_code == "HCMC",
                Ward.center_lat.isnot(None),
                Ward.center_lng.isnot(None),
            )
            .order_by(distance)
            .limit(1)
        )
    ).scalar_one_or_none()


async def to_approx_coords(
    latitude: Decimal | None,
    longitude: Decimal | None,
    ward: Ward | None,
    resolve_ward: Callable[[], Awaitable[Ward | None]],
) -> tuple[Decimal | None, Decimal | None]:
    """원좌표를 ward centroid로 치환한다. ward 미해결 시 (None, None).

    (구 `feed.py::_public_coordinates` 승격 — 로직 동일. `ward` 가 이미 알려져 있으면
    그대로 쓰고, 없으면 `resolve_ward()` 콜백으로 지연 조회한다.)
    """
    if latitude is None or longitude is None:
        return None, None
    if ward is None:
        ward = await resolve_ward()
    if ward is None or ward.center_lat is None or ward.center_lng is None:
        return None, None
    return Decimal(str(ward.center_lat)), Decimal(str(ward.center_lng))


class _AppointmentLike(Protocol):
    status: str
    when_at: datetime
    completion_requested_at: datetime | None


def resolve_precision_level(appointment: _AppointmentLike, now: datetime) -> PrecisionLevel:
    """거래 약속 상태+시각만으로 정밀도 레벨을 판정하는 순수 함수.

    §3 확정 매트릭스(M-1) 그대로 구현. 차단/신고 판정은 이 함수의 책임이 아니다 — 그건
    API 레벨(P3)에서 별도로 처리한다.
    """
    status = appointment.status
    if status == "PROPOSED":
        return "approx"
    if status == "ACCEPTED":
        # 완료 요청됨(아직 COMPLETED 아님) → exact 유지, 시각 무관.
        if appointment.completion_requested_at is not None:
            return "exact"
        window_start = appointment.when_at - _EXACT_WINDOW_BEFORE
        window_end = appointment.when_at + _EXACT_WINDOW_AFTER
        if window_start <= now <= window_end:
            return "exact"
        return "approx"
    if status == "COMPLETED":
        # M-3 확정: 약속 핀은 approx 유지(거래이력 열람용). 실시간좌표 즉시삭제는 별도(P2/P3).
        return "approx"
    if status == "CANCELLED":
        return "none"
    # 알 수 없는 상태 — 안전 우선으로 미노출.
    return "none"
