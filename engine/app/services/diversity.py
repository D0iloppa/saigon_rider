"""다양성 계수 관리 (business-rules §2)."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BehaviorCategoryLog, UserDiversityScore

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

_MULTIPLIER_TABLE = {0: 1.00, 1: 1.00, 2: 1.20, 3: 1.40, 4: 1.60}
_MAX_MULTIPLIER = 2.00


def _multiplier_for(count: int) -> float:
    return _MULTIPLIER_TABLE.get(count, _MAX_MULTIPLIER)


def month_key(dt: datetime) -> int:
    """YYYYMM 형식 정수 (베트남 시간 기준)."""
    return int(dt.astimezone(VN_TZ).strftime("%Y%m"))


async def get_multiplier(db: AsyncSession, user_id: int, mk: int) -> float:
    row = await db.get(UserDiversityScore, (user_id, mk))
    return float(row.multiplier) if row else 1.00


async def log_category(
    db: AsyncSession,
    *,
    user_id: int,
    category_code: str,
    related_event_id: int,
    occurred_at: datetime,
) -> None:
    mk = month_key(occurred_at)

    # 해당 월에 이 카테고리 첫 진입인지 확인
    existing = await db.execute(
        select(BehaviorCategoryLog.log_id).where(
            BehaviorCategoryLog.user_id == user_id,
            BehaviorCategoryLog.category_code == category_code,
            BehaviorCategoryLog.month_key == mk,
        ).limit(1)
    )
    is_first_entry = existing.scalar_one_or_none() is None

    log = BehaviorCategoryLog(
        user_id=user_id,
        category_code=category_code,
        related_event_id=related_event_id,
        occurred_at=occurred_at,
        month_key=mk,
    )
    db.add(log)
    await db.flush()

    # 첫 카테고리 진입이면 동기 UPSERT (business-rules §2.2 예외)
    if is_first_entry:
        await _recalculate(db, user_id=user_id, mk=mk)


async def _recalculate(db: AsyncSession, user_id: int, mk: int) -> None:
    from sqlalchemy import func, distinct

    count_result = await db.execute(
        select(func.count(distinct(BehaviorCategoryLog.category_code))).where(
            BehaviorCategoryLog.user_id == user_id,
            BehaviorCategoryLog.month_key == mk,
        )
    )
    active_count = count_result.scalar_one() or 0
    multiplier = _multiplier_for(active_count)

    stmt = pg_insert(UserDiversityScore).values(
        user_id=user_id,
        month_key=mk,
        active_category_count=active_count,
        multiplier=multiplier,
    ).on_conflict_do_update(
        index_elements=["user_id", "month_key"],
        set_={
            "active_category_count": active_count,
            "multiplier": multiplier,
            "last_calculated_at": datetime.now(VN_TZ),
        },
    )
    await db.execute(stmt)
