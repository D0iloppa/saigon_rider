"""정비소 리뷰 통계 materialized view 주기 갱신."""

import logging

from sqlalchemy import text

from ..database import engine

log = logging.getLogger(__name__)


async def refresh_repair_shop_stats() -> bool:
    try:
        async with engine.connect() as connection:
            autocommit = await connection.execution_options(isolation_level="AUTOCOMMIT")
            await autocommit.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY repair_shop_stats"))
        log.info("repair_shop_stats materialized view refreshed")
        return True
    except Exception:
        log.exception("repair_shop_stats materialized view refresh failed")
        return False
