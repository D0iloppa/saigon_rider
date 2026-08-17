"""퍼널 계측 일별 롤업 배치 — funnel_events → funnel_daily_stats (정본 §5 #5, D-18(a)).

rollup_ad_stats.py 와 같은 패턴이다. 매일 00:25 ICT(rollup_ad_stats 00:20 과 겹치지 않게 5분
뒤로 배치)에 **전날(VN 로컬) 하루 전체**를 funnel_events 에서 재집계해 funnel_daily_stats 에
upsert 한다. "해당 일자 전체 재계산 후 upsert" 방식이라 같은 날짜를 여러 번 돌려도 값이
그대로다(증분 합산이 아니므로 멱등 — main.py 의 다른 배치들처럼 max_instances=1 + coalesce=True
로 등록해 중복 실행 자체도 막는다).

시간대: 서비스 대상이 베트남이라 일별 경계를 Asia/Ho_Chi_Minh 기준으로 자른다 —
funnel_events.stat_date 는 이미 적재 시점(services/funnel_events.py)에 VN 로컬 일자로 계산해
저장하므로, 이 배치는 그 컬럼으로 단순 GROUP BY 하면 된다.
"""

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..database import AsyncSessionLocal
from ..models import FunnelDailyStat, FunnelEvent

log = logging.getLogger(__name__)

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


async def _rollup_date(target: date) -> int:
    """target(VN 로컬 stat_date) 하루치를 재집계해 upsert. 반영된 (event_type) 행 수 반환."""
    async with AsyncSessionLocal() as db:
        stmt = (
            select(FunnelEvent.event_type, func.count().label("event_count"))
            .where(FunnelEvent.stat_date == target)
            .group_by(FunnelEvent.event_type)
        )
        rows = (await db.execute(stmt)).all()
        if not rows:
            return 0

        for row in rows:
            insert_stmt = pg_insert(FunnelDailyStat).values(
                stat_date=target,
                event_type=row.event_type,
                event_count=row.event_count,
            )
            update_cols = {"event_count": insert_stmt.excluded.event_count, "updated_at": func.now()}
            await db.execute(
                insert_stmt.on_conflict_do_update(index_elements=["stat_date", "event_type"], set_=update_cols)
            )
        await db.commit()
        return len(rows)


async def rollup_funnel_stats(days_back: int = 1) -> bool:
    """스케줄러 잡 진입점 — 기본은 "어제"(VN) 1일치 재계산.

    days_back>1 로 호출하면 최근 며칠을 함께 재계산한다(지연 도착 이벤트 흡수용 수동 백필).
    각 날짜는 전체 재계산 후 upsert 이므로 여러 날을 반복 호출해도 안전(멱등).
    """
    today_vn = datetime.now(_VN_TZ).date()
    try:
        total = 0
        for offset in range(1, days_back + 1):
            target = today_vn - timedelta(days=offset)
            total += await _rollup_date(target)
        log.info("funnel_daily_stats rollup done: days_back=%s, %s event_type rows upserted", days_back, total)
        return True
    except Exception:
        log.exception("funnel_daily_stats rollup failed")
        return False
