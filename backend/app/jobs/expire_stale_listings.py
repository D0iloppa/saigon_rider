"""30일간 갱신(bumped_at) 없는 판매중 매물을 자동 EXPIRED 로 전환한다.

016 §4-1 #36, D-32=(a) 30일 + 복구 가능. 삭제가 아니라 만료 — 판매자는 기존
PATCH /market/listings/{id}/status 로 ON_SALE 복귀 가능(공급 보존, WITHDRAWN 복구와 동일 경로).
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models import MarketplaceListing
from ..services.listing_state import log_transition

log = logging.getLogger(__name__)

_EXPIRE_AFTER = timedelta(days=30)


async def expire_stale_listings() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            cutoff = datetime.now(UTC) - _EXPIRE_AFTER
            listings = (
                (
                    await db.execute(
                        select(MarketplaceListing).where(
                            MarketplaceListing.status == "ON_SALE",
                            MarketplaceListing.bumped_at < cutoff,
                        )
                    )
                )
                .scalars()
                .all()
            )
            now = datetime.now(UTC)
            for listing in listings:
                listing.status = "EXPIRED"
                listing.updated_at = now
                log_transition(db, listing.id, "ON_SALE", "EXPIRED", actor_type="system", reason="auto_30d_stale")
            await db.commit()
        return True
    except Exception:
        log.exception("Expire stale listings batch failed")
        return False
