"""admin JSON API — 마켓플레이스 유동성 지표 패널 (016 §6-6 #34, 파일럿 성패 판정 기준).

L-1(매물 문의 전환율)·L-2(매물 거래 전환율)·L-4(첫 문의까지 시간)는 #36(listing_state_log,
init/191)과 funnel_events(#16/#21)를 조합해 매물 단위로 계산한다. L-3(검색 0건 비율)은 #21
검색로그(funnel_events event_type='search')만으로 계산한다 — 매물과 무관해 별도 집계.
L-5(주간 신규 활성 판매자)는 marketplace_listings 만으로 계산한다.

원시 이벤트/상태이력을 직접 스캔한다(zero-results·segmented 와 동일한 파일럿 규모 예외 —
016 §12 가 금지한 실시간 대시보드가 아니라 어드민이 필요할 때 조회하는 온디맨드 집계다).

읽기 전용 — marketplace_listings/listing_state_log/funnel_events 어느 것도 쓰지 않는다.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db

router = APIRouter(prefix="/liquidity")

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

# 016 §6-6 제안값 — 대표 확정 전(D-31, §11-1 #3). 확정되면 이 4개 상수만 바꾸면 된다.
# L-5(주간 신규 활성 판매자)는 §6-6 이 정량 목표선을 주지 않고 "우상향"만 요구해 상수가 없다.
_L1_INQUIRY_RATE_TARGET = 0.40
_L2_DEAL_RATE_TARGET = 0.15
_L3_ZERO_RESULT_RATE_TARGET = 0.20
_L4_MEDIAN_HOURS_TARGET = 72.0

# 시연/시드 계정 제외(016 §6-6: "213건 중 188건이 단일 계정인 상태에서 이 필터가 없으면
# 모든 지표가 오염된다"). DB 에 계정유형(시스템/시연/실사용자)을 구분하는 필드가 없어
# (ai-docs/.../W5_listing_trust.md §141 — "DB에 계정 유형을 구분하는 필드가 있는지까지는
# 조사하지 않음") 실측으로 확인한 계정ID를 하드코딩한다(B2 — 튜닝 상수는 하드코딩이 맞다).
# 실측(2026-08-18, 개발 DB): 매물 213건 중 188건이 닉네임 'SaigonRider' 단일 계정 소유.
# 나중에 계정유형 필드가 생기면 이 상수 집합을 그 필드 기반 서브쿼리로 교체한다.
_DEMO_SELLER_IDS = {"d80efb02-8a43-4e55-830a-050d7bf4403b"}  # SaigonRider


class LiquidityTargets(BaseModel):
    l1_inquiry_rate_target: float = _L1_INQUIRY_RATE_TARGET
    l2_deal_rate_target: float = _L2_DEAL_RATE_TARGET
    l3_zero_result_rate_target: float = _L3_ZERO_RESULT_RATE_TARGET
    l4_median_hours_target: float = _L4_MEDIAN_HOURS_TARGET


class ListingLiquidityRow(BaseModel):
    week_start: str
    ward_id: int | None
    sample_listings: int
    l1_inquiry_rate: float | None
    l2_deal_rate: float | None
    l4_median_hours_to_inquiry: float | None
    l5_new_active_sellers: int


class SearchLiquidityRow(BaseModel):
    week_start: str
    total_searches: int
    l3_zero_result_rate: float | None


class LiquidityPanelOut(BaseModel):
    demo_excluded: bool
    targets: LiquidityTargets
    listings: list[ListingLiquidityRow]
    search: list[SearchLiquidityRow]


@router.get("/panel", response_model=LiquidityPanelOut)
async def get_liquidity_panel(
    weeks: int = Query(8),
    ward_id: int | None = Query(default=None),
    include_demo: bool = Query(default=False),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """유동성 지표 패널(L-1~L-5), 구(ward) x 주차 세그먼트.

    include_demo=false(기본) 가 파일럿 판정에 쓸 값이다 — true 로 다시 호출하면 시연 계정
    포함 값을 그대로 볼 수 있어 "제외 전/후"를 비교할 수 있다(같은 필드를 두 벌 만들지 않고
    호출을 두 번 하는 쪽을 택했다 — 매번 둘 다 계산할 필요가 없는 화면이라 더 단순하다).
    """
    weeks = max(1, min(26, weeks))
    since = datetime.now(_VN_TZ) - timedelta(weeks=weeks)

    demo_ids = list(_DEMO_SELLER_IDS)

    listings_stmt = text(
        """
        WITH base AS (
            SELECT
                ml.id AS listing_id,
                ml.seller_id,
                ml.ward_id,
                ml.created_at,
                (date_trunc('week', ml.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS week_start,
                (
                    SELECT min(fe.occurred_at) FROM funnel_events fe
                    WHERE fe.event_type = 'inquiry' AND fe.entity_id = ml.id
                ) AS first_inquiry_at,
                (
                    SELECT min(lsl.created_at) FROM listing_state_log lsl
                    WHERE lsl.listing_id = ml.id AND lsl.to_state IN ('RESERVED', 'SOLD')
                ) AS first_deal_at
            FROM marketplace_listings ml
            WHERE ml.created_at >= :since
              AND (:include_demo OR ml.seller_id::text != ALL(:demo_ids))
              AND ((:ward_id)::smallint IS NULL OR ml.ward_id = (:ward_id)::smallint)
        ),
        flagged AS (
            SELECT
                *,
                (first_inquiry_at IS NOT NULL AND first_inquiry_at <= created_at + interval '14 days')
                    AS inquiry_14d,
                (first_deal_at IS NOT NULL AND first_deal_at <= created_at + interval '30 days')
                    AS deal_30d,
                (EXTRACT(EPOCH FROM (first_inquiry_at - created_at)) / 3600.0) AS hours_to_inquiry
            FROM base
        )
        SELECT
            week_start,
            ward_id,
            count(*) AS sample_listings,
            avg(inquiry_14d::int)::float AS l1_inquiry_rate,
            avg(deal_30d::int)::float AS l2_deal_rate,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY hours_to_inquiry)
                FILTER (WHERE first_inquiry_at IS NOT NULL) AS l4_median_hours,
            count(DISTINCT seller_id) AS l5_new_active_sellers
        FROM flagged
        GROUP BY week_start, ward_id
        ORDER BY week_start DESC, ward_id
        """
    )
    listing_rows = (
        await db.execute(
            listings_stmt,
            {"since": since, "include_demo": include_demo, "demo_ids": demo_ids, "ward_id": ward_id},
        )
    ).all()

    search_stmt = text(
        """
        SELECT
            (date_trunc('week', fe.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS week_start,
            count(*) AS total_searches,
            (count(*) FILTER (WHERE (fe.props->>'result_count')::int = 0))::float
                / NULLIF(count(*), 0) AS l3_zero_result_rate
        FROM funnel_events fe
        WHERE fe.event_type = 'search' AND fe.occurred_at >= :since
        GROUP BY week_start
        ORDER BY week_start DESC
        """
    )
    search_rows = (await db.execute(search_stmt, {"since": since})).all()

    return LiquidityPanelOut(
        demo_excluded=not include_demo,
        targets=LiquidityTargets(),
        listings=[
            ListingLiquidityRow(
                week_start=week_start.isoformat(),
                ward_id=ward_id_val,
                sample_listings=sample_listings,
                l1_inquiry_rate=l1,
                l2_deal_rate=l2,
                l4_median_hours_to_inquiry=l4,
                l5_new_active_sellers=l5,
            )
            for (week_start, ward_id_val, sample_listings, l1, l2, l4, l5) in listing_rows
        ],
        search=[
            SearchLiquidityRow(
                week_start=week_start.isoformat(),
                total_searches=total_searches,
                l3_zero_result_rate=l3,
            )
            for (week_start, total_searches, l3) in search_rows
        ],
    )
