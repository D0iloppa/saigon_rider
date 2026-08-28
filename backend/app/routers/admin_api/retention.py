"""admin JSON API — 코호트 리텐션(D1/D7/D30) 히트맵.

코호트 = users.created_at 기준 가입 주차(VN 로컬, liquidity.py 의 week_start 관례와 동일).
리텐션 = 코호트 유저 중 가입일+N일 시점이 이미 지난 유저(eligible) 가운데, last_seen_at 이
가입일+N일 이후로 찍힌 비율(retained/eligible). 아직 N일이 지나지 않은 코호트는 그 열을
null 로 반환한다(0%로 오인 방지 — liquidity.py 의 표본 부족 null 관례와 동일).

읽기 전용, 원시 users 테이블을 직접 스캔한다. 최근 N주(상한 12주)만 대상으로 풀스캔을 막는다.
모집단 5명 미만 코호트는 재식별 위험 완화를 위해 suppressed=true 로 표시(값 자체는 계산해
반환하되 프론트에서 '<5' 로 대체 표기).
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db

router = APIRouter(prefix="/retention")

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
_SUPPRESS_BELOW = 5


class CohortRetentionRow(BaseModel):
    cohort_week: str
    population: int
    suppressed: bool
    d1_retention: float | None
    d7_retention: float | None
    d30_retention: float | None


@router.get("/cohorts", response_model=list[CohortRetentionRow])
async def get_retention_cohorts(
    weeks: int = Query(8),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    weeks = max(1, min(12, weeks))  # 최대 12주 — 전체 테이블 풀스캔 방지
    since = datetime.now(_VN_TZ) - timedelta(weeks=weeks)

    stmt = text(
        """
        WITH base AS (
            SELECT
                id,
                created_at,
                last_seen_at,
                (date_trunc('week', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS cohort_week
            FROM users
            WHERE created_at >= :since
        )
        SELECT
            cohort_week,
            count(*) AS population,
            count(*) FILTER (WHERE created_at + interval '1 day' <= now()) AS d1_eligible,
            count(*) FILTER (
                WHERE created_at + interval '1 day' <= now()
                  AND last_seen_at >= created_at + interval '1 day'
            ) AS d1_retained,
            count(*) FILTER (WHERE created_at + interval '7 day' <= now()) AS d7_eligible,
            count(*) FILTER (
                WHERE created_at + interval '7 day' <= now()
                  AND last_seen_at >= created_at + interval '7 day'
            ) AS d7_retained,
            count(*) FILTER (WHERE created_at + interval '30 day' <= now()) AS d30_eligible,
            count(*) FILTER (
                WHERE created_at + interval '30 day' <= now()
                  AND last_seen_at >= created_at + interval '30 day'
            ) AS d30_retained
        FROM base
        GROUP BY cohort_week
        ORDER BY cohort_week DESC
        """
    )
    rows = (await db.execute(stmt, {"since": since})).all()

    def rate(retained: int, eligible: int) -> float | None:
        return retained / eligible if eligible > 0 else None

    return [
        CohortRetentionRow(
            cohort_week=cohort_week.isoformat(),
            population=population,
            suppressed=population < _SUPPRESS_BELOW,
            d1_retention=rate(d1_retained, d1_eligible),
            d7_retention=rate(d7_retained, d7_eligible),
            d30_retention=rate(d30_retained, d30_eligible),
        )
        for (
            cohort_week,
            population,
            d1_eligible,
            d1_retained,
            d7_eligible,
            d7_retained,
            d30_eligible,
            d30_retained,
        ) in rows
    ]
