"""admin JSON API — 퍼널 계측 일별 단계 수 조회 (정본 §5 #5, D-18(a)).

핵심 이벤트 8종(가입·매물조회·등록·문의·가격제안·약속·완료·후기)의 일별 카운트를
funnel_daily_stats 롤업 테이블에서만 읽는다(원시 funnel_events 스캔 금지 — biz.py 의
ad_daily_stats 선례와 동일 관례). 롤업은 jobs/rollup_funnel_stats.py 가 매일 00:25 ICT 에 채운다.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import FunnelDailyStat
from ...schemas import FunnelEventType

router = APIRouter(prefix="/funnel")

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class DailyFunnelPoint(BaseModel):
    date: str
    counts: dict[str, int]


@router.get("/daily", response_model=list[DailyFunnelPoint])
async def get_daily_funnel(
    days: int = Query(14),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    days = max(7, min(90, days))  # 7~90 클램프 (dashboard.py get_daily 와 동일한 관례)
    start_date = datetime.now(_VN_TZ).date() - timedelta(days=days - 1)

    rows = (
        await db.execute(
            select(FunnelDailyStat.stat_date, FunnelDailyStat.event_type, FunnelDailyStat.event_count).where(
                FunnelDailyStat.stat_date >= start_date
            )
        )
    ).all()
    counts_by_day: dict = {}
    for stat_date, event_type, event_count in rows:
        counts_by_day.setdefault(stat_date, {})[event_type] = event_count

    all_types = [t.value for t in FunnelEventType]
    return [
        DailyFunnelPoint(
            date=d.isoformat(),
            counts={t: counts_by_day.get(d, {}).get(t, 0) for t in all_types},
        )
        for d in (start_date + timedelta(days=i) for i in range(days))
    ]
