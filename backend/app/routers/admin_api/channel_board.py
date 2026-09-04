"""admin JSON API — 채널 성과 통합보드 (줍고 이식 P6, 최종).

분산된 analytics 화면(퍼널·유동성·리텐션·비회원 first-touch)을 한 화면에서 훑어보는
요약 진입점. 각 슬롯은 기존 라우터의 함수를 그대로 재사용해 값을 채운다 — 새 집계 로직을
만들지 않는다. 소스 하나가 실패해도 나머지 슬롯은 정상 반환되도록 슬롯별로 예외를 격리한다.
유튜브/블로그는 실연동이 없어 항상 not_wired 로 고정한다.
"""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import AsyncSessionLocal
from ...models import User
from . import funnel as funnel_router
from . import liquidity as liquidity_router
from . import retention as retention_router
from .metric_status import MetricStatus

router = APIRouter(prefix="/analytics")

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class ChannelSlot(BaseModel):
    key: str
    label: str
    status: MetricStatus
    headline: float | int | None
    detail_path: str | None


class ChannelBoardOut(BaseModel):
    generated_at: datetime
    slots: list[ChannelSlot]


def _status(total: float) -> MetricStatus:
    """단순 판정: 합계 > 0 이면 live, 0 이면 cold (partial/stale 은 이번 슬롯엔 판정 근거가 없어 미사용)."""
    return MetricStatus(state="live" if total > 0 else "cold")


async def _funnel_daily_slot(session: AdminSession, db: AsyncSession) -> ChannelSlot:
    points = await funnel_router.get_daily_funnel(days=7, _session=session, db=db)
    total = sum(sum(p.counts.values()) for p in points)
    return ChannelSlot(
        key="funnel_daily",
        label="퍼널(가입~전환)",
        status=_status(total),
        headline=total,
        detail_path="/analytics/funnel",
    )


async def _segmented_slot(session: AdminSession, db: AsyncSession) -> ChannelSlot:
    rows = await funnel_router.get_segmented_funnel(days=56, acq_source=None, persona=None, _session=session, db=db)
    total = sum(r.signups for r in rows)
    return ChannelSlot(
        key="segmented", label="세그먼트 분석", status=_status(total), headline=total, detail_path="/analytics/funnel"
    )


async def _referrals_slot(session: AdminSession, db: AsyncSession) -> ChannelSlot:
    since = datetime.now(_VN_TZ) - timedelta(days=90)
    count = (
        await db.execute(
            select(func.count()).select_from(User).where(User.acquisition_source.like("u:%"), User.created_at >= since)
        )
    ).scalar_one()
    return ChannelSlot(
        key="referrals", label="초대(리퍼럴)", status=_status(count), headline=count, detail_path="/analytics/funnel"
    )


async def _retention_slot(session: AdminSession, db: AsyncSession) -> ChannelSlot:
    cohorts = await retention_router.get_retention_cohorts(weeks=8, _session=session, db=db)
    total_population = sum(c.population for c in cohorts)
    # cohorts 는 최신 주차부터 내림차순 정렬(retention.py ORDER BY cohort_week DESC) — 최신
    # 코호트는 아직 d7 미경과라 d7_retention 이 None 인 경우가 많다. None 이 아닌 첫(=가장 최신
    # 유효) 코호트를 headline 으로 쓴다.
    headline = next((c.d7_retention for c in cohorts if c.d7_retention is not None), None)
    return ChannelSlot(
        key="retention",
        label="리텐션",
        status=_status(total_population),
        headline=headline,
        detail_path="/analytics/retention",
    )


async def _liquidity_slot(session: AdminSession, db: AsyncSession) -> ChannelSlot:
    panel = await liquidity_router.get_liquidity_panel(
        weeks=8, ward_id=None, include_demo=False, _session=session, db=db
    )
    total = sum(r.sample_listings for r in panel.listings)
    return ChannelSlot(
        key="liquidity",
        label="유동성(매물회전)",
        status=_status(total),
        headline=total,
        detail_path="/analytics/liquidity",
    )


async def _first_touch_slot(session: AdminSession, db: AsyncSession) -> ChannelSlot:
    out = await funnel_router.get_first_touch(days=90, _session=session, db=db)
    total = sum(r.anon_count for r in out.rows)
    return ChannelSlot(
        key="first_touch",
        label="비회원 유입경로",
        status=_status(total),
        headline=total,
        detail_path="/analytics/first-touch",
    )


_NOT_WIRED = MetricStatus(state="not_wired")

_SlotBuilder = Callable[[AdminSession, AsyncSession], Awaitable[ChannelSlot]]

_SLOT_BUILDERS: list[tuple[str, str, str, _SlotBuilder]] = [
    ("funnel_daily", "퍼널(가입~전환)", "/analytics/funnel", _funnel_daily_slot),
    ("segmented", "세그먼트 분석", "/analytics/funnel", _segmented_slot),
    ("referrals", "초대(리퍼럴)", "/analytics/funnel", _referrals_slot),
    ("retention", "리텐션", "/analytics/retention", _retention_slot),
    ("liquidity", "유동성(매물회전)", "/analytics/liquidity", _liquidity_slot),
    ("first_touch", "비회원 유입경로", "/analytics/first-touch", _first_touch_slot),
]


async def _run_slot(entry: tuple[str, str, str, _SlotBuilder], session: AdminSession) -> ChannelSlot:
    """지적 7: 6개 슬롯은 서로 데이터 의존관계가 없어 병렬 실행한다.

    AsyncSession 은 여러 코루틴에서 동시에 쓸 수 없으므로(같은 세션을 공유하면 SQLAlchemy 가
    깨진다), 슬롯마다 독립 세션을 연다 — services/funnel_events.py·location_eta.py 와 같은
    "요청 스코프 세션을 넘기지 않고 직접 AsyncSessionLocal() 을 여는" 기존 패턴을 그대로 따른다.
    실패 격리는 기존과 동일하게 슬롯 단위 try/except 로 유지한다.
    """
    key, label, detail_path, builder = entry
    try:
        async with AsyncSessionLocal() as db:
            return await builder(session, db)
    except Exception:
        # 소스별 실패 격리 — 한 슬롯이 죽어도 나머지는 정상 반환한다.
        return ChannelSlot(
            key=key, label=label, status=MetricStatus(state="cold"), headline=None, detail_path=detail_path
        )


@router.get("/channel-board", response_model=ChannelBoardOut)
async def get_channel_board(
    _session: AdminSession = Depends(verify_admin_api),
):
    slots: list[ChannelSlot] = list(await asyncio.gather(*(_run_slot(entry, _session) for entry in _SLOT_BUILDERS)))

    slots.append(ChannelSlot(key="youtube", label="유튜브 성과", status=_NOT_WIRED, headline=None, detail_path=None))
    slots.append(ChannelSlot(key="blog", label="블로그 성과", status=_NOT_WIRED, headline=None, detail_path=None))

    return ChannelBoardOut(generated_at=datetime.now(_VN_TZ), slots=slots)
